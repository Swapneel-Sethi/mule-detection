"""Smoke-verify the /graph page (MuleGalaxy) with headless Chromium.

Start the dev server on the expected port first, e.g.:

    npx next dev -p 3235

then run this script from the repo root:

    python scripts/verify_constellation_tmp.py

Set MULE_GRAPH_BASE_URL to target a different host/port.
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = os.environ.get("MULE_GRAPH_BASE_URL", "http://127.0.0.1:3235")

screenshot_path = Path(__file__).resolve().parent / "constellation_verify.png"

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader"],
    )
    page = browser.new_page(viewport={"width": 1600, "height": 1150})
    issues = []
    page.on("console", lambda m: issues.append((m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: issues.append(("pageerror", str(e))))
    page.goto(f"{BASE_URL}/graph", wait_until="domcontentloaded", timeout=30_000)
    page.wait_for_selector("text=Network Graph", timeout=20_000)
    page.wait_for_selector("canvas", timeout=20_000)

    # Let force layout settle, normalization run, zoomToFit finish, and the
    # deliberate camera push-in complete before judging the frame coverage.
    page.wait_for_timeout(16_000)
    page.screenshot(path=str(screenshot_path), full_page=False)

    stats = page.locator("text=Nodes").first.inner_text()
    stat_values = page.locator("main").inner_text()
    boxes = []
    for index in range(page.locator("canvas").count()):
        boxes.append(page.locator("canvas").nth(index).bounding_box())
    print("TITLE_OK", page.title())
    print("CANVAS_BOXES", boxes)
    print("PAGE_TEXT_SAMPLE", " | ".join(stat_values.splitlines()[:48]))
    print("NODES_LABEL", stats)

    page.get_by_role("button", name="MULE ACCOUNTS").click()
    page.wait_for_timeout(1_500)
    page.get_by_role("button", name="WATCHLIST").click()
    page.wait_for_timeout(1_500)
    page.get_by_role("button", name="ALL FLAGGED").click()
    search = page.get_by_label("Search the network graph")
    search.fill("SBI")
    search.press("Enter")
    page.wait_for_timeout(2_000)
    page.get_by_role("button", name="RE-CENTER").click()
    page.wait_for_timeout(1_000)

    print("INTERACTIONS_OK")
    print("ISSUES", issues)
    browser.close()

if issues:
    sys.exit(f"{len(issues)} console/page error(s) captured; see ISSUES output above")
