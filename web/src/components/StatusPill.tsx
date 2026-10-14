import type { LinkState, Panel } from '../lib/store';
import { Icon } from './Icon';

interface Props {
  link: LinkState;
  lastSync: number;
  now: number;
  nodesOnline: number;
  nodesTotal: number;
  activeAlerts: number;
  onPanel: (p: Panel) => void;
}

/** Bottom-left status: link, nodes online, open alerts. Each part opens the matching list. */
export function StatusPill({ link, lastSync, now, nodesOnline, nodesTotal, activeAlerts, onPanel }: Props) {
  const ago = lastSync ? Math.max(0, Math.round((now - lastSync) / 1000)) : 0;
  const text = link === 'online' ? 'Live' : link === 'connecting' ? 'Connecting…' : 'Offline';
  return (
    <div className="status-pill">
      <button
        className={`sp-part sp-link ${link}`}
        onClick={() => onPanel({ kind: 'log' })}
        title={link === 'online' ? `Synced ${ago} s ago · open activity log` : 'Reconnecting to the server'}
      >
        <i /> {text}
      </button>
      <span className="sp-sep" />
      <button className={`sp-part ${nodesOnline < nodesTotal ? 'warn' : ''}`} onClick={() => onPanel({ kind: 'sensors' })} title="Nodes online">
        <Icon name="radio" size={14} /> {nodesOnline}/{nodesTotal}
      </button>
      <button className={`sp-part ${activeAlerts ? 'hot' : ''}`} onClick={() => onPanel({ kind: 'alerts' })} title="Active alerts">
        <Icon name="alert" size={14} /> {activeAlerts}
      </button>
    </div>
  );
}
