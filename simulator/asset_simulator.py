"""
SmartCare realistic hospital asset simulator.

Publishes simulated asset locations over MQTT.

Topic:
    assets/<asset_id>/location

Payload:
    {
        "id": "Ventilator-01",
        "room": "ICU",
        "timestamp": "...",
        "source": "simulator"
    }

Features:
    - Realistic asset-specific movement
    - Randomized movement between hospital zones
    - Occasional unauthorized-zone entries
    - Compatible with the existing MQTT payload format
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt


ROOT = Path(__file__).resolve().parent.parent

INTERVAL_SECONDS = 3

# Normal hospital movement routes.
# Every normal zone listed here is authorized for that asset.
NORMAL_ROUTES = {
    "Wheelchair-01": [
        "ENTRANCE",
        "WARD_A",
        "WARD_B",
        "EMERGENCY",
    ],
    "Ventilator-01": [
        "ICU",
        "WARD_A",
        "ICU",
        "EMERGENCY",
    ],
    "InfusionPump-01": [
        "WARD_A",
        "WARD_B",
        "STORAGE",
        "ICU",
    ],
    "EmergencyKit-01": [
        "EMERGENCY",
        "ICU",
        "WARD_A",
        "WARD_B",
    ],
    "MedicalMonitor-01": [
        "WARD_A",
        "WARD_B",
        "ICU",
        "LAB",
    ],
}

def load_json(path):
    """Load a JSON configuration file."""
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def utc_now():
    """Return the current UTC timestamp."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Simulate realistic hospital asset movements over MQTT."
    )

    parser.add_argument(
        "--asset",
        default="all",
        help="Asset ID to simulate, or 'all' for all configured assets.",
    )

    parser.add_argument(
        "--rooms",
        nargs="+",
        default=None,
        metavar="ZONE",
        help="Optional fixed route, for example: ICU WARD_A LAB ICU.",
    )

    parser.add_argument(
        "--interval",
        type=float,
        default=INTERVAL_SECONDS,
        help="Seconds between location messages (default: 3).",
    )

    parser.add_argument(
        "--steps",
        type=int,
        default=0,
        help="Number of messages per asset; 0 means continuous.",
    )

    parser.add_argument(
        "--violation-chance",
        type=float,
        default=0.12,
        help="Chance of selecting an unauthorized zone at a route decision (0-1).",
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for repeatable simulations.",
    )

    return parser.parse_args()


def choose_next_zone(asset, current_zone, normal_route, zones, violation_chance):
    """
    Select the next zone.

    Usually selects a zone from the asset's normal route.
    Occasionally selects an unauthorized zone to simulate a violation.
    """

    allowed = set(asset["allowed_zones"])

    # Prefer zones on the asset's normal route.
    normal_candidates = [
        zone
        for zone in normal_route
        if zone in zones and zone != current_zone
    ]

    # If the route has no alternative zone, stay in the current zone.
    if not normal_candidates:
        normal_candidates = [current_zone]

    # Select only zones that are not authorized for this asset.
    unauthorized_candidates = [
        zone
        for zone in zones
        if zone not in allowed and zone != current_zone
    ]

    # Occasionally simulate unauthorized movement.
    if unauthorized_candidates and random.random() < violation_chance:
        destination = random.choice(unauthorized_candidates)

        print(
            f"[SIMULATION] {asset['id']} will enter unauthorized zone "
            f"{destination}"
        )

        return destination

    return random.choice(normal_candidates)


def publish_location(client, asset_id, room):
    """Publish one location update using the existing MQTT schema."""

    topic = f"assets/{asset_id}/location"

    payload = {
        "id": asset_id,
        "room": room,
        "timestamp": utc_now(),
        "source": "simulator",
    }

    info = client.publish(
        topic,
        json.dumps(payload),
        qos=1,
    )

    info.wait_for_publish(timeout=5)

    if not info.is_published():
        print(f"[WARNING] Publish not confirmed for {asset_id}")

    print(f"[PUBLISH] {topic} -> {json.dumps(payload)}")


def main():
    args = parse_args()

    if args.interval <= 0:
        sys.exit("[ERROR] Interval must be greater than zero.")

    if args.steps < 0:
        sys.exit("[ERROR] Steps cannot be negative.")

    if not 0 <= args.violation_chance <= 1:
        sys.exit("[ERROR] Violation chance must be between 0 and 1.")

    if args.seed is not None:
        random.seed(args.seed)

    config_dir = ROOT / "config"

    system_config = load_json(config_dir / "system_config.json")
    asset_config = load_json(config_dir / "assets.json")["assets"]

    zones = list(system_config["hospital"]["zones"])
    zone_set = set(zones)

    assets = {
        asset["id"]: asset
        for asset in asset_config
    }

    # Validate the normal routes against the configured assets and zones.
    for asset_id, route in NORMAL_ROUTES.items():
        if asset_id not in assets:
            sys.exit(
                f"[ERROR] Route configured for unknown asset: {asset_id}"
            )

        invalid_zones = [zone for zone in route if zone not in zone_set]

        if invalid_zones:
            sys.exit(
                f"[ERROR] Invalid zones in route for {asset_id}: "
                f"{invalid_zones}"
            )

        unauthorized_normal_zones = [
            zone
            for zone in route
            if zone not in assets[asset_id]["allowed_zones"]
        ]

        if unauthorized_normal_zones:
            sys.exit(
                f"[ERROR] Normal route contains unauthorized zones for "
                f"{asset_id}: {unauthorized_normal_zones}"
            )

    if args.asset.lower() == "all":
        selected_assets = list(assets.values())
    else:
        if args.asset not in assets:
            sys.exit(
                f"[ERROR] {args.asset} not found in config/assets.json"
            )

        selected_assets = [assets[args.asset]]

    if args.rooms:
        invalid_zones = [zone for zone in args.rooms if zone not in zone_set]

        if invalid_zones:
            sys.exit(
                f"[ERROR] Zones not in system_config.json: {invalid_zones}"
            )

        if len(selected_assets) != 1:
            sys.exit(
                "[ERROR] Use --rooms with a single asset, not --asset all."
            )

    broker = system_config["mqtt"]["broker"]
    port = system_config["mqtt"]["port"]

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"simulator-{random.randint(1000, 999999)}",
    )

    print(f"[INFO] Connecting to MQTT broker {broker}:{port} ...")

    try:
        client.connect(broker, port, keepalive=30)
    except OSError as error:
        sys.exit(
            f"[ERROR] Cannot reach broker at {broker}:{port} ({error}). "
            "Is Mosquitto running?"
        )

    client.loop_start()

    try:
        # Preserve fixed-route testing when --rooms is supplied.
        if args.rooms:
            asset_id = selected_assets[0]["id"]

            for index in range(args.steps or len(args.rooms)):
                room = args.rooms[index % len(args.rooms)]

                publish_location(client, asset_id, room)

                if args.steps == 0 and index == len(args.rooms) - 1:
                    break

                time.sleep(args.interval)

        else:
            # Initialize every selected asset in an authorized zone.
            current_zones = {}

            for asset in selected_assets:
                route = NORMAL_ROUTES.get(asset["id"])

                if not route:
                    sys.exit(
                        f"[ERROR] No normal route configured for {asset['id']}"
                    )

                current_zones[asset["id"]] = route[0]

            print(
                f"[INFO] Simulating {len(selected_assets)} asset(s). "
                f"Interval: {args.interval}s. "
                f"Violation chance: {args.violation_chance:.0%}."
            )

            step = 0

            while args.steps == 0 or step < args.steps:
                for asset in selected_assets:
                    asset_id = asset["id"]
                    route = NORMAL_ROUTES[asset_id]

                    if step == 0:
                        destination = current_zones[asset_id]
                    else:
                        destination = choose_next_zone(
                            asset=asset,
                            current_zone=current_zones[asset_id],
                            normal_route=route,
                            zones=zones,
                            violation_chance=args.violation_chance,
                        )

                    current_zones[asset_id] = destination

                    publish_location(
                        client,
                        asset_id,
                        destination,
                    )

                step += 1

                if args.steps == 0 or step < args.steps:
                    time.sleep(args.interval)

        print("[INFO] Simulation finished.")

    except KeyboardInterrupt:
        print("\n[INFO] Simulation interrupted by user.")

    finally:
        client.loop_stop()
        client.disconnect()
        print("[INFO] Disconnected cleanly.")


if __name__ == "__main__":
    main()