import type { ReactNode } from 'react';
import type { Zone } from '../types';
import type { Panel, TimeRange } from '../lib/store';
import { istClock } from '../lib/format';
import type { BaseLayer, LayerKey, LayerVisibility } from './TacticalMap';
import { Icon } from './Icon';
import { Popover } from './Popover';

interface Props {
  zone: Zone | null;
  now: number;
  activeAlerts: number;
  hasHigh: boolean;
  nodesOnline: number;
  nodesTotal: number;
  timeRange: TimeRange;
  onTimeRange: (r: TimeRange) => void;
  layers: LayerVisibility;
  onLayers: (l: LayerVisibility) => void;
  baseLayer: BaseLayer;
  onBaseLayer: (b: BaseLayer) => void;
  onRecenter: () => void;
  onPanel: (p: Panel) => void;
  onAudit: () => void;
  onResync: () => void;
  demo: ReactNode;
}

const RANGES: { key: TimeRange; label: string }[] = [
  { key: '1h', label: 'Last hour' },
  { key: 'today', label: 'Today' },
  { key: 'all', label: 'All time' },
];

const LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: 'wedges', label: 'Radar coverage', swatch: 'sw-radar' },
  { key: 'zones', label: 'Zones (forest, riverbed, market)', swatch: 'sw-zone' },
  { key: 'border', label: 'International border', swatch: 'sw-border' },
  { key: 'bop', label: 'BOP outposts', swatch: 'sw-bop' },
  { key: 'radar', label: 'Live radar returns', swatch: 'sw-blip' },
  { key: 'das', label: 'Fiber DAS (deployment only)', swatch: 'sw-das' },
];

export function NavBar(p: Props) {
  const range = RANGES.find((r) => r.key === p.timeRange)!;

  return (
    <header className="nav">
      <div className="nav-brand">
        <span className="nav-logo" aria-hidden="true"><span /></span>
        <span className="nav-title">TRINETRA</span>
        <span className="nav-sector">{p.zone?.name ?? '—'}</span>
      </div>

      <div className="nav-meta">
        <span className="nav-clock">{istClock(new Date(p.now))} IST</span>
        <span className="nav-sim" title="All sensor inputs in this demo are simulated">SIM</span>
      </div>

      <nav className="nav-actions">
        <Popover
          trigger={(open, toggle) => (
            <button className={`nav-btn ${open ? 'on' : ''}`} onClick={toggle} title="Map layers" aria-label="Map layers">
              <Icon name="layers" /><Icon name="chevron" size={12} className="nav-caret" />
            </button>
          )}
        >
          {() => (
            <div className="menu layers-menu">
              <div className="menu-label">Base map</div>
              <div className="seg">
                {(['map', 'satellite'] as BaseLayer[]).map((b) => (
                  <button key={b} className={p.baseLayer === b ? 'on' : ''} onClick={() => p.onBaseLayer(b)}>
                    {b === 'map' ? 'Dark' : 'Satellite'}
                  </button>
                ))}
              </div>
              <div className="menu-label">Overlays</div>
              {LAYERS.map((l) => (
                <label key={l.key} className="menu-check">
                  <input
                    type="checkbox"
                    checked={p.layers[l.key]}
                    onChange={(e) => p.onLayers({ ...p.layers, [l.key]: e.target.checked })}
                  />
                  <span className={`swatch ${l.swatch}`} />
                  <span>{l.label}</span>
                </label>
              ))}
              <div className="menu-foot">Keys: M dark · S satellite</div>
            </div>
          )}
        </Popover>

        <Popover
          trigger={(open, toggle) => (
            <button className={`nav-btn wide ${open ? 'on' : ''}`} onClick={toggle} title="Which alerts to show">
              <Icon name="clock" /><span className="mi-label">{range.label}</span><Icon name="chevron" size={12} className="nav-caret" />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`menu-item ${p.timeRange === r.key ? 'on' : ''}`}
                  onClick={() => { p.onTimeRange(r.key); close(); }}
                >
                  <span className="mi-label">{r.label}</span>
                  {p.timeRange === r.key && <span className="menu-tick">✓</span>}
                </button>
              ))}
            </div>
          )}
        </Popover>

        <button className="nav-btn" onClick={p.onRecenter} title="Re-centre on the inspection zone" aria-label="Re-centre map">
          <Icon name="crosshair" />
        </button>

        <button
          className={`nav-btn ${p.hasHigh ? 'alarm' : ''}`}
          onClick={() => p.onPanel({ kind: 'alerts' })}
          title="Alert queue"
          aria-label={`Alert queue, ${p.activeAlerts} active`}
        >
          <Icon name="bell" />
          {p.activeAlerts > 0 && <span className="nav-count">{p.activeAlerts}</span>}
        </button>

        {p.demo}

        <button className="nav-btn" onClick={p.onResync} title="Reconnect and resync with the server" aria-label="Resync">
          <Icon name="refresh" />
        </button>

        <Popover
          trigger={(open, toggle) => (
            <button className={`nav-btn ${open ? 'on' : ''}`} onClick={toggle} title="Menu" aria-label="Menu">
              <Icon name="menu" />
            </button>
          )}
        >
          {(close) => {
            const go = (fn: () => void) => () => { fn(); close(); };
            return (
              <div className="menu main-menu">
                <button className="menu-item" onClick={go(() => p.onPanel({ kind: 'briefing' }))}>
                  <Icon name="file" /><span className="mi-label">Shift briefing</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={go(() => p.onPanel({ kind: 'alerts' }))}>
                  <Icon name="bell" /><span className="mi-label">Alert queue</span>
                  {p.activeAlerts > 0 && <span className="badge badge-red">{p.activeAlerts}</span>}
                </button>
                <button className="menu-item" onClick={go(() => p.onPanel({ kind: 'sensors' }))}>
                  <Icon name="radio" /><span className="mi-label">Sensor health</span>
                  <span className={`badge ${p.nodesOnline < p.nodesTotal ? 'badge-amber' : 'badge-green'}`}>
                    {p.nodesOnline}/{p.nodesTotal}
                  </span>
                </button>
                <button className="menu-item" onClick={go(() => p.onPanel({ kind: 'log' }))}>
                  <Icon name="list" /><span className="mi-label">Activity log</span>
                  <span className="badge-live"><i /> LIVE</span>
                </button>
                <button className="menu-item" onClick={go(p.onAudit)}>
                  <Icon name="shield" /><span className="mi-label">Audit trail</span>
                </button>
                <div className="menu-sep" />
                <div className="menu-item static">
                  <Icon name="user" /><span className="mi-label">Op. R. Sharma</span><span className="menu-dim">Shift B</span>
                </div>
              </div>
            );
          }}
        </Popover>
      </nav>
    </header>
  );
}
