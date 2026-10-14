import { useEffect, useReducer, useRef } from 'react';
import type {
  Alert, DroneDispatch, IncidentUpdate, LogRow, Metrics, NodeStatus, RadarEvent, Zone,
} from '../types';
import { playAlarm } from './audio';

export type Filter = 'all' | 'high' | 'review' | 'log';
export type LinkState = 'connecting' | 'online' | 'offline';

export interface RadarBlip extends RadarEvent {
  receivedAt: number;
}

export interface State {
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  alerts: Alert[];
  logs: LogRow[];
  metrics: Metrics | null;
  selectedId: string | null;
  filter: Filter;
  link: LinkState;
  lastSync: number;
  serverOffset: number; // server clock minus browser clock, seconds
  blips: RadarBlip[];
  latestIncident: IncidentUpdate | null;
  drone: (DroneDispatch & { startedAt: number }) | null;
}

const initial: State = {
  zone: null, nodes: {}, alerts: [], logs: [], metrics: null, selectedId: null, filter: 'all',
  link: 'connecting', lastSync: 0, serverOffset: 0, blips: [], latestIncident: null, drone: null,
};

type Msg = { type: string; [k: string]: any };
type Action =
  | { type: 'ws'; msg: Msg }
  | { type: 'link'; link: LinkState }
  | { type: 'select'; id: string }
  | { type: 'filter'; filter: Filter }
  | { type: 'droneDone' }
  | { type: 'pruneBlips' };

const BLIP_TTL_MS = 25_000;
const byNewest = (a: Alert, b: Alert) => Date.parse(b.created_at) - Date.parse(a.created_at);

function upsert(alerts: Alert[], alert: Alert): Alert[] {
  const rest = alerts.filter((a) => a.alert_id !== alert.alert_id);
  return [alert, ...rest].sort(byNewest);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'link':
      return { ...state, link: action.link };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'filter':
      return { ...state, filter: action.filter };
    case 'droneDone':
      return { ...state, drone: null };
    case 'pruneBlips': {
      const cutoff = Date.now() - BLIP_TTL_MS;
      const blips = state.blips.filter((b) => b.receivedAt > cutoff);
      return blips.length === state.blips.length ? state : { ...state, blips };
    }
    case 'ws':
      return applyMessage(state, action.msg);
  }
}

function applyMessage(state: State, msg: Msg): State {
  const synced = { ...state, lastSync: Date.now() };
  switch (msg.type) {
    case 'init': {
      const alerts = [...(msg.alerts as Alert[])].sort(byNewest);
      const keep = alerts.some((a) => a.alert_id === state.selectedId);
      return {
        ...synced,
        zone: msg.zone, nodes: msg.nodes, alerts, logs: msg.sensor_logs, metrics: msg.metrics,
        serverOffset: msg.server_time - Date.now() / 1000,
        selectedId: keep ? state.selectedId : alerts[0]?.alert_id ?? null,
        blips: [], latestIncident: null, drone: null,
      };
    }
    case 'alert': {
      const alert = msg.data as Alert;
      return {
        ...synced,
        alerts: upsert(state.alerts, alert),
        selectedId: msg.is_new ? alert.alert_id : state.selectedId ?? alert.alert_id,
      };
    }
    case 'alert_action':
      return { ...synced, alerts: upsert(state.alerts, msg.data as Alert) };
    case 'node_update':
      return { ...synced, nodes: msg.data, serverOffset: msg.server_time - Date.now() / 1000 };
    case 'sensor_logs':
      return { ...synced, logs: msg.data };
    case 'metrics':
      return { ...synced, metrics: msg.data };
    case 'incident':
      return { ...synced, latestIncident: msg.data };
    case 'radar':
      return { ...synced, blips: [...state.blips, { ...(msg.data as RadarEvent), receivedAt: Date.now() }].slice(-120) };
    case 'drone_dispatch':
      return { ...synced, drone: { ...(msg as unknown as DroneDispatch), startedAt: Date.now() } };
    default:
      return synced;
  }
}

/** Live dashboard state from the backend WebSocket, reconnecting with backoff. */
export function useLiveState() {
  const [state, dispatch] = useReducer(reducer, initial);
  const retry = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let closed = false;

    const connect = () => {
      dispatch({ type: 'link', link: 'connecting' });
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onopen = () => {
        retry.current = 0;
        dispatch({ type: 'link', link: 'online' });
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as Msg;
        if (msg.type === 'alert' && msg.audio_cue) playAlarm();
        dispatch({ type: 'ws', msg });
      };
      ws.onclose = () => {
        if (closed) return;
        dispatch({ type: 'link', link: 'offline' });
        const delay = Math.min(5000, 2000 * 1.5 ** retry.current++);
        timer = window.setTimeout(connect, delay);
      };
    };
    connect();
    const prune = window.setInterval(() => dispatch({ type: 'pruneBlips' }), 2000);

    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(prune);
      ws?.close();
    };
  }, []);

  return [state, dispatch] as const;
}

export type Dispatch = ReturnType<typeof useLiveState>[1];
