import { Cpu } from "lucide-react";

import { calendarDate, clockTime, fullTimestamp } from "@/lib/format";
import type { DeviceInfo } from "@/lib/types";

/** Conservative display freshness, separate from the server's queue hold rules. */
const READING_FRESH_MS = 30000;

export function DeviceStatus({ device, serverNow, stale }: {
  device: DeviceInfo | null;
  serverNow: number;
  stale: boolean;
}) {
  const reportAge = device?.reported_at ? Math.max(0, serverNow - Date.parse(device.reported_at)) : Infinity;
  const current = Boolean(device?.online && !stale && reportAge <= READING_FRESH_MS);
  const online = device?.online && !stale;
  const state = stale ? "Unconfirmed" : !device ? "Not connected" : device.online ? "Online" : "Offline";
  // The panel says what the board measured, not who it thinks the person is.
  // The PIR cannot tell a visitor from anyone else who happens to walk past,
  // and nothing here is allowed to claim otherwise.
  const message = !device ? "No board is assigned to this desk."
    : !current ? "Current occupancy is unknown. Sensor readings are not fresh."
      : device.occupied ? "Counter occupied" : device.approach ? "Movement detected" : "Counter free";

  return (
    <section className="staff-device">
      <div className="staff-panel-title">
        <span className="staff-device-icon"><Cpu size={20} aria-hidden="true" /></span>
        <span className="staff-device-description"><strong>Desk board <span className={`staff-device-state ${online ? "staff-device-state--online" : ""}`}>{state}</span></strong><small>{message}</small></span>
      </div>
      <div className="staff-device-content">
        {device ? <>
          <p className="staff-device-note">{current ? "Latest sensor report" : "Historical report only; these values do not describe the counter now"}
            {device.reported_at ? <>: <time dateTime={device.reported_at} title={fullTimestamp(device.reported_at)}>{calendarDate(device.reported_at)} at {clockTime(device.reported_at)}</time>.</> : ". No sensor report has arrived yet."}</p>
          <dl className="staff-device-readings">
            <Reading label={current ? "Occupancy" : "Last reported occupancy"} value={device.reported_at ? device.occupied ? "Occupied" : "Free" : "Not available"} />
            <Reading label={current ? "Distance" : "Last reported distance"} value={device.distance_cm !== null ? `${device.distance_cm} cm` : "Not available"} />
            <Reading label="Approach" value={current ? device.approach ? "Movement detected" : "None detected" : "Unknown"} />
            <Reading label="Last reported LED" value={device.led_state ?? "Not available"} />
            <Reading label="Last connection" value={device.last_seen ? fullTimestamp(device.last_seen) : "Never"} />
            <Reading label="Board" value={device.label} />
          </dl>
          <div className="staff-device-identity"><span>Chip <code className="font-mono">{device.chip_id ? device.chip_id.toUpperCase() : "Not reported"}</code></span><span>MAC <code className="font-mono">{device.mac_address && device.mac_address !== "00:00:00:00:00:00" ? device.mac_address.toUpperCase() : "Not reported"}</code></span></div>
        </> : (
          <div className="staff-device-empty">
            <div className="staff-device-empty-icon" aria-hidden="true">
              <Cpu size={22} />
            </div>
            <strong>No board attached</strong>
            <p>Queue controls work without a board. An administrator can configure the device separately.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
