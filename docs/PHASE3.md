# Phase 3: SQLite persistence

Every valid event leaving the Phase 2 rule engine is inserted into `database/asset_tracking.db`, table `asset_events`.
Invalid events (unknown asset/zone, bad JSON) are never stored.

## 1. Install the SQLite node (once)
Node-RED menu > Manage palette > Install > search `node-red-node-sqlite` > Install.  OR in a terminal:
    cd %USERPROFILE%\.node-red
    npm install node-red-node-sqlite
Then restart Node-RED. (Requires a Node.js LTS release that has a prebuilt sqlite3 binary; if npm tries to compile and fails, install Node.js LTS 20 or 22.)

## 2. Import the flow
Menu > Import > select `phase3_sqlite_flow.json` (also saved as `node-red/flows.json`) > Import.
Node-RED will say some nodes already exist: choose **Replace existing nodes** (the Phase 2 node IDs are kept). Deploy.
Paths inside the flow: config folder in `Set Config Paths`, database file in the SQLite config node (both already set to
C:/Users/nallu/Downloads/asset-tracking-system/...).

## 3. Test
    python simulator\asset_simulator.py --asset Ventilator-01 --rooms ICU LAB LAB LAB ICU --interval 2
    python tests\verify_phase3.py
Optional (needs the sqlite3 command-line tool):
    sqlite3 database\asset_tracking.db "SELECT COUNT(*) FROM asset_events;"
    sqlite3 database\asset_tracking.db "SELECT asset_id, room, status, violation_state FROM asset_events ORDER BY id;"

## Schema
See `database/schema.sql`. Created with CREATE ... IF NOT EXISTS on every deploy, so existing rows are never touched.
