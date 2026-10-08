-- Reference copy of the schema. Node-RED creates it itself on deploy (idempotent).
CREATE TABLE IF NOT EXISTS asset_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        TEXT NOT NULL,
    asset_type      TEXT,
    room            TEXT NOT NULL,
    previous_room   TEXT,
    status          TEXT NOT NULL,
    violation_state TEXT NOT NULL,
    timestamp       TEXT NOT NULL,
    source          TEXT,
    reason          TEXT,
    allowed_zones   TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_events_asset_id  ON asset_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_events_timestamp ON asset_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_asset_events_status    ON asset_events(status);
CREATE INDEX IF NOT EXISTS idx_asset_events_room      ON asset_events(room);
