const IST_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const istClock = (d: Date = new Date()) => IST_FORMAT.format(d);

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'Just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function cardinal(angle: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const a = ((angle % 360) + 360) % 360;
  return dirs[Math.round(a / 45) % 8];
}

export const heading = (deg: number | null | undefined) =>
  deg == null ? '—' : `${String(Math.round(deg)).padStart(3, '0')}° · ${cardinal(deg)}`;

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function secondsAgo(lastSeen: number, serverNow: number): string {
  const s = Math.max(0, Math.round(serverNow - lastSeen));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** Point at range_m along bearing_deg from (lat, lon); flat-earth is fine at radar ranges. */
export function project(lat: number, lon: number, rangeM: number, bearingDeg: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  return [
    lat + (rangeM * Math.cos(b)) / 111320,
    lon + (rangeM * Math.sin(b)) / (111320 * Math.cos((lat * Math.PI) / 180)),
  ];
}

export function motionClass(speeds: number[]): 'static' | 'walking' | 'vehicle' {
  if (!speeds.length) return 'static';
  const mean = Math.abs(speeds.reduce((a, b) => a + b, 0) / speeds.length);
  if (mean < 0.2) return 'static';
  return mean <= 2.5 ? 'walking' : 'vehicle';
}

export const isActive = (status: string) => status === 'open' || status === 'tracked' || status === 'escalated';
