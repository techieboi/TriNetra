import type { Alert, LogRow, NodeStatus, ZoneNode } from '../types';
import { isActive, relativeTime, secondsAgo, targetLabel } from '../lib/format';

interface Props {
  node: ZoneNode;
  status: NodeStatus | undefined;
  alerts: Alert[];
  logs: LogRow[];
  now: number;
  serverNow: number;
  onOpenAlert: (id: string) => void;
}

const SENSOR_TEXT: Record<string, string> = { mmwave_radar: 'mmWave radar', thermal_camera: 'Thermal camera' };
const CAM_TEXT: Record<string, string> = { standby: 'Standby', waking: 'Waking', recording: 'Recording', offline: 'Offline' };

export function NodeDetail({ node, status, alerts, logs, now, serverNow, onOpenAlert }: Props) {
  const mine = alerts.filter((a) => a.primary_node === node.id);
  const active = mine.filter((a) => isActive(a.status));
  const recentLogs = logs.filter((l) => l.source === node.id || l.source === node.camera).slice(-8).reverse();
  const offline = status?.status === 'offline';

  return (
    <div className="detail">
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Status</span>
          <span className={`stat-val st-${status?.status ?? 'online'}`}>{(status?.status ?? '—').toUpperCase()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Battery</span>
          <span className={`stat-val ${status && status.battery < 30 ? 'warn' : ''}`}>{status ? `${status.battery}%` : '—'}</span>
          {status && <span className="meter"><i style={{ width: `${status.battery}%` }} className={status.battery < 30 ? 'warn' : ''} /></span>}
        </div>
        <div className="stat">
          <span className="stat-label">Signal</span>
          <span className="stat-val">{status ? `${status.signal_dbm} dBm` : '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Camera</span>
          <span className="stat-val">{CAM_TEXT[offline ? 'offline' : status?.camera_state ?? 'standby']}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Last heartbeat</span>
          <span className="stat-val">{status ? (offline ? 'Not reporting' : `${secondsAgo(status.last_seen, serverNow)} ago`) : '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Source</span>
          <span className="stat-val">{status?.source ?? node.source_type}</span>
        </div>
      </div>

      <section className="section">
        <h3>Sensors</h3>
        <div className="chips">
          {node.sensors.map((s) => <span className="chip" key={s}>{SENSOR_TEXT[s] ?? s}</span>)}
          {node.camera && <span className="chip">{node.camera}</span>}
        </div>
        {node.radar && (
          <dl className="kv">
            <dt>Radar</dt><dd>{node.radar.model}</dd>
            <dt>Facing</dt><dd>{node.radar.facing_deg}° · {node.radar.fov_deg}° field of view</dd>
            <dt>Range</dt><dd>{node.radar.range_m} m deployment · ~{node.radar.demo_range_m} m demo module</dd>
            <dt>Position</dt><dd>{node.lat.toFixed(4)}° N, {node.lon.toFixed(4)}° E</dd>
          </dl>
        )}
      </section>

      <section className="section">
        <h3>Alerts at this node <span className="h-count">{active.length} open</span></h3>
        {mine.length === 0 && <div className="empty-line">Nothing unusual from this node in the selected time range.</div>}
        <div className="row-list">
          {mine.slice(0, 6).map((a) => (
            <button key={a.alert_id} className="row-card" onClick={() => onOpenAlert(a.alert_id)}>
              <span className={`band-chip ${a.band}`}>{a.band.toUpperCase()} {a.score}</span>
              <span className="row-main">{targetLabel(a.detected_class, a.detected_count)}</span>
              <span className={`row-status s-${a.status}`}>{a.status}</span>
              <span className="row-age">{relativeTime(a.created_at, now)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Recent readings</h3>
        {recentLogs.length === 0 && <div className="empty-line">No readings logged yet.</div>}
        <div className="mini-log">
          {recentLogs.map((l, i) => (
            <div key={`${l.time}-${i}`} className={`mini-log-row ${l.type}`}>
              <span className="ml-time">{l.time}</span>
              <span className="ml-src">{l.source}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
