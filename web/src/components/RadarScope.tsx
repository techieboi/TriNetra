import { useEffect, useRef } from 'react';
import type { RadarConfig, RadarPoint } from '../types';
import { motionClass } from '../lib/format';

interface Props {
  track: RadarPoint[];
  radar?: RadarConfig;
  nodeId: string;
}

const W = 170;
const H = 104;

/** Fan-shaped radar display (node at the bottom, wedge pointing up) plus range-over-time trace. */
export function RadarScope({ track, radar, nodeId }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fov = radar?.fov_deg ?? 120;
  const maxRange = radar?.range_m ?? 300;
  const facing = radar?.facing_deg ?? 0;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    const ox = W / 2;
    const oy = H - 6;
    const R = H - 14;
    const half = ((fov / 2) * Math.PI) / 180;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      // fan + range rings
      ctx.strokeStyle = 'rgba(56,189,248,0.25)';
      ctx.lineWidth = 1;
      [1 / 3, 2 / 3, 1].forEach((f) => {
        ctx.beginPath();
        ctx.arc(ox, oy, R * f, -Math.PI / 2 - half, -Math.PI / 2 + half);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + R * Math.sin(-half), oy - R * Math.cos(-half));
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + R * Math.sin(half), oy - R * Math.cos(half));
      ctx.stroke();
      // sweep
      const sweep = Math.sin(t / 900) * half;
      ctx.strokeStyle = 'rgba(34,211,238,0.35)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + R * Math.sin(sweep), oy - R * Math.cos(sweep));
      ctx.stroke();
      // range labels
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText(`${Math.round(maxRange)} m`, ox + 4, oy - R + 8);
      // returns
      track.forEach((p, i) => {
        const rel = (((p.bearing_deg - facing + 540) % 360) - 180) * (Math.PI / 180);
        const r = Math.min(1, p.range_m / maxRange) * R;
        const x = ox + r * Math.sin(rel);
        const y = oy - r * Math.cos(rel);
        const last = i === track.length - 1;
        ctx.fillStyle = last ? '#22d3ee' : `rgba(34,211,238,${0.25 + (0.5 * i) / track.length})`;
        ctx.beginPath();
        ctx.arc(x, y, last ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fill();
        if (last) {
          ctx.strokeStyle = 'rgba(34,211,238,0.6)';
          ctx.beginPath();
          ctx.arc(x, y, 5 + 3 * Math.abs(Math.sin(t / 300)), 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track, fov, maxRange, facing]);

  const last = track[track.length - 1];
  const motion = motionClass(track.map((p) => p.speed_mps));
  const approaching = track.length > 1 ? track[track.length - 1].range_m < track[0].range_m : (last?.speed_mps ?? 0) < 0;

  // range-over-time sparkline
  const ranges = track.map((p) => p.range_m);
  const top = Math.max(1, ...ranges);
  const spark = ranges
    .map((r, i) => `${(i / Math.max(1, ranges.length - 1)) * 100},${28 - (r / top) * 26}`)
    .join(' ');

  return (
    <div className="radar-box">
      <div className="waveform-header">
        <span>{nodeId} mmWave RADAR</span>
        <span className="waveform-freq-tag">SIM · {radar?.model?.replace(' (simulated)', '') ?? 'mmWave'}</span>
      </div>
      {track.length === 0 ? (
        <div className="radar-empty">No radar track on this alert</div>
      ) : (
        <div className="radar-body">
          <canvas ref={canvas} style={{ width: W, height: H }} />
          <div className="radar-readouts">
            <div><span className="meta-label">Range</span><span className="meta-val">{last.range_m.toFixed(0)} m</span></div>
            <div>
              <span className="meta-label">Speed</span>
              <span className="meta-val">{Math.abs(last.speed_mps).toFixed(1)} m/s</span>
            </div>
            <div>
              <span className="meta-label">Motion</span>
              <span className={`meta-val ${motion !== 'static' && approaching ? 'red-text' : ''}`}>
                {motion === 'static' ? 'Near-static' : `${approaching ? 'Closing' : 'Receding'} · ${motion}`}
              </span>
            </div>
            {ranges.length > 1 && (
              <svg className="radar-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Range over time">
                <polyline points={spark} fill="none" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
