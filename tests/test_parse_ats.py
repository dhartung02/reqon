"""parse_ats() URL->(_ats, slug, id) tests (Phase 9) — used by re-validation."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))
import scout_run as sr  # noqa: E402


class ParseAts(unittest.TestCase):
    def test_greenhouse(self):
        ats, slug, pid = sr.parse_ats("https://boards.greenhouse.io/acme/jobs/12345")
        self.assertEqual((ats, slug, pid), ("greenhouse", "acme", "12345"))

    def test_ashby(self):
        ats, slug, _ = sr.parse_ats("https://jobs.ashbyhq.com/acme/abcdef12-3456-7890")
        self.assertEqual(ats, "ashby")
        self.assertEqual(slug, "acme")

    def test_lever(self):
        ats, slug, _ = sr.parse_ats("https://jobs.lever.co/acme/abc-def-123")
        self.assertEqual(ats, "lever")
        self.assertEqual(slug, "acme")

    def test_workable(self):
        ats, slug, _ = sr.parse_ats("https://apply.workable.com/acme/j/ABC123/")
        self.assertEqual(ats, "workable")
        self.assertEqual(slug, "acme")

    def test_unknown_returns_none(self):
        self.assertEqual(sr.parse_ats("https://example.com/careers/1"), (None, None, None))


if __name__ == "__main__":
    unittest.main()
