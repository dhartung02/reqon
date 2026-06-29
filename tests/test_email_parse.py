"""scout_email card-extraction + source-detection tests (no network, no IMAP).

Synthetic HTML modeled on each provider's alert-email card shape verifies that the
heuristic parser pulls title / company / location / salary / url correctly, and that
navigation/CTA anchors are ignored.
"""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scout_email", os.path.join(_HERE, "..", "agent", "scout_email.py"))
se = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(se)


class DetectSource(unittest.TestCase):
    def test_known_senders(self):
        self.assertEqual(se.detect_source("jobalerts-noreply@linkedin.com", "x"), "linkedin")
        self.assertEqual(se.detect_source("alert@indeed.com", "x"), "indeed")
        self.assertEqual(se.detect_source("noreply@glassdoor.com", "x"), "glassdoor")
        self.assertEqual(se.detect_source("jobs@ziprecruiter.com", "x"), "ziprecruiter")

    def test_unknown_sender(self):
        self.assertIsNone(se.detect_source("hello@randomstartup.com", "We're hiring"))


class LinkedIn(unittest.TestCase):
    HTML = (
        '<a href="https://www.linkedin.com/comm/jobs/view/3812345678?trk=eml">'
        'Principal Product Manager</a> SimSpace · United States (Remote)'
        '<a href="https://www.linkedin.com/comm/jobs/view/9999?trk=eml">See all jobs</a>'
    )

    def test_extracts_card(self):
        cards = se.parse_cards("linkedin", self.HTML)
        self.assertEqual(len(cards), 1)                       # CTA "See all jobs" dropped
        c = cards[0]
        self.assertEqual(c["title"], "Principal Product Manager")
        self.assertEqual(c["company"], "SimSpace")
        self.assertIn("jobs/view/3812345678", c["url"])
        self.assertTrue("remote" in c["location"].lower() or "united states" in c["location"].lower())


class Indeed(unittest.TestCase):
    HTML = (
        '<a href="https://www.indeed.com/viewjob?jk=abcdef0123456789">'
        'Senior Product Manager, Data Platform</a> Acme Data - Remote '
        '$205,000 - $277,000 a year'
    )

    def test_extracts_card(self):
        cards = se.parse_cards("indeed", self.HTML)
        self.assertEqual(len(cards), 1)
        c = cards[0]
        self.assertEqual(c["title"], "Senior Product Manager, Data Platform")
        self.assertEqual(c["company"], "Acme Data")
        self.assertIn("jk=abcdef", c["url"])
        self.assertIn("205,000", c["salary"])


class Glassdoor(unittest.TestCase):
    # Glassdoor puts "Company  rating★" BEFORE the title anchor.
    HTML = (
        'Waymo 4.0 ★ '
        '<a href="https://www.glassdoor.com/job-listing/senior-pm-waymo-JV_KO0,9.htm">'
        'Senior Product Manager, DevAI</a> Mountain View, CA $241K – $297K (Employer est.)'
    )

    def test_extracts_card(self):
        cards = se.parse_cards("glassdoor", self.HTML)
        self.assertEqual(len(cards), 1)
        c = cards[0]
        self.assertEqual(c["title"], "Senior Product Manager, DevAI")
        self.assertEqual(c["company"], "Waymo")               # rating stripped
        self.assertIn("Mountain View", c["location"])
        self.assertIn("241K", c["salary"])


class Hygiene(unittest.TestCase):
    def test_dedupes_repeated_linkedin_link(self):
        html = (
            '<a href="https://www.linkedin.com/jobs/view/111?trk=img">Staff Product Manager</a> Foo · Remote'
            '<a href="https://www.linkedin.com/jobs/view/111?trk=txt">Staff Product Manager</a> Foo · Remote'
        )
        self.assertEqual(len(se.parse_cards("linkedin", html)), 1)

    def test_ignores_non_job_anchor(self):
        html = '<a href="https://www.linkedin.com/help">Help</a>'
        self.assertEqual(se.parse_cards("linkedin", html), [])


if __name__ == "__main__":
    unittest.main()
