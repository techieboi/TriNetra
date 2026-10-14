import type { AuditEntry, ScenarioInfo } from '../types';

async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export type OperatorActionName = 'confirm' | 'dismiss' | 'escalate' | 'need_info' | 'track' | 'pending';
export type DriveKind = 'person' | 'vehicle' | 'animal' | 'none';
export type DriveClock = 'night' | 'day' | 'live';

export const api = {
  action: (alertId: string, action: OperatorActionName, note = '') =>
    post(`/api/alerts/${alertId}/actions`, { action, note }),
  drone: (alertId: string) => post(`/api/alerts/${alertId}/drone`, {}),
  runScenario: (name: string, speed: number) => post(`/api/scenarios/${name}/run`, { speed }),
  reset: () => post('/api/demo/reset'),
  driveTarget: (lat: number, lon: number, kind: DriveKind, count: number, clock: DriveClock) =>
    post<{ ok: boolean; seen_by: string[] }>('/api/sim/target', { lat, lon, kind, count, clock }),
  audit: async (): Promise<AuditEntry[]> => (await fetch('/api/audit')).json(),
  scenarios: async (): Promise<Record<string, ScenarioInfo>> => (await fetch('/api/scenarios')).json(),
};
