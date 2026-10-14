import type { Alert, NodeStatus, Zone } from '../types';
import type { Popup } from '../lib/store';
import type { OperatorActionName } from '../lib/api';
import { isActive, relativeTime, secondsAgo, targetLabel } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  popup: Popup;
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  alerts: Alert[];
  now: number;
  serverNow: number;
  onDetails: () => void;
  onOpenAlert: (id: string) => void;
  onAction: (alertId: string, action: OperatorActionName) => void;
  onDismiss: (alertId: string) => void;
  onClose: () => void;
}

const BAND_TEXT = { high: 'HIGH', review: 'REVIEW', log: 'LOG' } as const;
const CAM_TEXT: Record<string, string> = { standby: 'Camera standby', waking: 'Camera waking', recording: 'Recording', offline: 'Camera offline' };

/** The small card a map click opens. Just enough to decide whether to look closer. */
export function MapPopupCard(p: Props) {
  const close = (
    <button className="card-x" onClick={p.onClose} aria-label="Close"><Icon name="x" size={14} /></button>
  );

  if (p.popup.kind === 'node') {
    const node = p.zone?.nodes.find((n) => n.id === p.popup.id);
    const st = p.nodes[p.popup.id];
    if (!node) return null;
    const status = st?.status ?? 'online';
    const active = p.alerts.find((a) => a.primary_node === node.id && isActive(a.status));
    return (
      <div className="map-card">
        <div className="card-top">
          <span className={`card-kind ${status}`}><i /> {status.toUpperCase()}</span>
          <span className="card-src">{node.source_type === 'sim' ? 'simulated' : node.source_type}</span>
          {close}
        </div>
        <div className="card-title">{node.name}</div>
        <div className="chips">
          <span className={`chip ${st?.camera_state === 'recording' ? 'chip-red' : st?.camera_state === 'waking' ? 'chip-amber' : ''}`}>
            {CAM_TEXT[status === 'offline' ? 'offline' : st?.camera_state ?? 'standby']}
          </span>
          {st && <span className={`chip ${st.battery < 30 ? 'chip-amber' : ''}`}>Battery {st.battery}%</span>}
          {st && <span className="chip">{st.signal_dbm} dBm</span>}
          {node.radar && <span className="chip">Radar {node.radar.range_m} m</span>}
        </div>
        {active ? (
          <button className="card-alert" onClick={() => p.onOpenAlert(active.alert_id)}>
            <span className={`band-chip ${active.band}`}>{BAND_TEXT[active.band]} {active.score}</span>
            <span>{targetLabel(active.detected_class, active.detected_count)}</span>
            <span className="card-alert-age">{relativeTime(active.created_at, p.now)}</span>
          </button>
        ) : (
          <div className="card-desc">No open alert at this node.</div>
        )}
        <div className="card-meta">
          {st ? (status === 'offline' ? 'Not reporting' : `Last heartbeat ${secondsAgo(st.last_seen, p.serverNow)} ago`) : '—'}
          {node.camera ? ` · ${node.camera}` : ''}
        </div>
        <div className="card-btns">
          <button className="btn btn-primary" onClick={p.onDetails}>Details <Icon name="right" size={13} /></button>
          {active && <button className="btn" onClick={() => p.onOpenAlert(active.alert_id)}>Open alert</button>}
        </div>
        <div className="card-coords">{node.lat.toFixed(4)}°, {node.lon.toFixed(4)}°</div>
      </div>
    );
  }

  const a = p.alerts.find((x) => x.alert_id === p.popup.id);
  if (!a) return null;
  const decided = a.status === 'confirmed' || a.status === 'dismissed' || a.status === 'escalated';
  const reasons = [...a.reasons].sort((x, y) => y.weight - x.weight).slice(0, 2);
  return (
    <div className={`map-card band-${a.band}`}>
      <div className="card-top">
        <span className={`card-kind ${a.band}`}><i /> {BAND_TEXT[a.band]} ALERT</span>
        <span className="card-src">{a.alert_id}</span>
        {close}
      </div>
      <div className="card-title">{targetLabel(a.detected_class, a.detected_count)} near {a.primary_node}</div>
      <div className="chips">
        <span className={`chip chip-${a.band === 'high' ? 'red' : a.band === 'review' ? 'amber' : 'grey'}`}>Score {a.score}/100</span>
        <span className="chip">{a.status[0].toUpperCase() + a.status.slice(1)}</span>
        <span className="chip">{a.bop_id} · ETA {Math.round(a.eta_minutes)} min</span>
      </div>
      {reasons.length > 0 && (
        <ul className="card-reasons">
          {reasons.map((r) => <li key={r.factor}><span>{r.factor}</span><b>+{r.weight}</b></li>)}
        </ul>
      )}
      <div className="card-meta">{relativeTime(a.created_at, p.now)}{a.camera ? ` · ${a.camera}` : ''}</div>
      <div className="card-btns">
        <button className="btn btn-primary" onClick={p.onDetails}>Details <Icon name="right" size={13} /></button>
        {!decided && <button className="btn btn-ok" onClick={() => p.onAction(a.alert_id, 'confirm')}>Confirm</button>}
        {!decided && <button className="btn" onClick={() => p.onDismiss(a.alert_id)}>Dismiss</button>}
      </div>
      <div className="card-coords">{a.lat.toFixed(4)}°, {a.lon.toFixed(4)}°</div>
    </div>
  );
}
