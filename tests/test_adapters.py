"""Adapter normalization tests (Phase 9) with mocked HTTP — no network."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))
import sources  # registers all adapters into sources.REGISTRY  # noqa: E402
import sources.greenhouse as gh  # noqa: E402
import sources.lever as lever  # noqa: E402

NORMALIZED_KEYS = {"title", "location", "url", "desc", "salary"}


class Adapters(unittest.TestCase):
    def test_greenhouse_normalizes_and_strips_html(self):
        sample = {"jobs": [{
            "title": "Principal Product Manager",
            "location": {"name": "Remote, US"},
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/1",
            "content": "<p>Own the <b>data platform</b> &amp; pipelines</p>",
        }]}
        orig = gh.fetch_json
        gh.fetch_json = lambda *a, **k: sample
        try:
            out = sources.REGISTRY["greenhouse"]("acme")
        finally:
            gh.fetch_json = orig
        self.assertEqual(len(out), 1)
        row = out[0]
        self.assertEqual(NORMALIZED_KEYS, set(row.keys()))
        self.assertEqual(row["title"], "Principal Product Manager")
        self.assertEqual(row["location"], "Remote, US")
        self.assertNotIn("<", row["desc"])              # HTML stripped
        self.assertIn("data platform", row["desc"])     # entities unescaped/kept

    def test_lever_normalizes(self):
        sample = [{
            "text": "Staff Product Manager",
            "categories": {"location": "San Francisco"},
            "hostedUrl": "https://jobs.lever.co/acme/abc",
            "descriptionPlain": "Lead the platform.",
        }]
        orig = lever.fetch_json
        lever.fetch_json = lambda *a, **k: sample
        try:
            out = sources.REGISTRY["lever"]("acme")
        finally:
            lever.fetch_json = orig
        self.assertEqual(len(out), 1)
        self.assertEqual(NORMALIZED_KEYS, set(out[0].keys()))
        self.assertEqual(out[0]["title"], "Staff Product Manager")


if __name__ == "__main__":
    unittest.main()
