import type { Metrics, Zone } from '../types';
import type { LinkState } from '../lib/store';
import { istClock } from '../lib/format';

interface Props {
  zone: Zone | null;
  link: LinkState;
  lastSync: number;
  metrics: Metrics | null;
  now: number;
  onAudit: () => void;
}

export function Header({ zone, link, lastSync, metrics, now, onAudit }: Props) {
  const ago = lastSync ? Math.max(0, Math.round((now - lastSync) / 1000)) : 0;
  const linkText =
    link === 'online' ? `Online · synced ${ago} s ago` : link === 'connecting' ? 'Connecting…' : 'Offline · reconnecting';
  const linkClass = link === 'online' ? '' : link === 'connecting' ? 'reconnecting' : 'offline';
  const fa = metrics?.false_alarm_rate;

  return (
    <header className="c2-header">
      <div className="header-left">
        <div className="logo-group">
          <span className="logo-title">TRINETRA</span>
          <span className="logo-subtitle">Border Watch · v2.0</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Sector</span>
          <span className="meta-val">{zone?.name ?? '—'}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Local time</span>
          <span className="meta-val">{istClock(new Date(now))} IST</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Link</span>
          <span className={`meta-val link-status ${linkClass}`}>
            <span className="link-dot" /> {linkText}
          </span>
        </div>
        <div className="meta-item" title="Seconds from radar trigger to alert on this dashboard (median of live alerts)">
          <span className="meta-label">Alert time</span>
          <span className="meta-val">
            {metrics?.alert_time_s_median != null ? `${metrics.alert_time_s_median.toFixed(1)} s` : '—'}
          </span>
        </div>
        <div className="meta-item" title="Share of decided alerts the operator dismissed as normal activity">
          <span className="meta-label">False alarms</span>
          <span className="meta-val">
            {fa != null && metrics ? `${Math.round(fa * 100)}% (${metrics.dismissed}/${metrics.decided})` : '—'}
          </span>
        </div>
        <div className="meta-item" title="Activity the zone check logged as normal, without alerting">
          <span className="meta-label">Logged normal</span>
          <span className="meta-val">{metrics?.incidents_logged_normal ?? 0}</span>
        </div>
      </div>
      <div className="header-right">
        <span className="sim-badge" title="All sensor inputs in this demo are simulated">SIMULATED INPUTS</span>
        <button className="c2-btn-ghost" onClick={onAudit}>Audit trail</button>
        <div className="operator-badge">
          <span className="op-avatar">OP</span>
          <span className="op-name">Op. R. Sharma · Shift B</span>
        </div>
      </div>
    </header>
  );
}
