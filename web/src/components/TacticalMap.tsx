import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Alert, NodeStatus, Zone, ZoneNode } from '../types';
import type { RadarBlip, State } from '../lib/store';
import type { DriveClock, DriveKind } from '../lib/api';
import { api } from '../lib/api';
import { isActive, project } from '../lib/format';

export interface DriveSettings {
  enabled: boolean;
  kind: DriveKind;
  count: number;
  clock: DriveClock;
}

interface Props {
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  alerts: Alert[];
  selectedId: string | null;
  blips: RadarBlip[];
  drone: State['drone'];
  drive: DriveSettings;
  onSelect: (id: string) => void;
  onDroneArrived: () => void;
  onDriveResult: (msg: string) => void;
  children?: React.ReactNode;
}

type LayerKey = 'border' | 'zones' | 'das' | 'wedges' | 'nodes' | 'bop' | 'alerts' | 'threat' | 'radar' | 'drone' | 'drive';

const WEDGE_COLOR: Record<string, string> = { standby: '#38bdf8', waking: '#f59e0b', recording: '#ef4444', offline: '#64748b' };

function wedge(node: ZoneNode): L.LatLngExpression[] {
  const r = node.radar!;
  const pts: L.LatLngExpression[] = [[node.lat, node.lon]];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const b = r.facing_deg - r.fov_deg / 2 + (r.fov_deg * i) / steps;
    pts.push(project(node.lat, node.lon, r.range_m, b));
  }
  return pts;
}

export function TacticalMap(props: Props) {
  const { zone, nodes, alerts, selectedId, blips, drone, drive } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<LayerKey, L.LayerGroup> | null>(null);
  const base = useRef<{ dark: L.TileLayer; sat: L.TileLayer } | null>(null);
  const driveRef = useRef(drive);
  const cb = useRef(props);
  const [baseLayer, setBaseLayer] = useState<'map' | 'satellite'>('satellite');
  const [cursor, setCursor] = useState('—');
  driveRef.current = drive;
  cb.current = props;

  // ---- init once ----
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: [26.8515, 84.2318], zoom: 15, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });
    sat.addTo(m);
    base.current = { dark, sat };
    const keys: LayerKey[] = ['border', 'zones', 'das', 'wedges', 'nodes', 'bop', 'alerts', 'threat', 'radar', 'drone', 'drive'];
    layers.current = Object.fromEntries(keys.map((k) => [k, L.layerGroup().addTo(m)])) as Record<LayerKey, L.LayerGroup>;

    m.on('mousemove', (e: L.LeafletMouseEvent) =>
      setCursor(`${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`));

    let target: L.Marker | null = null;
    const send = async (ll: L.LatLng) => {
      const d = driveRef.current;
      try {
        const res = await api.driveTarget(ll.lat, ll.lng, d.kind, d.count, d.clock);
        cb.current.onDriveResult(res.seen_by.length ? `Seen by ${res.seen_by.join(', ')} radar` : 'Outside radar coverage: nothing detects it');
      } catch (err) {
        cb.current.onDriveResult(`Drive failed: ${(err as Error).message}`);
      }
    };
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (!driveRef.current.enabled) return;
      const icon = L.divIcon({ className: 'drive-target-wrap', html: '<div class="drive-target"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
      if (!target) {
        target = L.marker(e.latlng, { icon, draggable: true }).addTo(layers.current!.drive);
        target.on('dragend', () => send(target!.getLatLng()));
      } else {
        target.setLatLng(e.latlng);
      }
      void send(e.latlng);
    });
    (m as L.Map & { _clearDrive?: () => void })._clearDrive = () => {
      layers.current?.drive.clearLayers();
      target = null;
    };
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!drive.enabled) (map.current as (L.Map & { _clearDrive?: () => void }) | null)?._clearDrive?.();
    el.current?.classList.toggle('drive-mode', drive.enabled);
  }, [drive.enabled]);

  // ---- base layer + hotkeys ----
  useEffect(() => {
    const m = map.current;
    if (!m || !base.current) return;
    const { dark, sat } = base.current;
    if (baseLayer === 'satellite') {
      m.removeLayer(dark);
      sat.addTo(m);
    } else {
      m.removeLayer(sat);
      dark.addTo(m);
    }
  }, [baseLayer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'm' || e.key === 'M') setBaseLayer('map');
      if (e.key === 's' || e.key === 'S') setBaseLayer('satellite');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- static zone drawing ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls || !zone) return;
    ls.border.clearLayers();
    ls.zones.clearLayers();
    ls.bop.clearLayers();
    ls.das.clearLayers();

    L.polyline(zone.international_border, { color: '#60a5fa', weight: 1.8, dashArray: '5, 6', opacity: 0.75 }).addTo(ls.border);
    const mid = zone.international_border[1];
    L.marker(mid, {
      icon: L.divIcon({ className: 'border-line-label', html: 'India–Nepal border (indicative)', iconSize: [210, 20], iconAnchor: [60, -4] }),
      interactive: false,
    }).addTo(ls.border);

    zone.geofences.forEach((gf) => {
      L.polygon(gf.polygon, { color: gf.color, weight: 1.5, dashArray: '4, 6', fillColor: gf.color, fillOpacity: 0.12 })
        .bindTooltip(`${gf.name} · ${gf.active_hours}`, { className: 'tactical-tooltip', sticky: true })
        .addTo(ls.zones);
    });

    if (zone.das_fiber) {
      L.polyline(zone.das_fiber.path, { color: '#a78bfa', weight: 3, dashArray: '2, 7', opacity: 0.85 })
        .bindTooltip(`${zone.das_fiber.name}: shown for the deployment picture, not active in the demo`, { className: 'tactical-tooltip', sticky: true })
        .addTo(ls.das);
    }

    zone.bops.forEach((bop) => {
      L.marker([bop.lat, bop.lon], {
        icon: L.divIcon({ className: 'bop-marker-wrap', html: '<div class="bop-marker">BOP</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).bindTooltip(`${bop.name} · ${bop.contact}`, { className: 'tactical-tooltip' }).addTo(ls.bop);
      L.circle([bop.lat, bop.lon], { radius: 600, color: '#3b82f6', weight: 1, dashArray: '4, 8', fill: false, opacity: 0.4 }).addTo(ls.bop);
    });
  }, [zone]);

  // ---- nodes + radar wedges (status-dependent) ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls || !zone) return;
    ls.wedges.clearLayers();
    ls.nodes.clearLayers();
    zone.nodes.forEach((node) => {
      const st = nodes[node.id];
      const cam = st?.status === 'offline' ? 'offline' : st?.camera_state ?? 'standby';
      if (node.radar) {
        L.polygon(wedge(node), {
          color: WEDGE_COLOR[cam], weight: 1.4, opacity: 0.85, fillColor: WEDGE_COLOR[cam],
          fillOpacity: cam === 'standby' ? 0.13 : cam === 'offline' ? 0.05 : 0.24, dashArray: cam === 'offline' ? '3, 6' : undefined,
          interactive: false,
        }).addTo(ls.wedges);
      }
      const statusClass = st?.status === 'offline' ? 'offline' : st?.status === 'warning' ? 'warning' : '';
      L.marker([node.lat, node.lon], {
        icon: L.divIcon({
          className: 'node-marker-wrap',
          html: `<div class="node-circle-marker"><div class="node-circle-outer ${statusClass} cam-${cam}">${node.id}</div></div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        }),
      })
        .bindTooltip(
          `${node.name} · mmWave radar + ${node.camera ?? 'camera'}<br/>Wedge: ${node.radar?.range_m ?? '?'} m deployment range (demo module ~${node.radar?.demo_range_m ?? '?'} m)`,
          { className: 'tactical-tooltip' },
        )
        .on('click', () => {
          const match = cb.current.alerts.find((a) => a.primary_node === node.id && isActive(a.status));
          if (match) cb.current.onSelect(match.alert_id);
        })
        .addTo(ls.nodes);
    });
  }, [zone, nodes]);

  // ---- alert markers + selected threat ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.alerts.clearLayers();
    ls.threat.clearLayers();
    alerts.filter((a) => isActive(a.status) && a.alert_id !== selectedId).forEach((a) => {
      L.circleMarker([a.lat, a.lon], { radius: 6, color: a.band === 'high' ? '#ef4444' : '#f59e0b', weight: 2, fillOpacity: 0.5 })
        .bindTooltip(`${a.alert_id} · ${a.band.toUpperCase()} ${a.score}`, { className: 'tactical-tooltip' })
        .on('click', () => cb.current.onSelect(a.alert_id))
        .addTo(ls.alerts);
    });

    const cur = alerts.find((a) => a.alert_id === selectedId);
    if (!cur) return;
    const color = cur.band === 'high' ? '#ef4444' : cur.band === 'review' ? '#f59e0b' : '#94a3b8';
    if (cur.radar_track.length > 1) {
      L.polyline(cur.radar_track.map((p) => [p.lat, p.lon] as L.LatLngExpression), { color: '#38bdf8', weight: 2, opacity: 0.8, dashArray: '2, 4' }).addTo(ls.threat);
    }
    L.marker([cur.lat, cur.lon], {
      icon: L.divIcon({
        className: 'threat-marker-wrap',
        html: `<div class="threat-pulse-ring ${cur.band}"></div><div class="threat-center-dot ${cur.band}"></div>
               <div class="threat-tag-label">${cur.alert_id} · ${cur.detected_class ?? 'Unconfirmed'}${cur.heading_deg != null ? ` · ${Math.round(cur.heading_deg)}°` : ''}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      }),
    }).addTo(ls.threat);
    if (cur.heading_deg != null) {
      L.polyline([[cur.lat, cur.lon], project(cur.lat, cur.lon, 160, cur.heading_deg)], { color, weight: 2, opacity: 0.9 }).addTo(ls.threat);
    }
  }, [alerts, selectedId]);

  // ---- pan to selection ----
  useEffect(() => {
    const cur = cb.current.alerts.find((a) => a.alert_id === selectedId);
    if (cur && map.current) map.current.panTo([cur.lat, cur.lon], { animate: true, duration: 0.6 });
  }, [selectedId]);

  // ---- live radar returns ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.radar.clearLayers();
    const byNode = new Map<string, RadarBlip[]>();
    blips.forEach((b) => byNode.set(b.node_id, [...(byNode.get(b.node_id) ?? []), b]));
    byNode.forEach((pts) => {
      if (pts.length > 1) {
        L.polyline(pts.map((p) => [p.lat, p.lon] as L.LatLngExpression), { color: '#22d3ee', weight: 2, opacity: 0.7 }).addTo(ls.radar);
      }
      const last = pts[pts.length - 1];
      L.marker([last.lat, last.lon], {
        icon: L.divIcon({ className: 'radar-blip-wrap', html: '<div class="radar-blip"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
        interactive: false,
      }).addTo(ls.radar);
    });
  }, [blips]);

  // ---- drone flight (operator-dispatched) ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.drone.clearLayers();
    if (!drone) return;
    const from: L.LatLngTuple = [drone.bop_lat, drone.bop_lon];
    const to: L.LatLngTuple = [drone.target_lat, drone.target_lon];
    L.polyline([from, to], { color: '#ef4444', weight: 2, dashArray: '4, 8', opacity: 0.8 }).addTo(ls.drone);
    const marker = L.marker(from, {
      icon: L.divIcon({
        className: 'leaflet-drone-marker',
        html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path><path d="M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"></path></svg>',
        iconSize: [30, 30], iconAnchor: [15, 15],
      }),
    }).addTo(ls.drone);
    const duration = Math.max(2, drone.eta_seconds) * 1000;
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - drone.startedAt) / duration);
      marker.setLatLng([from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p]);
      if (p < 1) raf = requestAnimationFrame(step);
      else cb.current.onDroneArrived();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drone]);

  const topHigh = alerts.find((a) => a.band === 'high' && isActive(a.status));

  return (
    <div className="c2-panel panel-map">
      <div className="map-hud-bar">
        <div className="map-hud-left">
          <div className="map-switcher-pills">
            <button className={`map-pill ${baseLayer === 'map' ? 'active' : ''}`} onClick={() => setBaseLayer('map')}>Map</button>
            <button className={`map-pill ${baseLayer === 'satellite' ? 'active' : ''}`} onClick={() => setBaseLayer('satellite')}>Satellite</button>
          </div>
          <div className="cursor-coords-tag">Cursor <span>{cursor}</span></div>
        </div>
        <div className="map-hud-right">
          {topHigh && (
            <div className="map-high-alert-banner" onClick={() => props.onSelect(topHigh.alert_id)}>
              <span className="alert-banner-icon">⚠</span>
              <span className="alert-banner-text">HIGH ALERT</span>
              <span className="alert-banner-tag">{topHigh.alert_id} · {topHigh.score}</span>
            </div>
          )}
        </div>
      </div>
      <div className="map-compass-badge" title="North"><span>N</span></div>
      <div ref={el} id="c2-leaflet-map" />
      {props.children}
      <div className="map-tactical-legend">
        {zone?.geofences.map((g) => (
          <div className="legend-row" key={g.id}>
            <span className="legend-box" style={{ background: `${g.color}33`, borderColor: g.color }} />
            <span>{g.name}</span>
          </div>
        ))}
        <div className="legend-row"><span className="legend-box legend-radar" /><span>Radar wedge (300 m deployment)</span></div>
        <div className="legend-row"><span className="legend-line legend-das" /><span>Fiber DAS · deployment only</span></div>
      </div>
      {drive.enabled && <div className="drive-hint">Click the map to place a target · drag it to move</div>}
    </div>
  );
}
