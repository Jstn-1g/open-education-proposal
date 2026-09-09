"""Check local publication prerequisites; never publishes or verifies human authority."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
FIELDS = {"status", "repository", "maintainer", "conduct_contact", "security_contact"}
ACCOUNT = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
REPOSITORY = re.compile(rf"https://github\.com/({ACCOUNT})/([A-Za-z0-9_.-]+)")
# Known stale release claims only; this does not validate arbitrary factual prose.
CANDIDATE_COPY = re.compile(
    r"local (?:release|review) candidate|not yet released|not yet an open-source release|"
    r"no submission endpoint is active|submissions are not open|no public submission endpoint|"
    r"license\s+approval\s+and\s+repository\s+setup\s+are\s+still\s+pending",
    re.IGNORECASE,
)


def mail_route(value: str) -> bool:
    # A deliberately narrow address shape, without prefilled private report content.
    return bool(re.fullmatch(r"mailto:[A-Za-z0-9.!#$%&'*+/=_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", value))


def check(root: Path = ROOT, *, github_repository: str = "") -> list[str]:
    """Report missing facts, files, and obvious stale copy; does not contact services."""
    errors = []
    try:
        data = json.loads((root / "release.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ["release.json must be a readable JSON object."]
    if not isinstance(data, dict) or set(data) != FIELDS or not all(isinstance(v, str) for v in data.values()):
        return ["release.json must contain exactly the documented string fields."]
    if data["status"] != "ready":
        errors.append("Candidate is not approved for publication: status must be ready after release review.")
    repository = data["repository"]
    match = REPOSITORY.fullmatch(repository)
    if not match or match[2] in {".", ".."}:
        errors.append("Set the confirmed HTTPS GitHub repository URL.")
    elif github_repository and github_repository.casefold() != f"{match[1]}/{match[2]}".casefold():
        errors.append("This workflow is running in a different repository from release.json.")
    if not re.fullmatch(ACCOUNT, data["maintainer"]):
        errors.append("Set the accountable maintainer's confirmed GitHub login.")
    if not mail_route(data["conduct_contact"]):
        errors.append("Set the monitored private conduct mailto address, with permission to publish it.")
    if not (mail_route(data["security_contact"]) or (match and data["security_contact"] == repository + "/security/advisories/new")):
        errors.append("Set a tested private security mailto address or this repository's enabled reporting URL.")

    for name, marker in (("LICENSE", "Apache License"), ("LICENSE-CONTENT", "Creative Commons Attribution 4.0 International")):
        try:
            license_text = (root / name).read_text(encoding="utf-8")
        except OSError:
            errors.append(f"Add the approved complete {name} text and its notices.")
            continue
        if marker not in license_text:
            errors.append(f"{name} does not identify the planned license; review any changed licensing choice.")

    required = ["README.md", "CONTRIBUTING.md", "GOVERNANCE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "LICENSE-PLAN.md"]
    public_copy = {}
    for name in required:
        try:
            public_copy[name] = (root / name).read_text(encoding="utf-8")
        except OSError:
            errors.append(f"Missing public document: {name}.")
    try:
        # Inspect an actual isolated build, including the shared frame, manifest,
        # and robots policy. Developer documentation is not publication copy.
        import importlib.util
        spec = importlib.util.spec_from_file_location("release_site_build", root / "build.py")
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory(prefix="education-release-check-") as temporary:
            output = Path(temporary) / "site"
            builder.build(output)
            for slug in builder.PAGES:
                public_copy[f"{slug}.html"] = (output / f"{slug}.html").read_text(encoding="utf-8")
            public_copy["learning-lab/index.html"] = (output / "learning-lab/index.html").read_text(encoding="utf-8")
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            expected_version = "0.1.0" if data["status"] == "ready" else "0.1.0-candidate"
            if manifest.get("status") != data["status"] or manifest.get("version") != expected_version:
                errors.append("Generated manifest does not match the release status and version.")
            if data["status"] == "ready" and (output / "robots.txt").read_bytes() != b"User-agent: *\nAllow: /\n":
                errors.append("Generated robots.txt must allow indexing for the public launch.")
    except (OSError, AttributeError, ImportError, SyntaxError, TypeError, ValueError):
        errors.append("Could not inspect the generated site; restore build.py and its page sources.")
    for name, copy in public_copy.items():
        if data["status"] != "ready":
            continue  # Candidate presentation is expected; status already blocks release.
        if CANDIDATE_COPY.search(copy):
            errors.append(f"Replace stale candidate-only wording in {name} before publication.")
        if name.endswith(".html") and name != "404.html" and re.search(r'<meta\s+[^>]*name=["\']robots["\'][^>]*noindex', copy, re.IGNORECASE):
            errors.append(f"Remove the candidate noindex policy from {name} for the public launch.")
        if name == "404.html" and not re.search(r'<meta\s+[^>]*name=["\']robots["\'][^>]*noindex', copy, re.IGNORECASE):
            errors.append("Keep the 404 page excluded from indexing.")
    for name, values in {
        "GOVERNANCE.md": [repository, data["maintainer"]],
        "CODE_OF_CONDUCT.md": [data["conduct_contact"]],
        "SECURITY.md": [data["security_contact"]],
    }.items():
        if any(value and value not in public_copy.get(name, "") for value in values):
            errors.append(f"Publish the confirmed release facts in {name}.")
    return errors


def main() -> int:
    errors = check(github_repository=os.environ.get("GITHUB_REPOSITORY", ""))
    if errors:
        print("Publication check: NOT READY")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Local publication checks passed. This does not verify rights, live reporting routes, or hosted behavior.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
