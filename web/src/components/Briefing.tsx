import type { Alert, Metrics, NodeStatus, Zone } from '../types';
import { isActive } from '../lib/format';

interface Props {
  zone: Zone | null;
  metrics: Metrics | null;
  alerts: Alert[];
  nodes: Record<string, NodeStatus>;
}

/** One-screen summary of the shift so far. */
export function Briefing({ zone, metrics, alerts, nodes }: Props) {
  const open = alerts.filter((a) => isActive(a.status));
  const high = open.filter((a) => a.band === 'high').length;
  const ids = Object.keys(nodes).sort();
  const down = ids.filter((id) => nodes[id].status === 'offline');
  const fa = metrics?.false_alarm_rate;

  return (
    <div className="detail">
      <p className="lede">
        {zone?.description ?? 'Sector'}. {open.length ? `${open.length} alert${open.length > 1 ? 's' : ''} open${high ? `, ${high} high` : ''}.` : 'No open alerts.'}{' '}
        {down.length ? `${down.join(', ')} offline.` : 'All nodes reporting.'}
      </p>
      <div className="stat-grid">
        <div className="stat"><span className="stat-label">Alerts raised</span><span className="stat-val big">{metrics?.alerts_raised ?? 0}</span></div>
        <div className="stat"><span className="stat-label">Logged as normal</span><span className="stat-val big">{metrics?.incidents_logged_normal ?? 0}</span></div>
        <div className="stat"><span className="stat-label">Decided</span><span className="stat-val big">{metrics?.decided ?? 0}</span></div>
        <div className="stat" title="Seconds from radar trigger to alert on this dashboard (median)">
          <span className="stat-label">Alert time (median)</span>
          <span className="stat-val big">{metrics?.alert_time_s_median != null ? `${metrics.alert_time_s_median.toFixed(1)} s` : '—'}</span>
        </div>
        <div className="stat" title="Share of decided alerts the operator dismissed as normal activity">
          <span className="stat-label">False alarms</span>
          <span className="stat-val big">{fa != null && metrics ? `${Math.round(fa * 100)}%` : '—'}</span>
          {fa != null && metrics && <span className="stat-sub">{metrics.dismissed} of {metrics.decided} dismissed</span>}
        </div>
        <div className="stat"><span className="stat-label">Nodes online</span><span className="stat-val big">{ids.length - down.length}/{ids.length}</span></div>
      </div>
      <p className="fine">Only activity that is unusual for this zone and hour reaches the alert queue. Everything else is logged and kept for the audit trail.</p>
    </div>
  );
}
