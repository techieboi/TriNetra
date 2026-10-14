import { useEffect, useState } from 'react';
import type { ScenarioInfo } from '../types';
import { api, type DriveClock, type DriveKind } from '../lib/api';
import type { DriveSettings } from './TacticalMap';
import { Icon } from './Icon';
import { Popover } from './Popover';

const SCENARIOS: { key: string; label: string; tone: string }[] = [
  { key: 'intrusion', label: 'Night intrusion', tone: 'red' },
  { key: 'routine', label: 'Market crossing', tone: 'green' },
  { key: 'animal', label: 'Stray animal', tone: 'green' },
  { key: 'radar_only', label: 'Radar only', tone: 'amber' },
  { key: 'offline', label: 'Node offline', tone: 'amber' },
];

interface Props {
  drive: DriveSettings;
  onDrive: (d: DriveSettings) => void;
  onNotice: (msg: string) => void;
}

/** Simulation controls, tucked behind one navbar button instead of an always-open footer. */
export function DemoMenu({ drive, onDrive, onNotice }: Props) {
  const [speed, setSpeed] = useState(2);
  const [info, setInfo] = useState<Record<string, ScenarioInfo>>({});

  useEffect(() => {
    api.scenarios().then(setInfo).catch(() => {});
  }, []);

  const run = async (key: string) => {
    try {
      await api.runScenario(key, speed);
      onNotice(`${info[key]?.name ?? key} · expected: ${info[key]?.expected ?? '—'}`);
    } catch (e) {
      onNotice(`Could not start scenario: ${(e as Error).message}`);
    }
  };

  return (
    <Popover
      trigger={(open, toggle) => (
        <button
          className={`nav-btn wide demo-trigger ${open ? 'on' : ''} ${drive.enabled ? 'driving' : ''}`}
          onClick={toggle}
          title="Simulation controls"
        >
          <Icon name="play" size={13} /><span>{drive.enabled ? 'Driving' : 'Demo'}</span>
          <Icon name="chevron" size={12} className="nav-caret" />
        </button>
      )}
    >
      {(close) => (
        <div className="menu demo-menu">
          <div className="menu-label-row">
            <span className="menu-label">Run a scenario</span>
            <div className="seg small" role="group" aria-label="Playback speed">
              {[1, 2, 4].map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
              ))}
            </div>
          </div>
          {SCENARIOS.map((s) => (
            <button key={s.key} className="menu-item" title={info[s.key]?.description} onClick={() => { void run(s.key); close(); }}>
              <span className={`dot dot-${s.tone}`} />
              <span className="mi-label mi-stack">
                <span>{s.label}</span>
                {info[s.key]?.expected && <span className="mi-sub">{info[s.key].expected}</span>}
              </span>
            </button>
          ))}

          <div className="menu-sep" />
          <label className="menu-check">
            <input type="checkbox" checked={drive.enabled} onChange={(e) => onDrive({ ...drive, enabled: e.target.checked })} />
            <Icon name="target" size={14} />
            <span>Drive a target by clicking the map</span>
          </label>
          {drive.enabled && (
            <div className="drive-opts">
              <select value={drive.kind} onChange={(e) => onDrive({ ...drive, kind: e.target.value as DriveKind })} aria-label="Target type">
                <option value="person">Person</option>
                <option value="vehicle">Vehicle</option>
                <option value="animal">Animal</option>
                <option value="none">Clutter</option>
              </select>
              <select value={drive.count} onChange={(e) => onDrive({ ...drive, count: Number(e.target.value) })} aria-label="Count">
                {[1, 2, 3, 5].map((n) => <option key={n} value={n}>×{n}</option>)}
              </select>
              <select value={drive.clock} onChange={(e) => onDrive({ ...drive, clock: e.target.value as DriveClock })} aria-label="Time of day">
                <option value="night">Night 02:40</option>
                <option value="day">Day 10:15</option>
                <option value="live">Real clock</option>
              </select>
            </div>
          )}

          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => { api.reset().then(() => onNotice('Demo reset to baseline')).catch((e) => onNotice((e as Error).message)); close(); }}
          >
            <Icon name="reset" size={14} /><span className="mi-label">Reset demo</span>
          </button>
        </div>
      )}
    </Popover>
  );
}
