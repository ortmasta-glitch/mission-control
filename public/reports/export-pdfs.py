#!/usr/bin/env python3
"""
Batch PDF export for WCP reports using Playwright.
Reads all HTML files from reportpdfexport/, renders them, and saves PDFs.
"""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE, "pdfs")
os.makedirs(PDF_DIR, exist_ok=True)


async def export_all():
    html_files = sorted(f for f in os.listdir(BASE) if f.endswith('.html'))
    print(f"Found {len(html_files)} HTML files to export")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        success = 0
        failed = 0

        for i, fname in enumerate(html_files, 1):
            html_path = os.path.join(BASE, fname)
            pdf_name = fname.replace('.html', '.pdf')
            pdf_path = os.path.join(PDF_DIR, pdf_name)

            print(f"  [{i}/{len(html_files)}] {fname} → {pdf_name}", end=" ", flush=True)

            try:
                page = await context.new_page()
                await page.goto(f"file://{html_path}", wait_until="networkidle", timeout=30000)

                # Wait for ECharts to render
                await page.wait_for_timeout(2000)

                await page.pdf(
                    path=pdf_path,
                    format="A4",
                    print_background=True,
                    margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"},
                    display_header_footer=False,
                )
                await page.close()
                print("✅")
                success += 1
            except Exception as e:
                print(f"❌ {e}")
                failed += 1

        await browser.close()
        print(f"\n=== Done: {success} exported, {failed} failed ===")
        print(f"PDFs saved to: {PDF_DIR}")


if __name__ == "__main__":
    asyncio.run(export_all())