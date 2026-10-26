import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from revenue_stream_fill import build_workbook  # noqa: E402
from openpyxl import load_workbook  # noqa: E402
import io  # noqa: E402

payload = {
    "date": "2026-10-24",
    "monthStart": "2026-10-01",
    "monthEnd": "2026-10-24",
    "holidays": [],
    "branches": {
        "CO01A": {
            "uniqueVinVasForTheDay": 21,
            "uniqueVinVasAchievementForTheMonth": 625,
            "totalCarCareTreatmentsForTheDay": 46,
            "totalCarCareTreatmentsAchievementForTheMonth": 968,
        },
    },
}

xlsx_bytes = build_workbook(payload)
wb = load_workbook(io.BytesIO(xlsx_bytes))
ws = wb["Sheet1"]
print("D94 (for the day):", ws["D94"].value)
print("D95 (for the month):", ws["D95"].value)
print("E94 (untouched branch, should stay as template had it or None):", ws["E94"].value)
print("A96 (target label, renamed):", ws["A96"].value)
print("A97 (for-the-day label, renamed):", ws["A97"].value)
print("A98 (for-the-month label, renamed):", ws["A98"].value)
print("D97 (Total Car Care for the day):", ws["D97"].value)
print("D98 (Total Car Care for the month):", ws["D98"].value)
