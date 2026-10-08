"""Phase 3 verification: reads database/asset_tracking.db directly (Python's built-in sqlite3).

Usage:  python tests\\verify_phase3.py                 (default db: database\\asset_tracking.db)
        python tests\\verify_phase3.py --db <path>
Checks the schema, indexes, and that the LAST 5 rows are the Ventilator-01 test sequence.
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_COLS = ["id", "asset_id", "asset_type", "room", "previous_room", "status",
                 "violation_state", "timestamp", "source", "reason", "allowed_zones"]
EXPECTED_IDX = {"idx_asset_events_asset_id", "idx_asset_events_timestamp",
                "idx_asset_events_status", "idx_asset_events_room"}
EXPECTED_SEQ = [("Ventilator-01", "ICU", "AUTHORIZED", "NONE"),
                ("Ventilator-01", "LAB", "VIOLATION", "NEW"),
                ("Ventilator-01", "LAB", "VIOLATION", "ONGOING"),
                ("Ventilator-01", "LAB", "VIOLATION", "ONGOING"),
                ("Ventilator-01", "ICU", "AUTHORIZED", "CLEARED")]

ap = argparse.ArgumentParser()
ap.add_argument("--db", default=str(ROOT / "database" / "asset_tracking.db"))
args = ap.parse_args()
if not Path(args.db).exists():
    sys.exit(f"FAIL: database file not found: {args.db}")
con = sqlite3.connect(args.db)
fails = 0
def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg); fails += 0 if ok else 1

cols = [r[1] for r in con.execute("PRAGMA table_info(asset_events)")]
check(all(c in cols for c in EXPECTED_COLS), f"table asset_events has required columns ({len(cols)} columns)")
idx = {r[1] for r in con.execute("PRAGMA index_list(asset_events)")}
check(EXPECTED_IDX <= idx, "indexes on asset_id, timestamp, status, room exist")

print("\nSELECT COUNT(*) FROM asset_events;")
total = con.execute("SELECT COUNT(*) FROM asset_events").fetchone()[0]; print(" ", total)
print("\nSELECT id, asset_id, room, status, violation_state FROM asset_events ORDER BY id;")
rows = con.execute("SELECT id, asset_id, room, status, violation_state FROM asset_events ORDER BY id").fetchall()
for r in rows: print(" ", r)

last5 = [r[1:] for r in rows[-5:]]
check(last5 == EXPECTED_SEQ, "last 5 rows are Ventilator-01: ICU, LAB, LAB, LAB, ICU with NONE/NEW/ONGOING/ONGOING/CLEARED")
inv = con.execute("SELECT COUNT(*) FROM asset_events WHERE asset_id NOT IN ('Wheelchair-01','Ventilator-01','InfusionPump-01','EmergencyKit-01','MedicalMonitor-01')").fetchone()[0]
check(inv == 0, "no unknown-asset / invalid events stored")
r = con.execute("SELECT asset_type, previous_room, source, reason, allowed_zones FROM asset_events WHERE room='LAB' AND violation_state='NEW' ORDER BY id DESC LIMIT 1").fetchone()
print("\nLatest NEW violation, extra columns:", r)
check(bool(r) and r[0] == "Ventilator" and r[1] == "ICU" and r[2] == "simulator" and json.loads(r[4]) == ["ICU", "EMERGENCY", "WARD_A"],
      "asset_type, previous_room=ICU, source, allowed_zones stored as JSON text")
print("\nRESULT:", "ALL PASSED" if not fails else f"{fails} FAILURE(S)")
sys.exit(1 if fails else 0)
