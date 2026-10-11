/* =====================================================
   SMARTCARE HOSPITAL ASSET TRACKING DASHBOARD
   Backend: http://localhost:1880/api/state
   ===================================================== */

(() => {
    "use strict";

    const API_URL = "http://localhost:1880/api/state";
    const POLL_MS = 2500;

    const $ = id => document.getElementById(id);

    const state = {
        paused: false,
        connected: false,
        assets: [],
        events: [],
        seenAlerts: new Set()
    };

    const zones = [
        { id: "Z01", key: "ENTRANCE", name: "MAIN ENTRANCE", x: 12, y: 12, kind: "entrance" },
        { id: "Z02", key: "WARD_A", name: "WARD A", x: 310, y: 12, kind: "ward" },
        { id: "Z03", key: "WARD_B", name: "WARD B", x: 608, y: 12, kind: "ward" },
        { id: "Z04", key: "STORAGE", name: "EQUIPMENT STORE", x: 12, y: 182, kind: "storage" },
        { id: "Z05", key: "LAB", name: "LABORATORY", x: 310, y: 182, kind: "lab" },
        { id: "Z06", key: "ICU", name: "INTENSIVE CARE", x: 608, y: 182, kind: "icu" },
        { id: "Z07", key: "PHARMACY", name: "PHARMACY", x: 12, y: 352, kind: "pharmacy" },
        { id: "Z08", key: "EMERGENCY", name: "EMERGENCY", x: 310, y: 352, kind: "emergency" },
        { id: "Z09", key: "CORRIDOR", name: "MAIN CORRIDOR", x: 608, y: 352, kind: "corridor" }
    ];

    const ROOM_W = 280;
    const ROOM_H = 150;

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    function normalizeRoom(value) {
        return String(value || "UNKNOWN")
            .trim()
            .toUpperCase()
            .replaceAll(" ", "_");
    }

    function formatTime(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function isViolation(asset) {
        return String(asset?.status || "").toUpperCase() === "VIOLATION" &&
            String(asset?.violation_state || "").toUpperCase() !== "CLEARED";
    }

    function connection(connected, detail = "") {
        state.connected = connected;

        $("systemDot").className =
            "connection-dot " + (connected ? "online" : "offline");

        $("systemStatusText").textContent =
            connected ? "Backend connected" : "Backend unavailable";

        $("systemStatusSub").textContent =
            connected ? "Live Node-RED data" : "Check Node-RED API";

        $("apiStatus").className =
            "api-status " + (connected ? "connected" : "disconnected");

        $("apiStatus").textContent = connected
            ? "API connected · " + API_URL
            : "API unavailable" + (detail ? " · " + detail : "");

        $("apiIndicator").textContent = connected ? "CONNECTED" : "OFFLINE";
        $("apiIndicator").className =
            "service-state " + (connected ? "service-online" : "");
    }

    /* -------------------------------------------------
       Illustrative furniture inside hospital rooms
       ------------------------------------------------- */

    function furniture(kind) {
        switch (kind) {
            case "ward":
                return `
                    <g class="furniture">
                        <rect x="20" y="43" width="70" height="32" rx="5" class="cabinet"/>
                        <rect x="25" y="47" width="18" height="23" rx="3" class="linen"/>
                        <rect x="46" y="47" width="38" height="23" rx="3" class="mattress"/>
                        <path d="M20 40v38 M90 40v38 M20 40h70" class="furniture-line"/>

                        <rect x="111" y="43" width="70" height="32" rx="5" class="cabinet"/>
                        <rect x="116" y="47" width="18" height="23" rx="3" class="linen"/>
                        <rect x="137" y="47" width="38" height="23" rx="3" class="mattress"/>
                        <path d="M111 40v38 M181 40v38 M111 40h70" class="furniture-line"/>

                        <rect x="204" y="43" width="27" height="27" rx="4" class="screen"/>
                        <path d="M217 70v15m-8-8h16" class="furniture-line"/>

                        <circle cx="248" cy="51" r="7" class="person-head"/>
                        <path d="M248 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>
                    </g>`;
            case "icu":
                return `
                    <g class="furniture">
                        <rect x="18" y="43" width="66" height="34" rx="5" class="cabinet"/>
                        <rect x="23" y="47" width="17" height="25" rx="3" class="linen"/>
                        <rect x="44" y="47" width="35" height="25" rx="3" class="mattress"/>
                        <path d="M18 40v40 M84 40v40 M18 40h66" class="furniture-line"/>

                        <rect x="101" y="43" width="30" height="32" rx="4" class="cabinet"/>
                        <rect x="106" y="48" width="20" height="11" rx="2" class="screen"/>
                        <path d="M116 59v15m-6-8h12" class="monitor-line"/>

                        <rect x="148" y="45" width="23" height="29" rx="4" class="cabinet"/>
                        <circle cx="159" cy="52" r="4" class="screen"/>
                        <path d="M159 59v12" class="monitor-line"/>

                        <circle cx="223" cy="51" r="7" class="person-head"/>
                        <path d="M223 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>
                    </g>`;
            case "entrance":
                return `
                    <g class="furniture">
                        <rect x="20" y="45" width="105" height="27" rx="4" class="counter"/>
                        <rect x="27" y="50" width="25" height="7" rx="2" class="screen"/>
                        <path d="M28 63h87" class="furniture-line"/>

                        <circle cx="165" cy="51" r="7" class="person-head"/>
                        <path d="M165 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>

                        <circle cx="210" cy="51" r="7" class="person-head visitor"/>
                        <path d="M210 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="visitor-body"/>

                        <path d="M132 99h110" class="floor-line"/>
                    </g>`;
            case "storage":
                return `
                    <g class="furniture">
                        <rect x="20" y="42" width="60" height="51" rx="3" class="shelf"/>
                        <path d="M20 59h60 M20 76h60" class="furniture-line"/>
                        <rect x="27" y="46" width="17" height="10" rx="2" class="box"/>
                        <rect x="49" y="46" width="23" height="10" rx="2" class="box"/>
                        <rect x="27" y="63" width="25" height="10" rx="2" class="box"/>
                        <rect x="56" y="63" width="16" height="10" rx="2" class="box"/>

                        <rect x="100" y="42" width="60" height="51" rx="3" class="shelf"/>
                        <path d="M100 59h60 M100 76h60" class="furniture-line"/>
                        <rect x="108" y="46" width="20" height="10" rx="2" class="box"/>
                        <rect x="133" y="46" width="19" height="10" rx="2" class="box"/>
                        <rect x="108" y="63" width="44" height="10" rx="2" class="box"/>

                        <rect x="188" y="48" width="35" height="30" rx="4" class="cart"/>
                        <circle cx="194" cy="82" r="4" class="wheel"/>
                        <circle cx="217" cy="82" r="4" class="wheel"/>
                    </g>`;
            case "lab":
                return `
                    <g class="furniture">
                        <rect x="20" y="43" width="86" height="22" rx="3" class="counter"/>
                        <rect x="27" y="48" width="16" height="11" rx="2" class="screen"/>
                        <rect x="49" y="48" width="16" height="11" rx="2" class="glassware"/>
                        <rect x="71" y="48" width="27" height="11" rx="2" class="glassware"/>

                        <rect x="20" y="71" width="86" height="14" rx="3" class="cabinet"/>
                        <rect x="124" y="43" width="50" height="42" rx="4" class="counter"/>
                        <circle cx="140" cy="56" r="8" class="glassware"/>
                        <path d="M154 49h13v23h-13z" class="furniture-line"/>

                        <circle cx="220" cy="51" r="7" class="person-head"/>
                        <path d="M220 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>
                    </g>`;
            case "pharmacy":
                return `
                    <g class="furniture">
                        <rect x="20" y="42" width="82" height="20" rx="3" class="shelf"/>
                        <path d="M24 51h74" class="furniture-line"/>
                        <rect x="27" y="45" width="9" height="5" class="medicine"/>
                        <rect x="41" y="45" width="9" height="5" class="medicine-alt"/>
                        <rect x="55" y="45" width="9" height="5" class="medicine"/>
                        <rect x="69" y="45" width="9" height="5" class="medicine-alt"/>
                        <rect x="83" y="45" width="9" height="5" class="medicine"/>

                        <rect x="20" y="69" width="110" height="20" rx="4" class="counter"/>
                        <rect x="28" y="74" width="25" height="10" rx="2" class="screen"/>
                        <rect x="147" y="42" width="39" height="46" rx="4" class="fridge"/>
                        <path d="M166 42v46" class="furniture-line"/>
                    </g>`;
            case "emergency":
                return `
                    <g class="furniture">
                        <rect x="20" y="43" width="72" height="35" rx="5" class="bed-emergency"/>
                        <rect x="25" y="48" width="18" height="25" rx="3" class="linen"/>
                        <rect x="47" y="48" width="39" height="25" rx="3" class="mattress"/>
                        <path d="M20 40v41 M92 40v41 M20 40h72" class="furniture-line"/>

                        <rect x="106" y="44" width="28" height="31" rx="4" class="cabinet"/>
                        <rect x="111" y="49" width="18" height="10" rx="2" class="screen"/>

                        <rect x="154" y="46" width="26" height="26" rx="4" class="medical-kit"/>
                        <path d="M167 51v16m-8-8h16" class="kit-cross"/>

                        <circle cx="220" cy="51" r="7" class="person-head"/>
                        <path d="M220 58v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>
                    </g>`;
            case "corridor":
                return `
                    <g class="furniture">
                        <path d="M15 47h250 M15 87h250" class="floor-line"/>
                        <rect x="38" y="54" width="39" height="25" rx="4" class="cart"/>
                        <circle cx="45" cy="82" r="4" class="wheel"/>
                        <circle cx="70" cy="82" r="4" class="wheel"/>

                        <circle cx="132" cy="54" r="7" class="person-head"/>
                        <path d="M132 61v20m-8-10h16m-8 10-6 10m6-10 6 10" class="person"/>

                        <rect x="190" y="53" width="40" height="26" rx="4" class="bench"/>
                    </g>`;
            default:
                return "";
        }
    }

    /* -------------------------------------------------
       Asset markers
       ------------------------------------------------- */

    function assetGlyph(asset) {
        const value = (
            String(asset.asset_type || "") + " " +
            String(asset.asset_id || "")
        ).toLowerCase();

        if (value.includes("wheel")) return "W";
        if (value.includes("vent")) return "V";
        if (value.includes("pump")) return "P";
        if (value.includes("kit")) return "+";
        if (value.includes("monitor")) return "M";

        return "•";
    }

    function renderMarkers(assets) {
        return assets.map((asset, index) => {
            const bad = isViolation(asset);
            const x = 24 + (index % 3) * 82;
            const y = 105 + Math.floor(index / 3) * 23;
            const name = String(asset.asset_id || "Asset");
            const shortName = name
                .replace(/-(01|001)$/i, "")
                .slice(0, 9);

            return `
                <g class="asset-marker ${bad ? "marker-danger" : "marker-normal"}"
                   transform="translate(${x},${y})"
                   tabindex="0"
                   role="button"
                   data-asset="${esc(name)}"
                   data-room="${esc(asset.room || "UNKNOWN")}"
                   data-status="${bad ? "VIOLATION" : esc(asset.status || "AUTHORIZED")}"
                   aria-label="${esc(name)} in ${esc(asset.room || "UNKNOWN")}">

                    <title>${esc(name)} — ${bad ? "Zone violation" : "Reported asset"}</title>

                    <rect width="76" height="19" rx="6"></rect>
                    <circle cx="10" cy="9.5" r="6"></circle>
                    <text x="10" y="12.5" text-anchor="middle">${assetGlyph(asset)}</text>
                    <text class="marker-label" x="20" y="12.5">${esc(shortName)}</text>
                </g>
            `;
        }).join("");
    }

    /* -------------------------------------------------
       Build the SVG hospital floor plan
       ------------------------------------------------- */

    function renderFloorPlan() {
        const roomSvg = zones.map(zone => {
            const assets = state.assets.filter(
                asset => normalizeRoom(asset.room) === zone.key
            );

            const hasViolation = assets.some(isViolation);

            return `
                <g class="map-room ${hasViolation ? "room-danger" : ""}"
                   transform="translate(${zone.x},${zone.y})">

                    <rect class="room-shell"
                          width="${ROOM_W}"
                          height="${ROOM_H}"
                          rx="8"></rect>

                    <rect class="room-floor"
                          x="5" y="29"
                          width="${ROOM_W - 10}"
                          height="${ROOM_H - 34}"
                          rx="3"></rect>

                    <path class="room-wall" d="M0 29H280"></path>

                    <text class="room-title" x="12" y="19">
                        ${zone.name}
                    </text>

                    <text class="room-code" x="265" y="19" text-anchor="end">
                        ${zone.id}
                    </text>

                    ${furniture(zone.kind)}

                    <rect class="zone-counter"
                          x="216" y="35"
                          width="53" height="17"
                          rx="5"></rect>

                    <text class="zone-counter-text"
                          x="242.5" y="46.5"
                          text-anchor="middle">
                        ${assets.length} ASSET${assets.length === 1 ? "" : "S"}
                    </text>

                    ${renderMarkers(assets)}

                    ${hasViolation ? `
                        <g class="violation-flag">
                            <circle cx="258" cy="65" r="9"></circle>
                            <text x="258" y="69" text-anchor="middle">!</text>
                        </g>
                    ` : ""}

                </g>
            `;
        }).join("");

        $("floorplanGrid").innerHTML = `
            <div class="hospital-map-wrap">

                <div class="map-topline">
                    <span><i class="map-live-dot"></i> HOSPITAL · LEVEL 01</span>
                    <span>9 zones · ${state.assets.length} registered assets</span>
                </div>

                <svg class="hospital-map"
                     viewBox="0 0 900 514"
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg"
                     role="img"
                     aria-label="Simulated hospital floor plan with nine zones">

                    <defs>
                        <pattern id="floorTiles"
                                 width="16"
                                 height="16"
                                 patternUnits="userSpaceOnUse">
                            <path d="M16 0H0V16"
                                  fill="none"
                                  stroke="#d9e3e9"
                                  stroke-width=".6"></path>
                        </pattern>
                    </defs>

                    <rect class="map-background"
                          width="900" height="514" rx="8"></rect>

                    <path class="map-corridor-line"
                          d="M292 12V502 M590 12V502 M12 172H888 M12 342H888"></path>

                    <path class="map-walkway"
                          d="M292 12V502 M590 12V502 M12 172H888 M12 342H888"></path>

                    ${roomSvg}

                    <g class="map-compass" transform="translate(855,477)">
                        <circle r="18"></circle>
                        <path d="M0 -12L-5 4L0 1L5 4Z"></path>
                        <text x="0" y="-24" text-anchor="middle">N</text>
                    </g>

                </svg>

                <div class="map-key">
                    <span><i class="key-square normal-key"></i> Authorized asset</span>
                    <span><i class="key-square danger-key"></i> Zone violation</span>
                    <span><i class="key-person"></i> Staff / visitor illustration</span>
                    <small>Furniture and people are illustrative. Asset locations are supplied by the software simulator.</small>
                </div>
            </div>
        `;

        $("floorplanGrid").querySelectorAll(".asset-marker").forEach(marker => {
            const showDetails = () => {
                const name = marker.dataset.asset || "Asset";
                const roomName = marker.dataset.room || "UNKNOWN";
                const status = marker.dataset.status || "UNKNOWN";

                showToast(
                    name,
                    `${roomName.replaceAll("_", " ")} · ${status}`,
                    status === "VIOLATION"
                );
            };

            marker.addEventListener("click", showDetails);

            marker.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    showDetails();
                }
            });
        });
    }

    /* -------------------------------------------------
       Dashboard metrics
       ------------------------------------------------- */

    function renderMetrics(data) {
        const total = Number.isFinite(Number(data.total_assets))
            ? Number(data.total_assets)
            : state.assets.length;

        const active = Number.isFinite(Number(data.active_assets))
            ? Number(data.active_assets)
            : state.assets.filter(asset => {
                const r = normalizeRoom(asset.room);
                return r !== "UNKNOWN" && r !== "UNASSIGNED";
            }).length;

        const violations = state.assets.filter(isViolation).length;

        const events = Number.isFinite(Number(data.event_count))
            ? Number(data.event_count)
            : state.events.length;

        $("totalAssets").textContent = total;
        $("activeAssets").textContent = active;
        $("openViolations").textContent = violations;
        $("eventCount").textContent = events;

        $("violationFoot").textContent = violations
            ? "Requires attention"
            : "No open violations";

        $("lastUpdated").textContent =
            "Last update: " + new Date().toLocaleTimeString();
    }

    /* -------------------------------------------------
       Inventory table
       ------------------------------------------------- */

    function renderInventory() {
        const query = $("assetSearch").value.trim().toLowerCase();

        const filtered = state.assets.filter(asset => [
            asset.asset_id,
            asset.asset_type,
            asset.room,
            asset.tag_id,
            asset.status
        ].some(value => String(value || "").toLowerCase().includes(query)));

        $("assetRowsLabel").textContent =
            `${filtered.length} of ${state.assets.length} assets`;

        if (!filtered.length) {
            $("assetTableBody").innerHTML = `
                <tr>
                    <td colspan="5" class="empty-cell">
                        ${state.assets.length
                            ? "No assets match your search."
                            : "No asset data received from Node-RED."}
                    </td>
                </tr>
            `;
            return;
        }

        $("assetTableBody").innerHTML = filtered.map(asset => {
            const bad = isViolation(asset);
            const type = String(asset.asset_type || "").toLowerCase();

            const symbol = type.includes("wheel") ? "◉"
                : type.includes("vent") ? "⌁"
                : type.includes("pump") ? "◈"
                : type.includes("kit") ? "+"
                : type.includes("monitor") ? "▣"
                : "◇";

            const status = bad
                ? (
                    String(asset.violation_state || "").toUpperCase() === "ONGOING"
                        ? "ONGOING VIOLATION"
                        : "VIOLATION"
                )
                : (asset.status || "UNKNOWN");

            const badge = bad
                ? "violation"
                : String(asset.status || "").toUpperCase() === "AUTHORIZED"
                    ? "authorized"
                    : "unknown";

            return `
                <tr>
                    <td>
                        <div class="asset-name-cell">
                            <div class="asset-symbol">${symbol}</div>
                            <div>
                                <div class="asset-main">
                                    ${esc(asset.asset_id || "Unknown asset")}
                                </div>
                                <div class="asset-sub">
                                    ${esc(asset.tag_id || "TAG NOT REPORTED")}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>${esc(asset.asset_type || "Unknown")}</td>
                    <td><span class="zone-label">${esc(asset.room || "UNKNOWN")}</span></td>
                    <td>${esc(formatTime(asset.timestamp))}</td>
                    <td><span class="status-badge ${badge}">${esc(status)}</span></td>
                </tr>
            `;
        }).join("");
    }

    /* -------------------------------------------------
       Alert list
       ------------------------------------------------- */

    function renderAlerts() {
        const alerts = state.events.filter(event =>
            ["NEW", "CLEARED"].includes(
                String(event.violation_state || "").toUpperCase()
            )
        ).slice(0, 7);

        $("alertCountPill").textContent = `${alerts.length} alerts`;

        if (!alerts.length) {
            $("alertList").innerHTML = `
                <div class="loading-state">No recent violation alerts.</div>
            `;
            return;
        }

        $("alertList").innerHTML = alerts.map(event => {
            const cleared =
                String(event.violation_state || "").toUpperCase() === "CLEARED";

            return `
                <div class="alert-item ${cleared ? "cleared" : ""}">
                    <div class="alert-title-row">
                        <span class="alert-title">
                            ${cleared ? "Violation cleared" : "Zone violation"}
                        </span>
                        <span class="alert-state">
                            ${cleared ? "CLEARED" : "NEW"}
                        </span>
                    </div>

                    <div class="alert-desc">
                        <strong>${esc(event.asset_id || "Unknown asset")}</strong>
                        · ${esc(event.previous_room || "Unknown")}
                        → ${esc(event.room || "Unknown")}
                        <br>
                        ${esc(event.reason || (
                            cleared
                                ? "Asset returned to an authorized zone"
                                : "Unauthorized zone entry"
                        ))}
                    </div>

                    <div class="alert-time">${esc(formatTime(event.timestamp))}</div>
                </div>
            `;
        }).join("");
    }

    /* -------------------------------------------------
       Event history
       ------------------------------------------------- */

    function renderHistory() {
        const events = state.events.slice(0, 8);

        if (!events.length) {
            $("activityList").innerHTML = `
                <div class="loading-state">No events received yet.</div>
            `;
            return;
        }

        $("activityList").innerHTML = events.map(event => {
            const status = String(event.violation_state || "").toUpperCase();

            const bad = ["NEW", "ONGOING"].includes(status) ||
                String(event.status || "").toUpperCase() === "VIOLATION";

            const cleared = status === "CLEARED";

            const title = cleared
                ? "Violation cleared"
                : status === "NEW"
                    ? "Zone violation detected"
                    : status === "ONGOING"
                        ? "Violation remains open"
                        : "Asset location updated";

            return `
                <div class="activity-row">
                    <div class="activity-symbol ${bad ? "danger" : cleared ? "good" : ""}">
                        ${cleared ? "✓" : bad ? "!" : "↗"}
                    </div>

                    <div>
                        <div class="activity-main">
                            <strong>${esc(event.asset_id || "Unknown asset")}</strong>
                            · ${title}
                        </div>
                        <div class="activity-sub">
                            ${esc(event.previous_room || "—")}
                            → ${esc(event.room || "—")}
                            · ${esc(event.status || "UNKNOWN")}
                        </div>
                    </div>

                    <div class="activity-time">
                        ${esc(formatTime(event.timestamp))}
                    </div>
                </div>
            `;
        }).join("");
    }

    /* -------------------------------------------------
       Toasts for newly received violation events
       ------------------------------------------------- */

    function showToast(title, message, bad = true) {
        const element = document.createElement("div");
        element.className = "toast" + (bad ? "" : " cleared");

        const heading = document.createElement("strong");
        heading.textContent = title;

        const body = document.createElement("span");
        body.textContent = message;

        element.append(heading, body);
        $("toastRegion").appendChild(element);

        setTimeout(() => element.remove(), 6000);
    }

    function processNewAlerts(events) {
        for (const event of events) {
            const status = String(event.violation_state || "").toUpperCase();

            if (!["NEW", "CLEARED"].includes(status)) continue;

            const key = [
                event.asset_id,
                event.timestamp,
                status,
                event.room
            ].join("|");

            if (state.seenAlerts.has(key)) continue;

            state.seenAlerts.add(key);

            if (state.seenAlerts.size > 500) {
                state.seenAlerts = new Set(
                    [...state.seenAlerts].slice(-250)
                );
            }

            showToast(
                status === "NEW" ? "Zone violation detected" : "Violation cleared",
                `${event.asset_id || "Asset"} · ${event.room || "Unknown zone"}`,
                status === "NEW"
            );
        }
    }

    /* -------------------------------------------------
       Main render
       ------------------------------------------------- */

    function render(data) {
        state.assets = Array.isArray(data.assets) ? data.assets : [];
        state.events = Array.isArray(data.events) ? data.events : [];

        renderMetrics(data);
        renderFloorPlan();
        renderInventory();
        renderAlerts();
        renderHistory();
    }

    /* -------------------------------------------------
       Backend polling
       ------------------------------------------------- */

    async function refresh() {
        if (state.paused) return;

        try {
            const response = await fetch(API_URL, {
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const data = await response.json();

            if (!data || typeof data !== "object") {
                throw new Error("Invalid API response");
            }

            if (!Array.isArray(data.assets) ||
                !Array.isArray(data.events)) {
                throw new Error("API response must contain assets and events arrays");
            }

            connection(true);
            processNewAlerts(data.events);
            render(data);

        } catch (error) {
            connection(false, error.message);
            console.error("SmartCare API error:", error);
        }
    }

    /* -------------------------------------------------
       Controls
       ------------------------------------------------- */

    $("refreshBtn").addEventListener("click", refresh);

    $("pauseBtn").addEventListener("click", () => {
        state.paused = !state.paused;

        $("pauseBtn").textContent = state.paused
            ? "▶ Resume"
            : "Ⅱ Pause";

        if (!state.paused) {
            refresh();
        } else {
            $("apiStatus").textContent = "Updates paused";
        }
    });

    $("assetSearch").addEventListener("input", renderInventory);

    $("viewAllAlerts").addEventListener("click", () => {
        $("history").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    /* -------------------------------------------------
       Clock and startup
       ------------------------------------------------- */

    function updateClock() {
        $("clock").textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }

    updateClock();
    setInterval(updateClock, 1000);

    refresh();
    setInterval(refresh, POLL_MS);

})();