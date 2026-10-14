import { useEffect, useState } from 'react';
import type { ScenarioInfo } from '../types';
import { api, type DriveClock, type DriveKind } from '../lib/api';
import type { DriveSettings } from './TacticalMap';

const SCENARIOS: { key: string; label: string }[] = [
  { key: 'intrusion', label: '🚨 Night Intrusion' },
  { key: 'routine', label: '🚶 Market Crossing' },
  { key: 'animal', label: '🐄 Stray Animal' },
  { key: 'radar_only', label: '📶 Radar Only' },
  { key: 'offline', label: '📡 Node Offline' },
];

interface Props {
  drive: DriveSettings;
  onDrive: (d: DriveSettings) => void;
  onNotice: (msg: string) => void;
}

export function DemoBar({ drive, onDrive, onNotice }: Props) {
  const [open, setOpen] = useState(true);
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
    <footer className="c2-footer">
      <button className="demo-controls-toggle" onClick={() => setOpen(!open)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8 7 17M17 7l2.8-2.8" /></svg>
        Demo controls
      </button>
      {open && (
        <div className="demo-controls-bar">
          <span className="demo-label">SCENARIOS:</span>
          {SCENARIOS.map((s) => (
            <button key={s.key} className="demo-btn" title={info[s.key]?.description} onClick={() => run(s.key)}>
              {s.label}
            </button>
          ))}
          <select className="demo-speed-sel" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
          <span className="demo-divider" />
          <button
            className={`demo-btn ${drive.enabled ? 'demo-btn-active' : ''}`}
            title="Click the map to place a simulated target; any radar wedge covering it reports it"
            onClick={() => onDrive({ ...drive, enabled: !drive.enabled })}
          >
            🎯 Drive a target{drive.enabled ? ' · ON' : ''}
          </button>
          {drive.enabled && (
            <>
              <select className="demo-speed-sel" value={drive.kind} onChange={(e) => onDrive({ ...drive, kind: e.target.value as DriveKind })} aria-label="Target type">
                <option value="person">Person</option>
                <option value="vehicle">Vehicle</option>
                <option value="animal">Animal</option>
                <option value="none">Clutter</option>
              </select>
              <select className="demo-speed-sel" value={drive.count} onChange={(e) => onDrive({ ...drive, count: Number(e.target.value) })} aria-label="Count">
                {[1, 2, 3, 5].map((n) => <option key={n} value={n}>×{n}</option>)}
              </select>
              <select className="demo-speed-sel" value={drive.clock} onChange={(e) => onDrive({ ...drive, clock: e.target.value as DriveClock })} aria-label="Time of day">
                <option value="night">Night 02:40</option>
                <option value="day">Day 10:15</option>
                <option value="live">Real clock</option>
              </select>
            </>
          )}
          <span className="demo-divider" />
          <button className="demo-btn" onClick={() => api.reset().then(() => onNotice('Demo reset to baseline'))}>↺ Reset</button>
        </div>
      )}
    </footer>
  );
}
