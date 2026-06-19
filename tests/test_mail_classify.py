"""mail_ingest classifier + company-matching tests (no network, no IMAP).

Covers the decision-relevant pure logic: rejection/interview/offer detection, that rejection
language wins even when an email also says "interview", and that company matching only fires on
an active applied row whose name actually appears in the message.
"""
import importlib.util
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("mail_ingest", os.path.join(_HERE, "..", "agent", "mail_ingest.py"))
mi = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(mi)


class Classify(unittest.TestCase):
    def k(self, subj, body=""):
        return mi.classify_email(subj, body)["kind"]

    def test_rejection(self):
        self.assertEqual(self.k("Update on your application",
                                "Unfortunately we have decided to move forward with other candidates."), "rejected")

    def test_rejection_wins_over_interview_word(self):
        # a rejection email that still mentions the interview shouldn't read as 'interview'
        self.assertEqual(self.k("Following your interview",
                                "Thank you for interviewing. Unfortunately we won't be moving forward."), "rejected")

    def test_interview(self):
        self.assertEqual(self.k("Next steps", "We'd love to schedule a phone screen — what's your availability?"), "interview")

    def test_offer(self):
        self.assertEqual(self.k("Great news", "We are pleased to offer you the position; the compensation package is attached."), "offer")

    def test_other(self):
        self.assertEqual(self.k("Your weekly newsletter", "Here are 10 jobs you might like."), "other")


class MatchRows(unittest.TestCase):
    ROWS = [
        {"company": "Stripe", "role": "Senior PM, CDP", "status": "Applied"},
        {"company": "Acme Data", "role": "Principal PM", "status": "Not Applied"},
        {"company": "Globex", "role": "Staff PM", "status": "Offer"},
    ]

    def test_matches_active_applied_company_in_body(self):
        m = mi.match_rows(self.ROWS, "Stripe Recruiting", "noreply@greenhouse.io",
                          "Your application", "Thanks for applying to Stripe.")
        self.assertEqual([r["company"] for r in m], ["Stripe"])

    def test_skips_not_applied_rows(self):
        m = mi.match_rows(self.ROWS, "Acme", "x@acme.io", "Acme Data update", "regarding Acme Data")
        self.assertEqual(m, [])  # Acme Data is Not Applied → not a candidate

    def test_skips_when_company_absent(self):
        self.assertEqual(mi.match_rows(self.ROWS, "Generic ATS", "no-reply@ashbyhq.com", "Update", "An update."), [])

    def test_reqkey_shape(self):
        self.assertEqual(mi.req_key({"company": "Stripe", "role": "Senior PM, CDP"}), "stripe|senior pm, cdp")


if __name__ == "__main__":
    unittest.main()
