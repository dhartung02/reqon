"""profile-from-resume.py work-history + education extraction tests.

Regression coverage for the parse bugs found when a real résumé was imported:
  - company/role swap (company landed in the description, a prior bullet became the role)
  - DOCX <w:tab/> dropped → "CompanyLocation" glued together
  - descriptions truncated mid-word at 600 chars and bullets flattened to one line
  - only the first of several degrees captured when they share one line

Uses synthetic fixtures only — never a real résumé (PII). The module name has dashes,
so it's loaded via importlib rather than a normal import.
"""
import importlib.util
import io
import os
import sys
import tempfile
import unittest
import zipfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location(
    "pfr", os.path.join(_HERE, "..", "agent", "profile-from-resume.py"))
pfr = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(pfr)

# Post-read_resume shape: title<TAB>dates / company<TAB>location / description paragraphs.
LONG_TAIL = "and then closed the loop with a measurable adoption win worth tracking."
RESUME_TEXT = (
    "Professional Experience\n"
    "Staff Product Manager\t2020 - Present\n"
    "Globex Corp\tRemote\n"
    "Led the data platform squad and shipped the ingest pipeline end to end. "
    + ("Drove a cross-team FinOps program that cut warehouse spend materially " * 6)
    + "\n"
    "Partnered with engineering and design on a 0 to 1 catalog domain, " + LONG_TAIL + "\n"
    "Senior Product Manager, Billing - Monetization\t2016 - 2020\n"
    "Initech\tAustin, TX\n"
    "Owned the usage-billing roadmap and the pricing model.\n"
    "Education\n"
    "M.S. Data Science, State University (GPA 4.0)  •  B.A. Economics, Liberal Arts College\n"
)


class ExtractExperience(unittest.TestCase):
    def setUp(self):
        self.wh = pfr.extract_experience(RESUME_TEXT)

    def test_two_entries(self):
        self.assertEqual(len(self.wh), 2)

    def test_role_company_location_not_swapped(self):
        e0 = self.wh[0]
        self.assertEqual(e0["role"], "Staff Product Manager")
        self.assertEqual(e0["company"], "Globex Corp")      # company, NOT a description line
        self.assertEqual(e0["location"], "Remote")
        self.assertEqual((e0["start"], e0["end"]), ("2020", "Present"))

    def test_role_keeps_focus_suffix(self):
        # "Senior Product Manager, Billing – Monetization" stays whole; company is the next line.
        e1 = self.wh[1]
        self.assertEqual(e1["role"], "Senior Product Manager, Billing - Monetization")
        self.assertEqual(e1["company"], "Initech")
        self.assertEqual(e1["location"], "Austin, TX")

    def test_company_not_glued_into_description(self):
        # The classic bug: "GlobexRemote ..." leaking into the description.
        self.assertNotIn("Globex", self.wh[0]["description"])
        self.assertNotIn("Remote", self.wh[0]["description"])

    def test_description_keeps_bullets_as_lines(self):
        self.assertIn("\n", self.wh[0]["description"])         # multiple bullets preserved
        self.assertEqual(self.wh[0]["description"].count("\n"), 1)

    def test_description_not_truncated_midword(self):
        # The 600-char hard cut would have dropped this tail.
        self.assertGreater(len(self.wh[0]["description"]), 600)
        self.assertTrue(self.wh[0]["description"].rstrip().endswith(LONG_TAIL))


class ExtractEducation(unittest.TestCase):
    def setUp(self):
        self.ed = pfr.extract_education(RESUME_TEXT)

    def test_both_degrees_captured(self):
        self.assertEqual(len(self.ed), 2)

    def test_degree_fields(self):
        ms, ba = self.ed
        self.assertEqual(ms["level"], "M.S.")                 # canonical period preserved
        self.assertEqual(ms["field"], "Data Science")
        self.assertEqual(ms["school"], "State University")    # "(GPA 4.0)" stripped
        self.assertEqual(ba["level"], "B.A.")
        self.assertEqual(ba["field"], "Economics")
        self.assertEqual(ba["school"], "Liberal Arts College")


class DocxTabHandling(unittest.TestCase):
    def _docx(self, paragraphs):
        """Build a minimal .docx whose paragraphs use <w:tab/> between runs."""
        W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        body = ""
        for runs in paragraphs:
            cells = "<w:tab/>".join("<w:r><w:t>%s</w:t></w:r>" % r for r in runs)
            body += "<w:p>%s</w:p>" % cells
        xml = ('<?xml version="1.0"?><w:document xmlns:w="%s"><w:body>%s</w:body></w:document>'
               % (W, body))
        path = os.path.join(tempfile.mkdtemp(), "r.docx")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("word/document.xml", xml)
        with open(path, "wb") as f:
            f.write(buf.getvalue())
        return path

    def test_tab_becomes_separator_not_glue(self):
        path = self._docx([["Acme Corporation", "Little Rock, AR"]])
        text = pfr.read_resume(path)
        self.assertNotIn("CorporationLittle", text)            # the original glue bug
        self.assertIn("\t", text)
        company, location = pfr._company_location(text.strip())
        self.assertEqual(company, "Acme Corporation")
        self.assertEqual(location, "Little Rock, AR")


if __name__ == "__main__":
    unittest.main()
