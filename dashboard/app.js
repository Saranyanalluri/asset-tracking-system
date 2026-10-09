/* SmartCare — Live Asset Tracking Dashboard
   Frontend: http://localhost:8000
   Backend:  http://localhost:1880/api/state
*/
(() => {
    "use strict";

    const API_URL = "http://localhost:1880/api/state";
    const POLL_MS = 2500;

    const zones = [
        ["Z01", "ENTRANCE", "Entrance"],
        ["Z02", "WARD_A", "Ward A"],
        ["Z03", "WARD_B", "Ward B"],
        ["Z04", "STORAGE", "Storage"],
        ["Z05", "LAB", "Laboratory"],
        ["Z06", "ICU", "ICU"],
        ["Z07", "PHARMACY", "Pharmacy"],
        ["Z08", "EMERGENCY", "Emergency"],
        ["Z09", "CORRIDOR", "Corridor"]
    ];

    const $ = id => document.getElementById(id);

    const state = {
        paused: false,
        connected: false,
        assets: [],
        events: [],
        seenAlerts: new Set()
    };

    const esc = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const room = value =>
        String(value || "UNKNOWN")
            .trim()
            .toUpperCase()
            .replaceAll(" ", "_");

    const time = value => {
        if (!value) return "—";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
    };

    const violation = asset =>
        String(asset?.status || "").toUpperCase() === "VIOLATION" &&
        String(asset?.violation_state || "").toUpperCase() !== "CLEARED";

    function connection(ok, detail = "") {
        state.connected = ok;

        $("systemDot").className =
            "system-dot " + (ok ? "online" : "offline");

        $("systemStatusText").textContent =
            ok ? "Backend connected" : "Backend unavailable";

        $("systemStatusSub").textContent =
            ok ? "Live Node-RED data" : "Waiting for /api/state";

        $("apiStatus").textContent = ok
            ? "API: connected"
            : "API: disconnected" + (detail ? " · " + detail : "");
    }

    function render(data) {
        state.assets = Array.isArray(data.assets) ? data.assets : [];
        state.events = Array.isArray(data.events) ? data.events : [];

        const totalAssets = Number.isFinite(Number(data.total_assets))
            ? Number(data.total_assets)
            : state.assets.length;

        const activeAssets = Number.isFinite(Number(data.active_assets))
            ? Number(data.active_assets)
            : state.assets.filter(a =>
                a.room &&
                room(a.room) !== "UNKNOWN" &&
                room(a.room) !== "UNASSIGNED"
            ).length;

        // Count open violations from the latest state of each asset.
        const openViolations = state.assets.filter(violation).length;

        $("totalAssets").textContent = totalAssets;
        $("activeAssets").textContent = activeAssets;
        $("openViolations").textContent = openViolations;

        $("eventCount").textContent =
            Number.isFinite(Number(data.event_count))
                ? Number(data.event_count)
                : state.events.length;

        $("violationFoot").textContent = openViolations
            ? "Requires attention"
            : "No open violations reported";

        $("sidebarViolationCount").textContent = openViolations;

        const alertEvents = state.events.filter(event =>
            ["NEW", "CLEARED"].includes(
                String(event.violation_state || "").toUpperCase()
            )
        );

        $("alertCountPill").textContent = alertEvents.length + " alerts";

        // Hospital floor plan.
        $("floorplanGrid").innerHTML = zones.map(([id, key, name]) => {
            const list = state.assets.filter(
                asset => room(asset.room) === key
            );

            const hasViolation = list.some(violation);

            const chips = list.length
                ? list.map(asset => {
                    const assetId = asset.asset_id || "Asset";
                    const label = assetId.length > 20
                        ? assetId.slice(0, 18) + "…"
                        : assetId;

                    return `
                        <span class="asset-chip ${violation(asset) ? "violation" : ""}"
                              title="${esc(assetId)}">
                            ${esc(label)}
                        </span>
                    `;
                }).join("")
                : '<span class="zone-empty">No assets reported</span>';

            return `
                <div class="zone-card ${hasViolation ? "has-violation" : ""}">
                    <div class="zone-top">
                        <div>
                            <div class="zone-name">${esc(name.toUpperCase())}</div>
                            <div class="zone-id">${esc(id)} · ${esc(key)}</div>
                        </div>
                        <span class="zone-count">
                            ${String(list.length).padStart(2, "0")}
                        </span>
                    </div>
                    <div class="zone-assets">${chips}</div>
                </div>
            `;
        }).join("");

        // Asset inventory and search.
        const query = $("assetSearch").value.trim().toLowerCase();

        const filtered = state.assets.filter(asset =>
            [
                asset.asset_id,
                asset.asset_type,
                asset.room,
                asset.tag_id,
                asset.status
            ].some(value =>
                String(value || "").toLowerCase().includes(query)
            )
        );

        $("assetRowsLabel").textContent =
            `${filtered.length} of ${state.assets.length} assets`;

        $("assetTableBody").innerHTML = filtered.length
            ? filtered.map(asset => {
                const bad = violation(asset);
                const type = String(asset.asset_type || "").toLowerCase();

                const symbol = type.includes("wheel") ? "◉"
                    : type.includes("vent") ? "⌁"
                    : type.includes("pump") ? "◈"
                    : type.includes("kit") ? "✚"
                    : type.includes("monitor") ? "▣"
                    : "◇";

                const status = bad
                    ? (
                        String(asset.violation_state).toUpperCase() === "ONGOING"
                            ? "ONGOING VIOLATION"
                            : "VIOLATION"
                    )
                    : (asset.status || "UNKNOWN");

                const badgeClass = bad
                    ? "violation"
                    : (
                        String(asset.status || "").toUpperCase() === "AUTHORIZED"
                            ? "authorized"
                            : "unknown"
                    );

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
                        <td>
                            <span class="zone-label">
                                ${esc(asset.room || "UNKNOWN")}
                            </span>
                        </td>
                        <td>${esc(time(asset.timestamp))}</td>
                        <td>
                            <span class="status-badge ${badgeClass}">
                                ${esc(status)}
                            </span>
                        </td>
                    </tr>
                `;
            }).join("")
            : `
                <tr>
                    <td colspan="5" class="table-empty">
                        ${state.assets.length
                            ? "No assets match your search."
                            : "No asset data received from Node-RED yet."}
                    </td>
                </tr>
            `;

        // Recent violation alerts.
        const alerts = state.events
            .filter(event =>
                ["NEW", "CLEARED"].includes(
                    String(event.violation_state || "").toUpperCase()
                )
            )
            .slice(0, 7);

        $("alertList").innerHTML = alerts.length
            ? alerts.map(event => {
                const cleared =
                    String(event.violation_state).toUpperCase() === "CLEARED";

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
                        <div class="alert-time">${esc(time(event.timestamp))}</div>
                    </div>
                `;
            }).join("")
            : '<div class="empty-state">No recent violation alerts returned by backend.</div>';

        // Activity history.
        const recentEvents = state.events.slice(0, 8);

        $("activityList").innerHTML = recentEvents.length
            ? recentEvents.map(event => {
                const status = String(
                    event.violation_state || ""
                ).toUpperCase();

                const bad =
                    status === "NEW" ||
                    status === "ONGOING" ||
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
                            ${esc(time(event.timestamp))}
                        </div>
                    </div>
                `;
            }).join("")
            : '<div class="empty-state">Activity will appear when events are received.</div>';

        $("lastUpdated").textContent =
            "Last update: " + new Date().toLocaleTimeString();
    }

    function toasts(events) {
        for (const event of events) {
            const status = String(
                event.violation_state || ""
            ).toUpperCase();

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

            const element = document.createElement("div");

            element.className =
                "toast" + (status === "CLEARED" ? " cleared" : "");

            element.innerHTML = `
                <strong>
                    ${status === "NEW"
                        ? "Zone violation detected"
                        : "Violation cleared"}
                </strong>
                ${esc(event.asset_id || "Asset")}
                · ${esc(event.room || "unknown zone")}
            `;

            $("toastRegion").appendChild(element);

            setTimeout(() => element.remove(), 6500);
        }
    }

    async function refresh() {
        if (state.paused) return;

        try {
            const response = await fetch(API_URL, {
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            });

            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const data = await response.json();

            if (!data || typeof data !== "object") {
                throw new Error("Invalid JSON response");
            }

            if (!Array.isArray(data.assets) ||
                !Array.isArray(data.events)) {
                throw new Error("API response is missing assets or events");
            }

            connection(true);
            toasts(data.events);
            render(data);

        } catch (error) {
            connection(false, error.message);
            console.error("SmartCare API connection failed:", error);
        }
    }

    // Search without losing the current dashboard data.
    $("assetSearch").addEventListener("input", () => {
        render({
            assets: state.assets,
            events: state.events,
            total_assets: state.assets.length,
            active_assets: state.assets.filter(asset =>
                asset.room &&
                room(asset.room) !== "UNKNOWN" &&
                room(asset.room) !== "UNASSIGNED"
            ).length,
            event_count: state.events.length
        });
    });

    $("refreshBtn").addEventListener("click", refresh);

    $("pauseBtn").addEventListener("click", () => {
        state.paused = !state.paused;

        $("pauseBtn").textContent = state.paused
            ? "▶ Resume updates"
            : "Ⅱ Pause updates";

        if (!state.paused) {
            refresh();
        } else {
            $("apiStatus").textContent = "API: updates paused";
        }
    });

    $("viewAllAlerts").addEventListener("click", () => {
        $("history").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    function clock() {
        $("clock").textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }

    clock();
    setInterval(clock, 1000);

    refresh();
    setInterval(refresh, POLL_MS);
})();