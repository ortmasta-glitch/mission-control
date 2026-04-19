#!/usr/bin/env python3
"""Merge all WCP report PDFs into one master PDF with bookmarks."""
import os
from PyPDF2 import PdfMerger

PDF_DIR = "/Users/tomaszzagala/.openclaw/workspace/reportpdfexport/pdfs"
OUTPUT = "/Users/tomaszzagala/.openclaw/workspace/reportpdfexport/WCP-Complete-Report-Suite.pdf"

# Logical ordering: master report first, then sub-reports, EN before PL
ORDER = [
    # Master report
    "WCP-Strategic-Intelligence-Report",
    "WCP-Strategic-Intelligence-Report-PL",
    # Financial
    "WCP_Financial_Health_Report_2026",
    "WCP_Financial_Health_Report_2026-PL",
    "ANALIZA-COST-ANALYSIS",
    "ANALIZA-COST-ANALYSIS-PL",
    "HR-QUALIFICATIONS-ANALYSIS",
    "HR-QUALIFICATIONS-ANALYSIS-PL",
    "HR-DEVELOPMENT-PLAN",
    "HR-DEVELOPMENT-PLAN-PL",
    # Competitor
    "COMPETITOR-ANALYSIS-REPORT",
    "COMPETITOR-ANALYSIS-REPORT-PL",
    "ANIMA-THREAT-REPORT",
    "ANIMA-THREAT-REPORT-PL",
    "ANIMA-COUNTER-STRATEGY-REPORT",
    "ANIMA-COUNTER-STRATEGY-REPORT-PL",
    "GOOGLE-ADS-OPTIMIZATION-REPORT",
    "GOOGLE-ADS-OPTIMIZATION-REPORT-PL",
    # Expansion
    "WCP-Expansion-Report-v2",
    "WCP-Expansion-Report-v2-PL",
    # Social & Online
    "SOCIAL-MEDIA-ACTIVATION-REPORT",
    "SOCIAL-MEDIA-ACTIVATION-REPORT-PL",
    "ONLINE-THERAPY-PROMOTION-PLAN",
    "ONLINE-THERAPY-PROMOTION-PLAN-PL",
]

# Friendly bookmark titles
TITLES = {
    "WCP-Strategic-Intelligence-Report": "Strategic Intelligence Report (EN)",
    "WCP-Strategic-Intelligence-Report-PL": "Raport Wywiadu Strategicznego (PL)",
    "WCP_Financial_Health_Report_2026": "Financial Health Report 2026 (EN)",
    "WCP_Financial_Health_Report_2026-PL": "Raport Zdrowia Finansowego 2026 (PL)",
    "ANALIZA-COST-ANALYSIS": "ANALIZA Cost Analysis (EN)",
    "ANALIZA-COST-ANALYSIS-PL": "ANALIZA Analiza Kosztów (PL)",
    "HR-QUALIFICATIONS-ANALYSIS": "HR Qualifications Analysis (EN)",
    "HR-QUALIFICATIONS-ANALYSIS-PL": "Analiza Kwalifikacji HR (PL)",
    "HR-DEVELOPMENT-PLAN": "HR Development Plan (EN)",
    "HR-DEVELOPMENT-PLAN-PL": "Plan Rozwoju HR (PL)",
    "COMPETITOR-ANALYSIS-REPORT": "Competitor Analysis (EN)",
    "COMPETITOR-ANALYSIS-REPORT-PL": "Analiza Konkurencji (PL)",
    "ANIMA-THREAT-REPORT": "ANIMA Threat Report (EN)",
    "ANIMA-THREAT-REPORT-PL": "Raport Zagrożenia ANIMA (PL)",
    "ANIMA-COUNTER-STRATEGY-REPORT": "ANIMA Counter-Strategy (EN)",
    "ANIMA-COUNTER-STRATEGY-REPORT-PL": "Kontrstrategia ANIMA (PL)",
    "GOOGLE-ADS-OPTIMIZATION-REPORT": "Google Ads Optimization (EN)",
    "GOOGLE-ADS-OPTIMIZATION-REPORT-PL": "Optymalizacja Google Ads (PL)",
    "WCP-Expansion-Report-v2": "Expansion Report v2 (EN)",
    "WCP-Expansion-Report-v2-PL": "Raport Ekspansji v2 (PL)",
    "SOCIAL-MEDIA-ACTIVATION-REPORT": "Social Media Activation (EN)",
    "SOCIAL-MEDIA-ACTIVATION-REPORT-PL": "Aktywacja w Mediach Społecznościowych (PL)",
    "ONLINE-THERAPY-PROMOTION-PLAN": "Online Therapy Promotion (EN)",
    "ONLINE-THERAPY-PROMOTION-PLAN-PL": "Promocja Terapii Online (PL)",
}

merger = PdfMerger()
added = 0
skipped = 0

for name in ORDER:
    pdf_path = os.path.join(PDF_DIR, f"{name}.pdf")
    if not os.path.exists(pdf_path):
        print(f"  ⚠️ Missing: {name}.pdf")
        skipped += 1
        continue
    bookmark = TITLES.get(name, name)
    merger.append(pdf_path, outline_item=bookmark)
    added += 1
    print(f"  ✅ {bookmark}")

# Catch any files not in ORDER
existing = set(f.replace('.pdf', '') for f in os.listdir(PDF_DIR) if f.endswith('.pdf'))
ordered = set(ORDER)
extra = existing - ordered
for name in sorted(extra):
    pdf_path = os.path.join(PDF_DIR, f"{name}.pdf")
    merger.append(pdf_path, outline_item=name)
    added += 1
    print(f"  ✅ (extra) {name}")

merger.write(OUTPUT)
merger.close()

size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
print(f"\n=== Master PDF: {OUTPUT} ===")
print(f"=== {added} reports merged, {skipped} skipped, {size_mb:.1f} MB ===")