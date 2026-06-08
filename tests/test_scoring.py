"""Scoring / filtering unit tests (Phase 9). Run: python3 -m unittest discover -s tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))
import scout  # noqa: E402


class Scoring(unittest.TestCase):
    def test_pm_detection(self):
        self.assertTrue(scout.is_pm_role("Principal Product Manager, CDP"))
        self.assertFalse(scout.is_pm_role("Senior Software Engineer"))
        self.assertFalse(scout.is_pm_role("Technical Program Manager"))

    def test_fit_priority_vs_generic(self):
        hi = scout.score_fit("Principal PM, Data Platform", "data platform pipelines snowflake")
        lo = scout.score_fit("Product Manager", "general product work")
        self.assertGreaterEqual(hi, 8.0)
        self.assertLess(lo, 7.0)

    def test_tier_thresholds(self):
        self.assertEqual(scout.tier_for(9, 8), "A")   # EV 7.2
        self.assertEqual(scout.tier_for(7, 6), "B")   # EV 4.2
        self.assertEqual(scout.tier_for(5, 4), "C")   # EV 2.0

    def test_tier_ok_gate(self):
        self.assertTrue(scout.tier_ok("A", "B"))
        self.assertTrue(scout.tier_ok("B", "B"))
        self.assertFalse(scout.tier_ok("C", "B"))

    def test_employment_blocked(self):
        st = scout.EMPLOYMENT_SKIP_DEFAULT
        self.assertEqual(scout.employment_blocked("Contract Product Manager", st), "contract")
        self.assertEqual(scout.employment_blocked("Associate Product Manager", st), "associate")
        self.assertIsNone(scout.employment_blocked("Principal Product Manager", st))

    def test_prob_remote_penalty(self):
        remote = scout.score_prob(8, "Principal PM", "remote", False)
        onsite = scout.score_prob(8, "Principal PM", "onsite", False)
        self.assertGreater(remote, onsite)


if __name__ == "__main__":
    unittest.main()
