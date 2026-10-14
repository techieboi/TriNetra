import type { Alert, Metrics } from '../types';
import type { Filter } from '../lib/store';
import { isActive, relativeTime } from '../lib/format';

interface Props {
  alerts: Alert[];
  metrics: Metrics | null;
  filter: Filter;
  selectedId: string | null;
  now: number;
  onFilter: (f: Filter) => void;
  onSelect: (id: string) => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High 70+' },
  { key: 'review', label: 'Review 40–69' },
  { key: 'log', label: 'Log <40' },
];

const STATUS_COLOR: Record<string, string> = {
  open: '#fbbf24', tracked: '#38bdf8', escalated: '#f87171', confirmed: '#4ade80', dismissed: '#94a3b8',
};

export function AlertQueue({ alerts, metrics, filter, selectedId, now, onFilter, onSelect }: Props) {
  const shown = alerts.filter((a) => filter === 'all' || a.band === filter);
  const active = alerts.filter((a) => isActive(a.status)).length;
  const fa = metrics?.false_alarm_rate;

  return (
    <div className="c2-panel panel-alert-queue">
      <div className="queue-metrics">
        <div title="Alerts still waiting on an operator decision">
          <span className="meta-label">Active</span>
          <span className="meta-val">{active}</span>
        </div>
        <div title="Seconds from radar trigger to alert on this dashboard (median of live alerts)">
          <span className="meta-label">Alert time</span>
          <span className="meta-val">{metrics?.alert_time_s_median != null ? `${metrics.alert_time_s_median.toFixed(1)} s` : '—'}</span>
        </div>
        <div title="Share of decided alerts the operator dismissed as normal activity">
          <span className="meta-label">False alarms</span>
          <span className="meta-val">{fa != null && metrics ? `${Math.round(fa * 100)}% (${metrics.dismissed}/${metrics.decided})` : '—'}</span>
        </div>
        <div title="Activity the zone check logged as normal, without alerting">
          <span className="meta-label">Logged normal</span>
          <span className="meta-val">{metrics?.incidents_logged_normal ?? 0}</span>
        </div>
      </div>
      <div className="queue-filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => onFilter(f.key)}>
            {f.key === 'all' ? `All ${alerts.length}` : f.label}
          </button>
        ))}
      </div>
      <div className="queue-list">
        {shown.length === 0 && (
          <div className="queue-empty">No alerts in this band. Normal activity is logged, not queued.</div>
        )}
        {shown.map((a) => (
          <div
            key={a.alert_id}
            className={`queue-card ${a.alert_id === selectedId ? 'selected' : ''}`}
            onClick={() => onSelect(a.alert_id)}
          >
            <div className="queue-card-row1">
              <span className="queue-card-id">{a.alert_id}</span>
              <span className={`badge-tag ${a.band}`}>{a.band.toUpperCase()} · {a.score}</span>
            </div>
            <div className="queue-card-row2">
              <span>{a.detected_class ?? 'Unconfirmed'}</span>
              <span>{a.primary_node}{a.camera ? ` · ${a.camera}` : ''}</span>
            </div>
            <div className="queue-card-row3">
              <span>{relativeTime(a.created_at, now)}</span>
              <span>ETA {Math.round(a.eta_minutes)} min</span>
            </div>
            <div className="queue-card-status-row">
              <span className="amber-dot" style={{ background: STATUS_COLOR[a.status] }} /> Status:{' '}
              <span style={{ color: STATUS_COLOR[a.status], fontWeight: 600 }}>{a.status.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
