# SmartCare Asset Tracker Dashboard

Frontend files for the software-simulated asset tracking project.

## Files
- `index.html`: layout
- `styles.css`: responsive dark UI
- `app.js`: asset search, status badges, statistics, alert popups and polling

## Live backend contract
The dashboard requests `GET /api/state` from Node-RED and expects JSON in this shape:

```json
{
  "assets": [
    {
      "asset_id": "Ventilator-01",
      "asset_type": "Ventilator",
      "tag_id": "TAG-VT-001",
      "room": "ICU",
      "status": "AUTHORIZED",
      "violation_state": "NONE",
      "timestamp": "2026-10-09T09:00:00+05:30",
      "source": "simulator"
    }
  ],
  "events": [
    {
      "asset_id": "Ventilator-01",
      "asset_type": "Ventilator",
      "room": "LAB",
      "previous_room": "ICU",
      "status": "VIOLATION",
      "violation_state": "NEW",
      "timestamp": "2026-10-09T09:01:00+05:30",
      "reason": "Asset is not authorized in this zone"
    }
  ],
  "total_assets": 5,
  "active_assets": 5,
  "event_count": 42
}
```

The frontend intentionally does not fabricate live data. The next integration step is to add a Node-RED HTTP endpoint `/api/state` that combines current asset state with recent `asset_events` from SQLite. Until then, it will show **Backend unavailable** instead of fake values.

Serve these files from the same origin as Node-RED so relative `/api/state` requests work. Opening `index.html` directly only previews the layout and cannot access the Node-RED API correctly.
