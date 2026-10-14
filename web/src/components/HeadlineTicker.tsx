import type { Alert, IncidentUpdate, NodeStatus, Zone } from '../types';
import { isActive, relativeTime, targetLabel } from '../lib/format';

interface Headline {
  key: string;
  tone: 'red' | 'amber' | 'green' | 'grey' | 'blue';
  chip: string;
  place: string;
  text: string;
  age?: string;
  fresh?: boolean;
  onClick: () => void;
}

interface Props {
  zone: Zone | null;
  alerts: Alert[];
  nodes: Record<string, NodeStatus>;
  latestIncident: IncidentUpdate | null;
  freshAlertId: string | null;
  now: number;
  onAlert: (id: string) => void;
  onNode: (id: string) => void;
}

const BAND_RANK = { high: 0, review: 1, log: 2 } as const;
const CLOSED_TEXT: Record<string, string> = { confirmed: 'confirmed as threat', dismissed: 'dismissed as normal' };

/** Priority headlines: open alerts first, then sensor problems, then what the zone check let through. */
export function HeadlineTicker({ zone, alerts, nodes, latestIncident, freshAlertId, now, onAlert, onNode }: Props) {
  const place = (nodeId: string) => zone?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  const items: Headline[] = [];

  alerts
    .filter((a) => isActive(a.status))
    .sort((a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || b.score - a.score)
    .forEach((a) => items.push({
      key: a.alert_id,
      tone: a.band === 'high' ? 'red' : a.band === 'review' ? 'amber' : 'grey',
      chip: a.band === 'high' ? 'HIGH' : a.band === 'review' ? 'REVIEW' : 'LOG',
      place: place(a.primary_node),
      text: `${targetLabel(a.detected_class, a.detected_count)}, unusual for this zone · score ${a.score} · ${a.bop_id} alerted${a.status === 'tracked' ? ' · tracking' : a.status === 'escalated' ? ' · escalated' : ''}`,
      age: relativeTime(a.created_at, now),
      fresh: a.alert_id === freshAlertId,
      onClick: () => onAlert(a.alert_id),
    }));

  Object.entries(nodes)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([id, n]) => {
      if (n.status === 'offline') {
        items.push({ key: `off-${id}`, tone: 'amber', chip: 'OFFLINE', place: place(id), text: 'node not reporting · blind spot in coverage', onClick: () => onNode(id) });
      } else if (n.battery < 30) {
        items.push({ key: `bat-${id}`, tone: 'amber', chip: 'BATTERY', place: place(id), text: `battery at ${n.battery}% · schedule a swap`, onClick: () => onNode(id) });
      }
    });

  if (latestIncident && !latestIncident.unusual) {
    items.push({
      key: `inc-${latestIncident.incident_id}`,
      tone: 'green',
      chip: 'NORMAL',
      place: place(latestIncident.node_id),
      text: `activity matched the zone's routine · score ${latestIncident.score} · logged, no alert`,
      onClick: () => onNode(latestIncident.node_id),
    });
  }

  alerts
    .filter((a) => CLOSED_TEXT[a.status])
    .slice(0, 3)
    .forEach((a) => items.push({
      key: `closed-${a.alert_id}`,
      tone: 'blue',
      chip: 'CLOSED',
      place: place(a.primary_node),
      text: `${a.alert_id} ${CLOSED_TEXT[a.status]} by operator`,
      age: relativeTime(a.actions[a.actions.length - 1]?.ts ?? a.created_at, now),
      onClick: () => onAlert(a.alert_id),
    }));

  const fresh = items.some((i) => i.fresh);
  const online = Object.values(nodes).filter((n) => n.status !== 'offline').length;

  const row = (copy: number) => items.map((h) => (
    <button
      key={`${copy}-${h.key}`}
      className={`tick-item ${h.fresh ? 'fresh' : ''}`}
      onClick={h.onClick}
      tabIndex={copy ? -1 : 0}
      aria-hidden={copy ? true : undefined}
    >
      <span className={`tick-chip ${h.tone}`}>{h.chip}</span>
      <b>{h.place}:</b>
      <span className="tick-text">{h.text}</span>
      {h.age && <span className="tick-age">{h.age}</span>}
    </button>
  ));

  return (
    <div className={`ticker ${fresh ? 'flash' : ''}`} role="region" aria-label="Priority headlines">
      <div className="tick-live"><i /> LIVE</div>
      <div className="tick-viewport">
        {items.length === 0 ? (
          <div className="tick-quiet">All quiet · {online} of {Object.keys(nodes).length} nodes online · normal activity is logged, not alerted</div>
        ) : (
          <div className="tick-track" style={{ animationDuration: `${Math.max(30, items.length * 12)}s` }}>
            <div className="tick-row">{row(0)}</div>
            <div className="tick-row">{row(1)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
