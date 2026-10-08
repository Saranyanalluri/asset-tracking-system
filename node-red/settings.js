/**
 * OPTIONAL: only used when you start Node-RED with  --userDir .\node-red
 * It sets the config folder so you do not have to edit the path inside the flow.
 * If you import the flow into your normal Node-RED instead, this file is not needed.
 */
const path = require("path");
process.env.ASSET_TRACKER_CONFIG_DIR = path.resolve(__dirname, "..", "config");

module.exports = {
    flowFile: "flows.json",
    flowFilePretty: true,
    uiPort: process.env.PORT || 1880,
    uiHost: "127.0.0.1",
    credentialSecret: false,
    logging: { console: { level: "info", metrics: false, audit: false } }
};
