"""Basic asset simulator: publishes Wheelchair-01 moving through fixed zones over MQTT.

Topic:   assets/<asset_id>/location
Payload: {"id", "room", "timestamp", "source"}
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parent.parent
INTERVAL_SECONDS = 3
ASSET_ID = "Wheelchair-01"
SEQUENCE = ["ENTRANCE", "WARD_A", "WARD_B", "EMERGENCY"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_args():
    ap = argparse.ArgumentParser(description="Publish simulated asset locations over MQTT.")
    ap.add_argument("--asset", default=ASSET_ID, help=f"asset id from config/assets.json (default {ASSET_ID})")
    ap.add_argument("--rooms", nargs="+", default=SEQUENCE, metavar="ZONE",
                    help="rooms to visit in order (default: ENTRANCE WARD_A WARD_B EMERGENCY)")
    ap.add_argument("--interval", type=float, default=INTERVAL_SECONDS, help="seconds between messages (default 3)")
    return ap.parse_args()


def main():
    args = parse_args()
    asset_id, sequence, interval = args.asset, args.rooms, args.interval
    cfg = load_json(ROOT / "config" / "system_config.json")
    assets = {a["id"]: a for a in load_json(ROOT / "config" / "assets.json")["assets"]}
    zones = set(cfg["hospital"]["zones"])
    if asset_id not in assets:
        sys.exit(f"[ERROR] {asset_id} not found in config/assets.json")
    bad = [z for z in sequence if z not in zones]
    if bad:
        sys.exit(f"[ERROR] Zones not in system_config.json: {bad}")

    broker, port = cfg["mqtt"]["broker"], cfg["mqtt"]["port"]
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"simulator-{asset_id}")
    print(f"[INFO] Connecting to MQTT broker {broker}:{port} ...")
    try:
        client.connect(broker, port, keepalive=30)
    except OSError as e:
        sys.exit(f"[ERROR] Cannot reach broker at {broker}:{port} ({e}). Is Mosquitto running?")

    client.loop_start()
    topic = f"assets/{asset_id}/location"
    try:
        for i, room in enumerate(sequence):
            payload = {"id": asset_id, "room": room, "timestamp": utc_now(), "source": "simulator"}
            info = client.publish(topic, json.dumps(payload), qos=1)
            info.wait_for_publish(timeout=5)
            print(f"[PUBLISH] {topic} -> {json.dumps(payload)}")
            if i < len(sequence) - 1:
                time.sleep(interval)
        print("[INFO] Sequence finished.")
    except KeyboardInterrupt:
        print("\n[INFO] Interrupted by user.")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[INFO] Disconnected cleanly.")


if __name__ == "__main__":
    main()
