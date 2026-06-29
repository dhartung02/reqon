"""req_resolver tests — slug derivation, title matching, and the two resolution tiers
(boards.json match + slug-probe) with mocked ATS adapters. No network.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))
import sources          # noqa: E402  registers adapters
import req_resolver as R  # noqa: E402


class Slugs(unittest.TestCase):
    def test_derives_variants(self):
        s = R.candidate_slugs("Acme Data, Inc.")
        self.assertIn("acmedata", s)
        self.assertIn("acme-data", s)
        self.assertIn("acme", s)

    def test_strips_corporate_suffix(self):
        self.assertEqual(R.company_norm("Stripe Technologies LLC"), "stripe")

    def test_empty(self):
        self.assertEqual(R.candidate_slugs(""), [])


class TitleMatch(unittest.TestCase):
    POSTINGS = [
        {"title": "Principal Product Manager, Data Platform", "url": "u1", "location": "Remote", "salary": "$240k"},
        {"title": "Senior Marketing Manager", "url": "u2", "location": "NYC", "salary": ""},
    ]

    def test_abbreviated_email_title_matches_full_board_title(self):
        p, score = R.best_match("Principal PM, Data Platform", self.POSTINGS)
        self.assertIsNotNone(p)
        self.assertEqual(p["url"], "u1")
        self.assertGreaterEqual(score, 0.6)

    def test_no_false_match_on_generic_single_token(self):
        p, _ = R.best_match("Director", self.POSTINGS)
        self.assertIsNone(p)

    def test_unrelated_title(self):
        p, _ = R.best_match("Staff Data Engineer", self.POSTINGS)
        self.assertIsNone(p)


class Boards(unittest.TestCase):
    BOARDS = {"companies": [{"name": "Acme Data", "ats": "greenhouse", "slug": "acmedata"}]}

    def test_find_company_handles_suffix(self):
        e = R.find_company_in_boards("Acme Data, Inc.", self.BOARDS)
        self.assertIsNotNone(e)
        self.assertEqual(e["slug"], "acmedata")


class ResolveTier1(unittest.TestCase):
    BOARDS = {"companies": [{"name": "Acme Data", "ats": "greenhouse", "slug": "acmedata"}]}

    def setUp(self):
        self._orig = sources.REGISTRY.get("greenhouse")
        sources.REGISTRY["greenhouse"] = lambda slug: (
            [{"title": "Principal Product Manager, Data Platform", "url": "https://gh/acme/1",
              "location": "Remote, US", "salary": "$240k", "desc": ""}] if slug == "acmedata" else []
        )

    def tearDown(self):
        sources.REGISTRY["greenhouse"] = self._orig

    def test_resolves_via_boards(self):
        r = R.resolve("Acme Data", "Principal PM, Data Platform", boards=self.BOARDS, probe=False, cache={})
        self.assertIsNotNone(r)
        self.assertEqual(r["via"], "boards")
        self.assertEqual(r["url"], "https://gh/acme/1")
        self.assertEqual(r["location"], "Remote, US")

    def test_no_match_returns_none(self):
        r = R.resolve("Acme Data", "Chief Revenue Officer", boards=self.BOARDS, probe=False, cache={})
        self.assertIsNone(r)


class ResolveTier2(unittest.TestCase):
    def setUp(self):
        self._gh = sources.REGISTRY.get("greenhouse")
        self._ashby = sources.REGISTRY.get("ashby")
        self._lever = sources.REGISTRY.get("lever")
        sources.REGISTRY["greenhouse"] = lambda slug: (
            [{"title": "Staff Product Manager, Identity", "url": "https://gh/newco/9",
              "location": "Remote", "salary": "", "desc": ""}] if slug == "newco" else []
        )
        sources.REGISTRY["ashby"] = lambda slug: []
        sources.REGISTRY["lever"] = lambda slug: []

    def tearDown(self):
        sources.REGISTRY["greenhouse"] = self._gh
        sources.REGISTRY["ashby"] = self._ashby
        sources.REGISTRY["lever"] = self._lever

    def test_probes_and_resolves(self):
        r = R.resolve("NewCo", "Staff PM, Identity", boards={"companies": []},
                      probe=True, cache={}, write_boards=False)
        self.assertIsNotNone(r)
        self.assertEqual(r["via"], "probe")
        self.assertEqual(r["ats"], "greenhouse")
        self.assertEqual(r["slug"], "newco")
        self.assertEqual(r["url"], "https://gh/newco/9")

    def test_no_board_found(self):
        r = R.resolve("Ghostcorp", "Principal PM", boards={"companies": []},
                      probe=True, cache={}, write_boards=False)
        self.assertIsNone(r)


class AppendBoard(unittest.TestCase):
    def test_append_and_dedupe(self):
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            with open(path, "w") as f:
                f.write('{"companies": []}')
            self.assertTrue(R.append_board("NewCo", "greenhouse", "newco", path))
            self.assertFalse(R.append_board("NewCo", "greenhouse", "newco", path))   # dup by name+slug
            b = R.load_boards(path)
            self.assertEqual(len(b["companies"]), 1)
            self.assertEqual(b["companies"][0]["addedBy"], "email-scout")
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
