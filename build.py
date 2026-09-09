"""Build the proposal's static website using Python 3.11+; no packages or network."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
PAGES = {
    "index": ("Open the learning. Protect the learner.", "Mission"),
    "standard": ("Help is useful. Understanding needs evidence.", "The proposal"),
    "open-source": ("Education people can inspect and improve.", "Open source"),
    "contribute": ("Bring one useful change.", "Contribute"),
    "governance": ("A small start. Clear responsibilities.", "Our commitments"),
    "discussion": ("Same support. Different claim.", "Discussion cases"),
    "404": ("Page not found", "Page not found"),
}
DESCRIPTION = "Help build an open education proposal: make instructional help visible, preserve access support, and examine what learners understand later."
LEGACY_OUTPUT_NAMES = {f"{slug}.html" for slug in PAGES if slug != "discussion"} | {"styles.css", "manifest.json", "robots.txt"}
LICENSE_ASSETS = {
    "code-license.txt": "LICENSE",
    "content-license.txt": "LICENSE-CONTENT",
    "attribution.txt": "LICENSES.md",
}
PRE_DOWNLOAD_OUTPUT_NAMES = LEGACY_OUTPUT_NAMES | set(LICENSE_ASSETS)
REVIEW_ASSETS = {"help-and-access-draft.md": "docs/REVIEW-CASES.md"}
PRE_INTERACTIVE_OUTPUT_NAMES = PRE_DOWNLOAD_OUTPUT_NAMES | set(REVIEW_ASSETS)
LAB_ASSETS = (
    "index.html", "app.mjs", "bridge.mjs", "model.mjs", "scene.mjs", "styles.css",
    "proposal-preview.mjs", "vendor/phaser-3.90.0.min.js", "vendor/PHASER-LICENSE.txt",
    "art/fraction-canyon.png", "art/clockwork-room.png", "ASSETS.md",
)
OUTPUT_NAMES = PRE_INTERACTIVE_OUTPUT_NAMES | {"discussion.html"} | {"learning-lab/" + name for name in LAB_ASSETS}
VERSION = "0.1.0"
RELEASE_FIELDS = {"status", "repository", "maintainer", "conduct_contact", "security_contact"}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate release field: {key}")
        result[key] = value
    return result


def release_status() -> str:
    """Read presentation state only; this does not authorize publication."""
    try:
        data = json.loads((ROOT / "release.json").read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError("release.json must be readable JSON with unique fields.") from error
    if (not isinstance(data, dict) or set(data) != RELEASE_FIELDS
            or not all(isinstance(value, str) for value in data.values())
            or data["status"] not in ("candidate", "ready")):
        raise ValueError("release.json must have the documented string fields and candidate or ready status.")
    return data["status"]


def output_version(status: str) -> str:
    return VERSION if status == "ready" else VERSION + "-candidate"


def base_path(value: str) -> str:
    """Accept root or a conservative URL path, never an origin or traversal."""
    if not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*", value):
        raise ValueError("Base must be / or a slash-terminated path such as /open-education-proposal/.")
    return value


def ordinary_path(path: Path) -> None:
    for part in [path, *path.parents]:
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if part.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError(f"Refusing linked output path: {part.name}")
        if part.is_file() and info.st_nlink > 1:
            raise ValueError(f"Refusing multiply linked output file: {part.name}")


def render(slug: str, fragment: str, base: str, *, status: str | None = None) -> str:
    status = release_status() if status is None else status
    if status not in ("candidate", "ready"):
        raise ValueError("Unknown release presentation state.")
    banner = f"Community proposal · v{VERSION}" if status == "ready" else 'Community edition <span>Local review candidate · Not yet released</span>'
    robots = "noindex, nofollow, noarchive" if status == "candidate" else ("noindex, follow" if slug == "404" else "index, follow")
    title, _ = PAGES[slug]
    if slug == "index" and fragment.startswith("<!doctype html>"):
        return fragment.replace("{{base}}", base).replace("{{robots}}", robots).replace("{{banner}}", banner)
    nav = "\n".join(
        f'<a href="{base}{name}.html"' + (' aria-current="page"' if name == slug else '') + f'>{label}</a>'
        for name, (_, label) in PAGES.items() if name != "404" and (name != "discussion" or name == slug)
    )
    fragment = fragment.replace("{{base}}", base)
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{html.escape(DESCRIPTION, quote=True)}">
  <meta name="robots" content="{robots}">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
  <title>{html.escape(title)} · Open Education proposal</title>
  <link rel="stylesheet" href="{base}styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="status-bar"><div class="frame">{banner}</div></div>
  <header class="site-header frame">
    <a class="wordmark" href="{base}index.html" aria-label="Open Education proposal home">Open<br>Education<span class="wordmark-note">An open education proposal.</span></a>
    <nav aria-label="Main navigation">{nav}</nav>
  </header>
  <main id="main" class="frame" tabindex="-1">{fragment}</main>
  <footer class="site-footer frame">
    <div><span class="footer-line">More understanding.<br>More human possibility.</span><p>Education is the mission. Technology is a choice.</p></div>
    <div class="footer-meta"><p>Proposal v{VERSION} · Adult collaboration</p><p>Open Education is a working description.<br>Not an adopted education standard.</p><a href="{base}governance.html#release">Release status &amp; responsibilities</a><p><a href="{base}open-source.html#licenses">Licenses &amp; attribution</a></p></div>
  </footer>
</body>
</html>
'''


def output_inventory(output: Path) -> set[str]:
    """Validate each directory before descending; never follow linked paths."""
    files = set()
    allowed_dirs = {str(parent).replace("\\", "/") for name in OUTPUT_NAMES
                    for parent in Path(name).parents if str(parent) != "."}
    pending = [output]
    while pending:
        for entry in pending.pop().iterdir():
            ordinary_path(entry)
            name = entry.relative_to(output).as_posix()
            if entry.is_dir() and name in allowed_dirs:
                pending.append(entry)
            elif entry.is_file() and name in OUTPUT_NAMES:
                files.add(name)
            else:
                raise ValueError("Output contains unrelated files; choose an empty directory.")
    return files


def build(output: Path, base: str = "/") -> dict[str, str]:
    base = base_path(base)
    status = release_status()  # One snapshot for all pages, robots, and the manifest.
    output = output.absolute()
    ordinary_path(output)
    # An output directory may never be a source directory or one of its ancestors.
    if output == ROOT or output in ROOT.parents or (output.is_relative_to(ROOT) and output != ROOT / ".build"):
        raise ValueError("Output must be a dedicated build directory.")
    if output.exists():
        if not output.is_dir():
            raise ValueError("Output is not a directory.")
        existing_files = output_inventory(output)
        if any(output.iterdir()):
            try:
                previous = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
                if not isinstance(previous, dict):
                    raise ValueError("Unrecognized build manifest.")
                files = previous.get("files")
                if not isinstance(files, dict):
                    raise ValueError("Unrecognized build manifest.")
                legacy = (set(previous) == {"version", "base", "files"}
                          and previous["version"] == "0.1.0-candidate"
                          and set(files) in (LEGACY_OUTPUT_NAMES - {"manifest.json"}, PRE_DOWNLOAD_OUTPUT_NAMES - {"manifest.json"}))
                current = (set(previous) == {"version", "status", "base", "files"}
                           and previous["status"] in ("candidate", "ready")
                           and previous["version"] == output_version(previous["status"])
                           and set(files) in (PRE_DOWNLOAD_OUTPUT_NAMES - {"manifest.json"}, PRE_INTERACTIVE_OUTPUT_NAMES - {"manifest.json"}, OUTPUT_NAMES - {"manifest.json"}))
                if not (legacy or current):
                    raise ValueError("Unrecognized build manifest.")
                base_path(previous["base"])
                if existing_files != set(files) | {"manifest.json"}:
                    raise ValueError("Output does not match its recorded file set; preserve it and choose a new empty directory.")
                for name, digest in files.items():
                    if (not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
                            or hashlib.sha256((output / name).read_bytes()).hexdigest() != digest):
                        raise ValueError("Generated output was modified; preserve it and choose a new empty directory.")
            except (OSError, json.JSONDecodeError, AttributeError, TypeError) as error:
                raise ValueError("Nonempty output must contain this builder's manifest.") from error
    payload = {f"{slug}.html": render(slug, (ROOT / "content" / f"{slug}.html").read_text(encoding="utf-8"), base, status=status).encode("utf-8") for slug in PAGES}
    payload["styles.css"] = (ROOT / "styles.css").read_bytes()
    payload["robots.txt"] = b"User-agent: *\nAllow: /\n" if status == "ready" else b"User-agent: *\nDisallow: /\n"
    payload.update({destination: (ROOT / source).read_bytes() for destination, source in LICENSE_ASSETS.items()})
    payload.update({destination: (ROOT / source).read_bytes() for destination, source in REVIEW_ASSETS.items()})
    for name in LAB_ASSETS:
        source = ROOT / "learning-lab" / name
        ordinary_path(source)
        data = source.read_bytes()
        if name == "index.html":
            robots = "index, follow" if status == "ready" else "noindex, nofollow, noarchive"
            data = data.decode("utf-8").replace("{{base}}", base).replace("{{robots}}", robots).encode("utf-8")
        payload["learning-lab/" + name] = data
    manifest = {name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())}
    payload["manifest.json"] = (json.dumps({"version": output_version(status), "status": status, "base": base, "files": manifest}, indent=2) + "\n").encode("utf-8")
    output.mkdir(parents=True, exist_ok=True)
    for name, data in payload.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        ordinary_path(target)
        target.write_bytes(data)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".build")
    parser.add_argument("--base", default="/")
    args = parser.parse_args()
    try:
        manifest = build(args.output, args.base)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Build failed: {error}\n")
    print(f"Built {len(PAGES)} pages; {len(manifest)} hashed public assets. Local files only; nothing was published.")


if __name__ == "__main__":
    main()
