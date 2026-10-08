# Phase 2: Node-RED MQTT integration + zone rule engine

Flow: `MQTT - Asset Location` (assets/+/location) -> `Parse Location JSON` -> `Validate Asset Event`
-> `Zone Violation Rule Engine` -> debug nodes (`Authorized Event`, `Violation Event`, `Invalid Event`, `Processed Event`).

Assets, zones and the broker address are NOT duplicated in the flow. `node-red/settings.js` loads
`config/assets.json` and `config/system_config.json` at startup. Restart Node-RED after editing them.

## Run (Windows PowerShell, from the project root)
1. Make sure the Mosquitto service is running.
2. `node-red --userDir .\node-red`   (editor: http://127.0.0.1:1880, open the Debug sidebar)
3. In another window: `.venv\Scripts\activate`
4. `python simulator\asset_simulator.py`
   Violation demo: `python simulator\asset_simulator.py --asset Ventilator-01 --rooms ICU LAB LAB LAB ICU --interval 2`

## Automated test (needs a freshly started Node-RED)
`node-red --userDir .\node-red *>&1 | Tee-Object nr.log`  then in another window  `python tests\test_phase2.py --log nr.log`

## Rule output
Fields: asset_id, asset_type, room, previous_room, status (AUTHORIZED/VIOLATION), violation_state
(NONE / NEW / ONGOING / CLEARED), timestamp, source, reason. Previous-room and violation state live in Node-RED
flow context (memory only), so they reset when Node-RED restarts.

## Import into a normal (default) Node-RED instead
Menu (top right) > Import > select a file > `node-red/flows.json` > Import. Then open the `Set Config Paths`
function node and replace `C:/EDIT/ME/asset-tracking-system/config` with your real config folder (forward slashes), Done > Deploy.
Two `Config Loaded` messages (5 assets, 8 zones) should appear in the Debug sidebar.
