"""Dedupe / normalization unit tests (Phase 9) — the embellished-vs-official near-dupe gotcha."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))
import scout  # noqa: E402


class Dedupe(unittest.TestCase):
    def _eq(self, c, r1, r2):
        self.assertEqual(scout.norm_key(c, r1), scout.norm_key(c, r2))

    def test_abbreviation(self):
        self._eq("Stripe", "Senior PM, CDP", "Senior Product Manager, CDP")

    def test_word_order(self):
        self._eq("Acme", "Sr. Product Manager, Data Platform", "Data Platform Senior PM")

    def test_connector_and_punctuation(self):
        self._eq("Okta", "Platform PM - Identity and Access", "Platform Product Manager, Identity & Access")

    def test_parenthetical_dropped(self):
        self._eq("Acme", "Principal PM, CDP (Remote)", "Principal Product Manager, CDP")

    def test_genuinely_distinct_not_merged(self):
        self.assertNotEqual(scout.norm_key("Acme", "Principal PM, CDP"),
                            scout.norm_key("Acme", "Principal PM, Billing"))

    def test_company_anchors(self):
        self.assertNotEqual(scout.norm_key("Acme", "PM"), scout.norm_key("Beta", "PM"))


class MergeDedupe(unittest.TestCase):
    """file_merge's dedup must use the near-dupe-aware norm_key (it previously used a weak
    exact key, so an embellished scout title re-added a row already in the store)."""

    def test_near_dupe_against_store_is_skipped(self):
        store = [{"company": "Stripe", "role": "Senior Product Manager, CDP"}]
        new = scout.dedupe_new([{"company": "Stripe", "role": "Senior PM, CDP"}], store)
        self.assertEqual(new, [])

    def test_intra_batch_near_dupes_collapse(self):
        rows = [
            {"company": "Okta", "role": "Platform PM - Identity and Access"},
            {"company": "Okta", "role": "Platform Product Manager, Identity & Access"},
        ]
        self.assertEqual(len(scout.dedupe_new(rows, [])), 1)

    def test_distinct_roles_both_added(self):
        new = scout.dedupe_new(
            [{"company": "Acme", "role": "Principal PM, CDP"},
             {"company": "Acme", "role": "Principal PM, Billing"}], [])
        self.assertEqual(len(new), 2)

    def test_empty_company_role_skipped(self):
        self.assertEqual(scout.dedupe_new([{"company": "", "role": ""}], []), [])


if __name__ == "__main__":
    unittest.main()
