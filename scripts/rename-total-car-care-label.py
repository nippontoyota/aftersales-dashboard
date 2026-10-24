"""One-off (2026-10-24, at the user's request): strips the literal
"(w/o Mech Care)" suffix from the 3 "Total Car Care Treatments" labels in
templates/revenue-stream-template.xlsx's shared strings — a surgical
zip/XML text edit, not a load_workbook()/save() round trip, so none of the
template's styles, merges, or conditional-formatting rules (which openpyxl
is already known to lose some of on a full re-save — see
api/revenue_stream_fill.py's docstring) are touched. Every other byte in
every other part of the xlsx is copied through unchanged.
"""

import shutil
import zipfile

PATH = "templates/revenue-stream-template.xlsx"
TARGET = "xl/sharedStrings.xml"
OLD = "(w/o Mech Care)"

with zipfile.ZipFile(PATH) as zin:
    shared = zin.read(TARGET).decode("utf-8")
    count = shared.count(OLD)
    if count != 3:
        raise SystemExit(f"Expected exactly 3 occurrences of {OLD!r}, found {count} — aborting, nothing written.")
    new_shared = shared.replace(OLD, "")

    backup_path = PATH + ".bak"
    shutil.copyfile(PATH, backup_path)

    infos = zin.infolist()
    datas = {info.filename: zin.read(info.filename) for info in infos}

datas[TARGET] = new_shared.encode("utf-8")

with zipfile.ZipFile(PATH, "w", zipfile.ZIP_DEFLATED) as zout:
    for info in infos:
        zout.writestr(info, datas[info.filename])

print(f"Replaced {count} occurrences of {OLD!r} in {TARGET}. Backup at {backup_path}.")
