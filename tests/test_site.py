"""Behavior checks for the community proposal; standard library only."""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("proposal_build", ROOT / "build.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
release_spec = importlib.util.spec_from_file_location("proposal_release", ROOT / "release_check.py")
release = importlib.util.module_from_spec(release_spec)
release_spec.loader.exec_module(release)


def external_reference(href):
    target = urlsplit(href)
    if target.scheme == "mailto":
        return release.mail_route(href)
    return target.scheme == "https" and bool(target.hostname) and target.username is None and target.password is None


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.ids = []
        self.links = []
        self.resources = []
        self.headings = []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        self.tags.append((tag, attrs))
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if tag == "link" or "src" in attrs:
            self.resources.append(attrs.get("href", attrs.get("src", "")))
        if re.fullmatch("h[1-6]", tag):
            self.headings.append(int(tag[1]))


class SiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="education-site-test-")
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name) / "site"

    def build(self, base="/"):
        builder.build(self.output, base)
        return {p.name: Document(p.read_text(encoding="utf-8")) for p in self.output.glob("*.html")}

    def release_source(self):
        source = Path(self.temp.name) / "source"
        (source / "content").mkdir(parents=True)
        for path in (ROOT / "content").glob("*.html"):
            (source / "content" / path.name).write_bytes(path.read_bytes())
        for name in ("styles.css", "LICENSE", "LICENSE-CONTENT", "LICENSES.md"):
            (source / name).write_bytes((ROOT / name).read_bytes())
        (source / "docs").mkdir()
        (source / "docs/REVIEW-CASES.md").write_bytes((ROOT / "docs/REVIEW-CASES.md").read_bytes())
        self.release_data = {"status": "candidate", "repository": "https://github.com/test-owner/test-proposal", "maintainer": "test-owner", "conduct_contact": "", "security_contact": ""}
        (source / "release.json").write_text(json.dumps(self.release_data), encoding="utf-8")
        return source

    def test_candidate_ready_and_return_transition_are_consistent(self):
        source = self.release_source()
        with patch.object(builder, "ROOT", source):
            for status in ("candidate", "ready", "ready", "candidate"):
                self.release_data["status"] = status
                (source / "release.json").write_text(json.dumps(self.release_data), encoding="utf-8")
                documents = self.build()
                manifest = json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["status"], status)
                self.assertEqual(manifest["version"], "0.1.0" if status == "ready" else "0.1.0-candidate")
                expected_robots = b"User-agent: *\nAllow: /\n" if status == "ready" else b"User-agent: *\nDisallow: /\n"
                self.assertEqual((self.output / "robots.txt").read_bytes(), expected_robots)
                for name, document in documents.items():
                    policies = [attrs["content"] for tag, attrs in document.tags if tag == "meta" and attrs.get("name") == "robots"]
                    expected = "noindex, nofollow, noarchive" if status == "candidate" else ("noindex, follow" if name == "404.html" else "index, follow")
                    self.assertEqual(policies, [expected])
                    page = (self.output / name).read_text(encoding="utf-8")
                    if status == "ready":
                        self.assertIn("Community proposal · v0.1.0", page)
                        self.assertNotIn("Not yet released", page)
                    else:
                        self.assertIn("Not yet released", page)

    def test_malformed_release_config_fails_before_writing(self):
        source = self.release_source()
        malformed = ["{broken", "[]", "{}", json.dumps({**self.release_data, "status": True}), json.dumps({**self.release_data, "status": "published"}), json.dumps({**self.release_data, "extra": "value"}), json.dumps({**self.release_data, "maintainer": 123}), json.dumps(self.release_data)[:-1] + ', "status": "ready"}']
        with patch.object(builder, "ROOT", source):
            for raw in malformed:
                with self.subTest(raw=raw):
                    (source / "release.json").write_text(raw, encoding="utf-8")
                    with self.assertRaises(ValueError):
                        builder.build(self.output)
                    self.assertFalse(self.output.exists())
            (source / "release.json").unlink()
            with self.assertRaises(ValueError):
                builder.build(self.output)
            self.assertFalse(self.output.exists())

    def test_legacy_candidate_upgrades_to_ready_and_invalid_config_preserves_it(self):
        source = self.release_source()
        self.make_legacy_output()
        self.release_data["status"] = "ready"
        (source / "release.json").write_text(json.dumps(self.release_data), encoding="utf-8")
        with patch.object(builder, "ROOT", source):
            self.build()
            first = {p.name: p.read_bytes() for p in self.output.iterdir()}
            self.assertEqual(json.loads(first["manifest.json"])["version"], "0.1.0")
            self.build()
            self.assertEqual(first, {p.name: p.read_bytes() for p in self.output.iterdir()})
            (source / "release.json").write_text("{broken", encoding="utf-8")
            with self.assertRaises(ValueError):
                builder.build(self.output)
            self.assertEqual(first, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_build_is_deterministic_and_manifest_matches_bytes(self):
        self.build()
        first = {p.name:p.read_bytes() for p in self.output.iterdir()}
        self.build()
        self.assertEqual(first, {p.name:p.read_bytes() for p in self.output.iterdir()})
        manifest = json.loads(first["manifest.json"])
        for name, digest in manifest["files"].items():
            self.assertEqual(digest, hashlib.sha256(first[name]).hexdigest())
        self.assertEqual(len([n for n in first if n.endswith(".html")]), 6)

    def test_every_internal_link_and_fragment_works_at_root_and_project_path(self):
        for base in ("/", "/open-education-proposal/"):
            documents = self.build(base)
            assets = {p.name for p in self.output.iterdir() if p.is_file()}
            for name, doc in documents.items():
                for href in doc.links:
                    target = urlsplit(href)
                    if target.scheme:
                        self.assertTrue(external_reference(href), (name, href))
                        continue
                    self.assertFalse(target.netloc, (name, href))
                    if not target.path:
                        dest = doc
                    else:
                        self.assertTrue(target.path.startswith(base), (name, href))
                        destination = target.path[len(base):]
                        self.assertTrue((self.output / destination).resolve().is_relative_to(self.output.resolve()), (name, href))
                        self.assertIn(destination, assets, (name, href))
                        dest = documents.get(destination)
                    if target.fragment:
                        self.assertIsNotNone(dest, (name, href, "Only HTML documents have checked fragments"))
                        self.assertIn(target.fragment, dest.ids, (name, href))
                self.assertEqual(doc.resources, [base + "styles.css"])

    def test_generated_license_assets_are_exact_source_bytes(self):
        self.build("/open-education-proposal/")
        manifest = json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))
        for destination, source in {
            "code-license.txt": "LICENSE",
            "content-license.txt": "LICENSE-CONTENT",
            "attribution.txt": "LICENSES.md",
        }.items():
            expected = (ROOT / source).read_bytes()
            self.assertEqual((self.output / destination).read_bytes(), expected)
            self.assertEqual(manifest["files"][destination], hashlib.sha256(expected).hexdigest())
        for document in self.build("/open-education-proposal/").values():
            self.assertIn("/open-education-proposal/open-source.html#licenses", document.links)

    def make_legacy_output(self):
        self.output.mkdir()
        names = {"index.html", "standard.html", "open-source.html", "contribute.html", "governance.html", "404.html", "styles.css", "robots.txt"}
        hashes = {}
        for name in names:
            data = f"Legacy generated output: {name}\n".encode("utf-8")
            (self.output / name).write_bytes(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        (self.output / "manifest.json").write_text(json.dumps({"version": "0.1.0-candidate", "base": "/", "files": hashes}) + "\n", encoding="utf-8")
        return names

    def test_missing_review_source_preserves_previous_build_and_creates_nothing(self):
        source = self.release_source()
        self.build()
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        (source / "docs/REVIEW-CASES.md").unlink()
        fresh_output = Path(self.temp.name) / "new-output"
        with patch.object(builder, "ROOT", source):
            for destination in (self.output, fresh_output):
                with self.assertRaises(FileNotFoundError):
                    builder.build(destination)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})
        self.assertFalse(fresh_output.exists())

    def test_legacy_manifest_upgrades_to_complete_license_output(self):
        names = self.make_legacy_output()
        self.build()
        expected = names | {"code-license.txt", "content-license.txt", "attribution.txt", "manifest.json", "help-and-access-draft.md"}
        self.assertEqual({p.name for p in self.output.iterdir()}, expected)
        first = {p.name: p.read_bytes() for p in self.output.iterdir()}
        self.build()
        self.assertEqual(first, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_modified_legacy_output_is_preserved(self):
        self.make_legacy_output()
        (self.output / "index.html").write_bytes(b"local change to preserve")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_legacy_output_with_unmanifested_license_asset_is_preserved(self):
        self.make_legacy_output()
        (self.output / "code-license.txt").write_bytes(b"unrelated file")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_partial_license_manifest_is_not_an_owned_build(self):
        self.make_legacy_output()
        data = b"partial upgrade"
        (self.output / "code-license.txt").write_bytes(data)
        manifest_path = self.output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"]["code-license.txt"] = hashlib.sha256(data).hexdigest()
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_semantic_structure_and_navigation(self):
        for name, doc in self.build().items():
            self.assertEqual(len(doc.ids), len(set(doc.ids)), name)
            self.assertEqual(doc.headings.count(1), 1, name)
            self.assertEqual(sum(tag == "main" for tag, _ in doc.tags), 1, name)
            self.assertTrue(any(tag == "html" and attrs.get("lang") == "en" for tag, attrs in doc.tags))
            self.assertIn("#main", doc.links)
            for before, after in zip(doc.headings, doc.headings[1:]):
                self.assertLessEqual(after, before + 1, name)
            active = [a for tag, a in doc.tags if tag == "a" and a.get("aria-current") == "page"]
            self.assertEqual(len(active), 0 if name == "404.html" else 1)

    def test_no_scripts_collection_or_external_resources(self):
        for name, doc in self.build().items():
            self.assertFalse({tag for tag, _ in doc.tags} & {"script", "iframe", "form", "input", "object", "embed", "video", "audio"}, name)
            for tag, attrs in doc.tags:
                self.assertFalse(any(k.startswith("on") for k in attrs), (name, tag))
            policies = [a["content"] for t, a in doc.tags if t == "meta" and a.get("http-equiv") == "Content-Security-Policy"]
            self.assertEqual(len(policies), 1)
            self.assertIn("default-src 'none'", policies[0])
        css = (self.output / "styles.css").read_text(encoding="utf-8")
        self.assertNotRegex(css, r"(?i)@import|url\s*\(")

    def test_payload_budget_and_private_data_markers(self):
        self.build()
        status = json.loads((ROOT / "release.json").read_text(encoding="utf-8"))["status"]
        self.assertIn(status, {"candidate", "ready"})
        css_size = (self.output / "styles.css").stat().st_size
        draft = self.output / "help-and-access-draft.md"
        self.assertLess(draft.stat().st_size, 50_000)
        self.assertNotRegex(draft.read_text(encoding="utf-8"), r"(?i)C:\\Users|/Users/|/home/|\.codex|baseline-0\.|W4-HUMAN|api[_-]?key\s*[=:]|BEGIN.*PRIVATE KEY")
        for path in self.output.glob("*.html"):
            self.assertLess(path.stat().st_size + css_size, 250_000)
            content = path.read_text(encoding="utf-8")
            self.assertNotRegex(content, r"(?i)C:\\Users|/Users/|/home/|\.codex|baseline-0\.|W4-HUMAN|api[_-]?key\s*[=:]|BEGIN.*PRIVATE KEY")
            self.assertNotIn("{{", content)
            if status == "candidate":
                self.assertIn("Not yet released", content)
            else:
                self.assertNotIn("Not yet released", content)

    def test_unsafe_base_paths_are_rejected_before_writing(self):
        for base in ("//evil.test/", "https://evil.test/", "/../", "/x/../", "/x?y/", "/x#z/", "/x%2fy/", '/x\"/','/x\\y/', "/x"):
            with self.assertRaises(ValueError, msg=base):
                builder.build(self.output, base)
        self.assertFalse(self.output.exists())

    def test_source_and_unrelated_output_are_protected(self):
        for target in (ROOT, ROOT.parent, ROOT / "content", ROOT / "docs" / "new"):
            with self.assertRaises(ValueError):
                builder.build(target)
        self.output.mkdir()
        keep = self.output / "notes.txt"
        keep.write_text("retain me", encoding="utf-8")
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(keep.read_text(encoding="utf-8"), "retain me")

    def test_unowned_html_is_not_overwritten(self):
        self.output.mkdir()
        page = self.output / "index.html"
        page.write_text("my unrelated page", encoding="utf-8")
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(page.read_text(encoding="utf-8"), "my unrelated page")

    def test_modified_generated_file_is_preserved(self):
        self.build()
        page = self.output / "index.html"
        page.write_text("an edit to preserve", encoding="utf-8")
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(page.read_text(encoding="utf-8"), "an edit to preserve")

    def test_hardlinked_output_does_not_overwrite_external_file(self):
        self.build()
        external = Path(self.temp.name) / "outside.html"
        page = self.output / "index.html"
        external.write_bytes(page.read_bytes())
        page.unlink()
        os.link(external, page)
        before = external.read_bytes()
        with self.assertRaises(ValueError):
            builder.build(self.output)
        self.assertEqual(external.read_bytes(), before)

    def test_candidate_documents_do_not_link_private_history(self):
        for path in ROOT.rglob("*.md"):
            for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
                if target.startswith("#"):
                    continue
                if urlsplit(target).scheme:
                    self.assertTrue(external_reference(target), (path.name, target))
                    continue
                resolved = (path.parent / target.split("#")[0]).resolve()
                self.assertTrue(resolved.is_relative_to(ROOT), (path.name, target))
                self.assertTrue(resolved.is_file(), (path.name, target))

    def test_public_contact_link_forms(self):
        for href in ("https://github.com/test-owner/test-proposal", "mailto:conduct@example.org"):
            self.assertTrue(external_reference(href), href)
        for href in ("javascript:alert(1)", "data:text/html,private", "http://example.org", "https:no-host", "https://user:password@example.org/", "mailto:x@example.org?body=private", "mailto:x@example.org\ncc:y@example.org"):
            self.assertFalse(external_reference(href), href)

    def test_review_limits_are_visible_from_the_commitments_page(self):
        document = self.build()["governance.html"]
        self.assertIn("accessibility", document.ids)
        self.assertIn(
            "https://github.com/Jstn-1g/open-education-proposal/blob/main/README.md#review-limits",
            document.links,
        )
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("## Review limits", readme)

    def test_live_readme_and_first_tasks_have_direct_start_routes(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("https://jstn-1g.github.io/open-education-proposal/", readme)
        contribution_guide = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
        first_tasks = (ROOT / "docs/FIRST-CONTRIBUTIONS.md").read_text(encoding="utf-8")
        contribution_page = self.build()["contribute.html"]
        for number in (1, 2, 3):
            target = f"https://github.com/Jstn-1g/open-education-proposal/issues/{number}"
            self.assertIn(target, readme)
            self.assertIn(target, contribution_guide)
            self.assertIn(target, first_tasks)
            self.assertIn(target, contribution_page.links)

    def test_review_draft_is_an_exact_self_contained_download(self):
        source = (ROOT / "docs/REVIEW-CASES.md").read_bytes()
        text = source.decode("utf-8")
        for phrase in ("Adult discussion draft", "Not yet specialist-reviewed", "CC BY 4.0",
                       "https://github.com/Jstn-1g/open-education-proposal/issues/1"):
            self.assertIn(phrase, text)
        self.assertEqual(len(re.findall(r"^\| C[1-6] \|", text, re.M)), 6)
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
            self.assertTrue(target.startswith("https://"), target)
        for base in ("/", "/open-education-proposal/"):
            documents = self.build(base)
            payload = (self.output / "help-and-access-draft.md").read_bytes()
            self.assertEqual(payload, source)
            manifest = json.loads((self.output / "manifest.json").read_text())
            self.assertEqual(manifest["files"]["help-and-access-draft.md"], hashlib.sha256(source).hexdigest())
            self.assertIn(base + "help-and-access-draft.md", documents["open-source.html"].links)
            self.assertIn(base + "open-source.html#review-draft", documents["contribute.html"].links)

    def test_guided_demo_has_independent_disclosures_and_reuse_routes(self):
        for base in ("/", "/open-education-proposal/"):
            documents = self.build(base)
            home = documents["index.html"]
            for identifier in ("demo", "demo-c1", "demo-c2", "demo-title"):
                self.assertIn(identifier, home.ids)
            disclosures = [attrs for tag, attrs in home.tags if tag == "details"]
            self.assertEqual(len(disclosures), 2)
            for attrs in disclosures:
                self.assertTrue({"name", "open", "hidden"}.isdisjoint(attrs))
            self.assertEqual(sum(tag == "summary" for tag, _ in home.tags), 2)
            for href in ("#demo", base + "help-and-access-draft.md",
                         base + "open-source.html#review-draft",
                         "https://github.com/Jstn-1g/open-education-proposal/issues/1"):
                self.assertIn(href, home.links)
            self.assertIn(base + "index.html#demo", documents["contribute.html"].links)

    def test_demo_preserves_source_reasoning_and_visible_limits(self):
        self.build()
        home = (self.output / "index.html").read_text(encoding="utf-8")
        source = (ROOT / "docs/REVIEW-CASES.md").read_text(encoding="utf-8")
        # A screen disclosure and its print fallback must retain the same
        # provisional interpretation and uncertainty as the source cases.
        for case in ("C1", "C2"):
            row = re.search(rf"^\| {case} \| (.+) \|$", source, re.M).group(1).split(" | ")
            card = re.search(rf'<article[^>]+id="demo-{case.lower()}"[^>]*>(.*?)</article>', home, re.S)
            self.assertIsNotNone(card, case)
            for text in row[2:]:
                self.assertEqual(card.group(1).count(text), 2, (case, text))
        visible = re.sub(r"<details\b.*?</details>", "", home, flags=re.S)
        for phrase in ("Not yet specialist-reviewed", "fictional", "Keep necessary support available",
                       "not a lesson, assessment, or accommodation rule", "CC BY 4.0"):
            self.assertIn(phrase, visible)

    def test_demo_controls_include_visible_case_context(self):
        for base in ("/", "/open-education-proposal/"):
            home = self.build(base)["index.html"]
            summaries = [attrs for tag, attrs in home.tags if tag == "summary"]
            self.assertEqual(len(summaries), 2)
            for case, attrs in zip(("c1", "c2"), summaries):
                expected = [f"demo-{case}-question", f"demo-{case}-title"]
                self.assertEqual(attrs.get("aria-labelledby", "").split(), expected)
                for identifier in expected:
                    self.assertIn(identifier, home.ids)

    def make_pre_download_output(self, status):
        self.build()
        download = self.output / "help-and-access-draft.md"
        if download.exists():
            download.unlink()
        manifest_path = self.output / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["files"].pop("help-and-access-draft.md", None)
        manifest["status"] = status
        manifest["version"] = "0.1.0" if status == "ready" else "0.1.0-candidate"
        self.assertEqual(len(manifest["files"]), 11)
        manifest_path.write_text(json.dumps(manifest) + "\n", encoding="utf-8")

    def test_pre_download_ready_and_candidate_builds_upgrade_safely(self):
        for status in ("ready", "candidate"):
            self.make_pre_download_output(status)
            self.build()
            self.assertEqual((self.output / "help-and-access-draft.md").read_bytes(),
                             (ROOT / "docs/REVIEW-CASES.md").read_bytes())
            first = {p.name: p.read_bytes() for p in self.output.iterdir()}
            self.build()
            self.assertEqual(first, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_modified_pre_download_build_is_preserved(self):
        self.make_pre_download_output("ready")
        (self.output / "index.html").write_bytes(b"A user's edit must survive.")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_unmanifested_download_is_preserved(self):
        self.make_pre_download_output("ready")
        (self.output / "help-and-access-draft.md").write_bytes(b"An unrelated local draft.")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})


if __name__ == "__main__":
    unittest.main()
