"""Phase 2 test: publishes real MQTT messages and checks what Node-RED logged.

Usage (Node-RED must be freshly started so its runtime memory is empty):
    python tests/test_phase2.py --log <path-to-node-red-console-log>

On Windows, start Node-RED with its output saved, e.g. in PowerShell:
    node-red --userDir .\\node-red *>&1 | Tee-Object nr.log
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parent.parent
GAP = 0.6  # seconds between messages

# (label, raw payload or dict, expected dict of fields)
def ev(a, r):
    return {"id": a, "room": r, "timestamp": "2026-10-08T14:30:00+00:00", "source": "simulator"}

CASES = [
    ("T1 Wheelchair-01 ENTRANCE", ev("Wheelchair-01", "ENTRANCE"), dict(status="AUTHORIZED", violation_state="NONE", previous_room=None)),
    ("T2 Wheelchair-01 WARD_A", ev("Wheelchair-01", "WARD_A"), dict(status="AUTHORIZED", violation_state="NONE", previous_room="ENTRANCE")),
    ("T2b Wheelchair-01 WARD_B", ev("Wheelchair-01", "WARD_B"), dict(status="AUTHORIZED", previous_room="WARD_A")),
    ("T3 Ventilator-01 ICU", ev("Ventilator-01", "ICU"), dict(status="AUTHORIZED", violation_state="NONE", previous_room=None)),
    ("T4 Ventilator-01 LAB", ev("Ventilator-01", "LAB"), dict(status="VIOLATION", violation_state="NEW", previous_room="ICU")),
    ("T5 EmergencyKit-01 STORAGE", ev("EmergencyKit-01", "STORAGE"), dict(status="VIOLATION", violation_state="NEW", previous_room=None)),
    ("T6 Unknown-01 LAB", ev("Unknown-01", "LAB"), dict(status="INVALID", error_code="UNKNOWN_ASSET")),
    ("T7 Wheelchair-01 UNKNOWN_ROOM", ev("Wheelchair-01", "UNKNOWN_ROOM"), dict(status="INVALID", error_code="UNKNOWN_ZONE")),
    ("X1 malformed JSON", "{not json", dict(status="INVALID", error_code="MALFORMED_JSON")),
    ("X2 missing id", {"room": "LAB"}, dict(status="INVALID", error_code="MISSING_ID")),
    ("X3 missing room", {"id": "Wheelchair-01"}, dict(status="INVALID", error_code="MISSING_ROOM")),
    ("X4 empty body (rejected at JSON parse)", "", dict(status="INVALID", error_code="MALFORMED_JSON")),
    ("X5 valid JSON but not an object", "[1, 2]", dict(status="INVALID", error_code="EMPTY_OR_NOT_OBJECT")),
    # T8: reset Ventilator-01 first, then LAB x3 -> NEW, ONGOING, ONGOING
    ("T8-reset Ventilator-01 ICU", ev("Ventilator-01", "ICU"), dict(status="AUTHORIZED", violation_state="CLEARED", previous_room="LAB")),
    ("T8a Ventilator-01 LAB", ev("Ventilator-01", "LAB"), dict(status="VIOLATION", violation_state="NEW", previous_room="ICU")),
    ("T8b Ventilator-01 LAB", ev("Ventilator-01", "LAB"), dict(status="VIOLATION", violation_state="ONGOING", previous_room="LAB")),
    ("T8c Ventilator-01 LAB", ev("Ventilator-01", "LAB"), dict(status="VIOLATION", violation_state="ONGOING", previous_room="LAB")),
    # T9: recovery
    ("T9 Ventilator-01 ICU", ev("Ventilator-01", "ICU"), dict(status="AUTHORIZED", violation_state="CLEARED", previous_room="LAB")),
    ("T9b Ventilator-01 LAB", ev("Ventilator-01", "LAB"), dict(status="VIOLATION", violation_state="NEW", previous_room="ICU")),
    ("T9c Ventilator-01 ICU", ev("Ventilator-01", "ICU"), dict(status="AUTHORIZED", violation_state="CLEARED", previous_room="LAB")),
]


def parse_blocks(text):
    """Return [(node_name, {field: value})] from Node-RED console debug output."""
    out = []
    for m in re.finditer(r"\[debug:([^\]]+)\] \n\{\n(.*?)\n\}", text, re.S):
        fields = {}
        for line in m.group(2).splitlines():
            f = re.match(r"^  (\w+): (.*?),?$", line)
            if f:
                v = f.group(2)
                fields[f.group(1)] = None if v == "null" else v.strip("'")
        out.append((m.group(1), fields))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", required=True)
    args = ap.parse_args()
    cfg = json.load(open(ROOT / "config" / "system_config.json"))
    log = Path(args.log)
    start = log.stat().st_size

    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="phase2-test")
    c.connect(cfg["mqtt"]["broker"], cfg["mqtt"]["port"])
    c.loop_start()
    for label, payload, _ in CASES:
        topic = "assets/%s/location" % (payload["id"] if isinstance(payload, dict) and "id" in payload else "Test-Bad")
        body = payload if isinstance(payload, str) else json.dumps(payload)
        c.publish(topic, body, qos=1).wait_for_publish()
        time.sleep(GAP)
    time.sleep(1.5)
    c.loop_stop(); c.disconnect()

    blocks = parse_blocks(log.read_bytes()[start:].decode("utf-8", "replace"))
    final = [f for n, f in blocks if n in ("Processed Event", "Invalid Event")]
    failures = 0
    if len(final) != len(CASES):
        print(f"FAIL: expected {len(CASES)} processed/invalid events, found {len(final)}")
        failures += 1
    for (label, _, exp), got in zip(CASES, final):
        bad = {k: (v, got.get(k)) for k, v in exp.items() if got.get(k) != v}
        print(("PASS " if not bad else "FAIL ") + label + "  ->  " +
              " / ".join(str(got.get(k)) for k in ("status", "violation_state", "error_code") if got.get(k)))
        if bad:
            failures += 1; print("     expected vs got:", bad)
    n = lambda name: sum(1 for b, _ in blocks if b == name)
    exp_auth = sum(1 for _, _, e in CASES if e["status"] == "AUTHORIZED")
    exp_viol = sum(1 for _, _, e in CASES if e["status"] == "VIOLATION")
    exp_inv = sum(1 for _, _, e in CASES if e["status"] == "INVALID")
    for name, got, exp in (("Authorized Event", n("Authorized Event"), exp_auth),
                           ("Violation Event", n("Violation Event"), exp_viol),
                           ("Invalid Event", n("Invalid Event"), exp_inv)):
        ok = got == exp
        print(("PASS " if ok else "FAIL ") + f"debug routing: {name} = {got} (expected {exp})")
        failures += 0 if ok else 1
    print("\nRESULT:", "ALL PASSED" if failures == 0 else f"{failures} FAILURE(S)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
