"""Exercise the publication guard without a network, license grant, or real contact."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("release_check", ROOT / "release_check.py")
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class ReleaseCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="education-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = {
            "status": "ready",
            "repository": "https://github.com/test-owner/test-proposal",
            "maintainer": "test-owner",
            "conduct_contact": "mailto:conduct@example.org",
            "security_contact": "https://github.com/test-owner/test-proposal/security/advisories/new",
        }
        self.save()
        for name in ("README.md", "CONTRIBUTING.md", "GOVERNANCE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "LICENSE-PLAN.md"):
            (self.root / name).write_text("Synthetic fixture.\n" + "\n".join(self.data.values()), encoding="utf-8")
        # Marker-only fixtures deliberately prove that this is a consistency check,
        # not an assertion that a valid legal grant or real report route exists.
        (self.root / "LICENSE").write_text("Fixture: Apache License", encoding="utf-8")
        (self.root / "LICENSE-CONTENT").write_text("Fixture: Creative Commons Attribution 4.0 International", encoding="utf-8")
        (self.root / "content").mkdir()
        (self.root / "content" / "index.html").write_text("<h1>Community proposal</h1>", encoding="utf-8")
        (self.root / "build.py").write_text("PAGES = {'index': ()}\ndef render(slug, fragment, base):\n    return fragment\n", encoding="utf-8")

    def save(self):
        (self.root / "release.json").write_text(json.dumps(self.data), encoding="utf-8")

    def test_consistent_fixture_passes_locally_and_in_matching_repository(self):
        self.assertEqual(guard.check(self.root), [])
        self.assertEqual(guard.check(self.root, github_repository="TEST-owner/test-proposal"), [])

    def test_candidate_mode_cannot_publish(self):
        self.data["status"] = "candidate"
        self.save()
        (self.root / "LICENSE").unlink()
        (self.root / "content" / "index.html").write_text("Local review candidate", encoding="utf-8")
        errors = guard.check(self.root)
        self.assertTrue(any("status must be ready" in error for error in errors))
        self.assertTrue(any("LICENSE" in error for error in errors))
        self.assertTrue(any("candidate-only" in error for error in errors))

    def test_malformed_config_fails_with_actionable_errors(self):
        for value in ([], {}, {**self.data, "status": True}, {**self.data, "extra": "ignored?"}):
            with self.subTest(value=value):
                (self.root / "release.json").write_text(json.dumps(value), encoding="utf-8")
                self.assertEqual(len(guard.check(self.root)), 1)
        (self.root / "release.json").write_text("{broken", encoding="utf-8")
        self.assertIn("readable JSON", guard.check(self.root)[0])

    def test_fork_or_wrong_repository_cannot_deploy(self):
        errors = guard.check(self.root, github_repository="someone-else/fork")
        self.assertTrue(any("different repository" in error for error in errors))

    def test_invalid_repository_and_contact_destinations_are_rejected(self):
        for repository in ("https://github.com.evil.test/a/b", "http://github.com/a/b", "https://user@github.com/a/b", "https://github.com/a/..", "https://github.com/a/b?x=1"):
            self.data["repository"] = repository
            self.save()
            self.assertTrue(any("repository URL" in error for error in guard.check(self.root)))
        for contact in ("", "https://public.example.org/issues", "mailto:conduct@example.org?body=private", "mailto:x@example.org\ncc:y@example.org"):
            self.data["conduct_contact"] = contact
            self.save()
            self.assertTrue(any("conduct mailto" in error for error in guard.check(self.root)))

    def test_missing_license_and_stale_public_document_block_release(self):
        (self.root / "LICENSE").unlink()
        (self.root / "README.md").write_text("This is a local review candidate.", encoding="utf-8")
        errors = guard.check(self.root)
        self.assertTrue(any("complete LICENSE" in error for error in errors))
        self.assertTrue(any("README.md" in error for error in errors))

    def test_actual_rendered_frame_and_indexing_policy_are_checked(self):
        (self.root / "build.py").write_text("PAGES = {'index': ()}\ndef render(slug, fragment, base):\n    return '<meta name=\"robots\" content=\"noindex\">Not yet released' + fragment\n", encoding="utf-8")
        errors = guard.check(self.root)
        self.assertTrue(any("candidate-only wording in index.html" in error for error in errors))
        self.assertTrue(any("noindex" in error for error in errors))

    def test_configured_contacts_must_be_visible_in_public_policies(self):
        for name in ("GOVERNANCE.md", "CODE_OF_CONDUCT.md", "SECURITY.md"):
            (self.root / name).write_text("Contact is missing.", encoding="utf-8")
        errors = guard.check(self.root)
        for name in ("GOVERNANCE.md", "CODE_OF_CONDUCT.md", "SECURITY.md"):
            self.assertTrue(any(f"release facts in {name}" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
