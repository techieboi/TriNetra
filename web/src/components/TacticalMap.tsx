import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

/** Overlays the operator can switch off from the Layers menu. */
export type LayerKey = 'border' | 'zones' | 'das' | 'wedges' | 'bop' | 'radar';
export type LayerVisibility = Record<LayerKey, boolean>;
export type BaseLayer = 'map' | 'satellite';

export const DEFAULT_LAYERS: LayerVisibility = { border: true, zones: true, das: false, wedges: true, bop: true, radar: true };

interface Props {
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  alerts: Alert[];
  selectedId: string | null;
  focusNodeId: string | null;
  blips: RadarBlip[];
  drone: State['drone'];
  drive: DriveSettings;
  layers: LayerVisibility;
  baseLayer: BaseLayer;
  onBaseLayer: (b: BaseLayer) => void;
  /** Bump to fit the map back to the inspection zone. */
  recenter: number;
  drawerOpen: boolean;
  /** Where the click card is anchored, and the card itself. */
  popupAt: [number, number] | null;
  popup: ReactNode;
  onNodeClick: (id: string) => void;
  onAlertClick: (id: string) => void;
  onMapClick: () => void;
  onDroneArrived: () => void;
  onDriveResult: (msg: string) => void;
  children?: ReactNode;
}

type GroupKey = LayerKey | 'nodes' | 'alerts' | 'threat' | 'drone' | 'drive';

const WEDGE_COLOR: Record<string, string> = { standby: '#38bdf8', waking: '#f59e0b', recording: '#ef4444', offline: '#64748b' };
const DRAWER_W = 420;
const CARD_W = 300;
const PHONE_W = 720;

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

/** What is actually deployed: every node with its radar coverage, the outposts and the watched zones. */
function zoneBounds(zone: Zone): L.LatLngBounds {
  const pts: L.LatLngExpression[] = [
    ...zone.nodes.flatMap((n) => (n.radar ? wedge(n) : [[n.lat, n.lon] as L.LatLngTuple])),
    ...zone.bops.map((b) => [b.lat, b.lon] as L.LatLngTuple),
    ...zone.geofences.flatMap((g) => g.polygon),
  ];
  if (!pts.length && zone.bounds) {
    pts.push([zone.bounds.min_lat, zone.bounds.min_lon], [zone.bounds.max_lat, zone.bounds.max_lon]);
  }
  return L.latLngBounds(pts);
}

export function TacticalMap(props: Props) {
  const { zone, nodes, alerts, selectedId, focusNodeId, blips, drone, drive, layers: visible, baseLayer, drawerOpen } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<GroupKey, L.LayerGroup> | null>(null);
  const base = useRef<{ dark: L.TileLayer; sat: L.TileLayer } | null>(null);
  const driveRef = useRef(drive);
  const cb = useRef(props);
  const fitted = useRef(false);
  const [cursor, setCursor] = useState('');
  const [view, setView] = useState(0); // bumps on every pan/zoom so the click card follows its marker
  driveRef.current = drive;
  cb.current = props;

  // ---- init once ----
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      center: [26.8515, 84.2318], zoom: 15, zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: false, attributionControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(m);
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });
    dark.addTo(m);
    base.current = { dark, sat };
    const keys: GroupKey[] = ['border', 'zones', 'das', 'wedges', 'bop', 'radar', 'nodes', 'alerts', 'threat', 'drone', 'drive'];
    layers.current = Object.fromEntries(keys.map((k) => [k, L.layerGroup().addTo(m)])) as Record<GroupKey, L.LayerGroup>;

    m.on('mousemove', (e: L.LeafletMouseEvent) =>
      setCursor(`${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`));
    m.on('move zoom resize', () => setView((v) => v + 1));

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
      if (!driveRef.current.enabled) {
        cb.current.onMapClick();
        return;
      }
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
      if (e.key === 'm' || e.key === 'M') cb.current.onBaseLayer('map');
      if (e.key === 's' || e.key === 'S') cb.current.onBaseLayer('satellite');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- overlay visibility ----
  useEffect(() => {
    const m = map.current;
    const ls = layers.current;
    if (!m || !ls) return;
    (Object.keys(visible) as LayerKey[]).forEach((k) => {
      if (visible[k]) ls[k].addTo(m);
      else m.removeLayer(ls[k]);
    });
  }, [visible]);

  // ---- fit to the inspection zone: on first load and whenever re-centre is pressed ----
  useEffect(() => {
    const m = map.current;
    if (!m || !zone) return;
    const animate = fitted.current;
    fitted.current = true;
    m.fitBounds(zoneBounds(zone), {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [cb.current.drawerOpen ? DRAWER_W + 48 : 48, 64],
      animate,
    });
  }, [zone, props.recenter]);

  // ---- static zone drawing ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls || !zone) return;
    ls.border.clearLayers();
    ls.zones.clearLayers();
    ls.bop.clearLayers();
    ls.das.clearLayers();

    L.polyline(zone.international_border, { color: '#93c5fd', weight: 1.5, dashArray: '6, 6', opacity: 0.7 }).addTo(ls.border);
    const mid = zone.international_border[1];
    L.marker(mid, {
      icon: L.divIcon({ className: 'border-line-label', html: 'India–Nepal border (indicative)', iconSize: [210, 20], iconAnchor: [60, -4] }),
      interactive: false,
    }).addTo(ls.border);

    zone.geofences.forEach((gf) => {
      L.polygon(gf.polygon, { color: gf.color, weight: 1, dashArray: '3, 5', fillColor: gf.color, fillOpacity: 0.08 })
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
        icon: L.divIcon({ className: 'bop-marker-wrap', html: '<div class="bop-marker">BOP</div>', iconSize: [30, 18], iconAnchor: [15, 9] }),
      }).bindTooltip(`${bop.name} · ${bop.contact}`, { className: 'tactical-tooltip' }).addTo(ls.bop);
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
          color: WEDGE_COLOR[cam], weight: 1, opacity: 0.6, fillColor: WEDGE_COLOR[cam],
          fillOpacity: cam === 'standby' ? 0.07 : cam === 'offline' ? 0.03 : 0.2, dashArray: cam === 'offline' ? '3, 6' : undefined,
          interactive: false,
        }).addTo(ls.wedges);
      }
      const status = st?.status ?? 'online';
      const hasAlert = alerts.some((a) => a.primary_node === node.id && isActive(a.status));
      const cls = ['nd', status, `cam-${cam}`, hasAlert ? 'has-alert' : '', node.id === focusNodeId ? 'selected' : ''].join(' ');
      L.marker([node.lat, node.lon], {
        icon: L.divIcon({
          className: 'nd-wrap',
          html: `<div class="${cls}"><span class="nd-dot"></span><span class="nd-label">${node.id}</span></div>`,
          iconSize: [20, 20], iconAnchor: [10, 10],
        }),
        keyboard: true,
        title: node.name,
        zIndexOffset: 500,
      })
        .on('click', () => cb.current.onNodeClick(node.id))
        .addTo(ls.nodes);
    });
  }, [zone, nodes, alerts, focusNodeId]);

  // ---- alert markers + selected threat ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.alerts.clearLayers();
    ls.threat.clearLayers();
    alerts.filter((a) => isActive(a.status) && a.alert_id !== selectedId).forEach((a) => {
      L.marker([a.lat, a.lon], {
        icon: L.divIcon({ className: 'ad-wrap', html: `<div class="ad ${a.band}"><i></i></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: `${a.alert_id} · ${a.band.toUpperCase()} ${a.score}`,
        zIndexOffset: 800,
      })
        .on('click', () => cb.current.onAlertClick(a.alert_id))
        .addTo(ls.alerts);
    });

    const cur = alerts.find((a) => a.alert_id === selectedId);
    if (!cur) return;
    const color = cur.band === 'high' ? '#ef4444' : cur.band === 'review' ? '#f59e0b' : '#94a3b8';
    if (cur.radar_track.length > 1) {
      L.polyline(cur.radar_track.map((p) => [p.lat, p.lon] as L.LatLngExpression), { color: '#38bdf8', weight: 2, opacity: 0.8, dashArray: '2, 4', interactive: false }).addTo(ls.threat);
    }
    if (cur.heading_deg != null) {
      L.polyline([[cur.lat, cur.lon], project(cur.lat, cur.lon, 160, cur.heading_deg)], { color, weight: 2, opacity: 0.9, interactive: false }).addTo(ls.threat);
    }
    L.marker([cur.lat, cur.lon], {
      icon: L.divIcon({
        className: 'ad-wrap',
        html: `<div class="ad ${cur.band} selected ${isActive(cur.status) ? '' : 'closed'}"><i></i></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
      title: cur.alert_id,
      zIndexOffset: 900,
    })
      .on('click', () => cb.current.onAlertClick(cur.alert_id))
      .addTo(ls.threat);
  }, [alerts, selectedId]);

  // ---- keep whatever was just opened in view, clear of the card and the drawer ----
  const popupKey = props.popupAt ? props.popupAt.join(',') : '';
  useEffect(() => {
    const m = map.current;
    const at = cb.current.popupAt;
    if (!m || !at) return;
    const size = m.getSize();
    // Phones dock the card along the bottom; wider screens float it beside the marker.
    if (size.x < PHONE_W) m.panInside(at, { paddingTopLeft: [40, 60], paddingBottomRight: [40, 380], animate: true });
    else m.panInside(at, {
      paddingTopLeft: [CARD_W + 40, 80],
      paddingBottomRight: [(drawerOpen ? DRAWER_W : 0) + CARD_W + 40, 80],
      animate: true,
    });
  }, [popupKey, drawerOpen]);

  useEffect(() => {
    const m = map.current;
    if (!m || !drawerOpen) return;
    const { alerts: all, zone: z } = cb.current;
    const a = all.find((x) => x.alert_id === selectedId);
    const n = z?.nodes.find((x) => x.id === focusNodeId);
    const at: L.LatLngTuple | null = n ? [n.lat, n.lon] : a ? [a.lat, a.lon] : null;
    if (!at) return;
    const size = m.getSize();
    if (size.x < PHONE_W) m.panInside(at, { paddingTopLeft: [40, 40], paddingBottomRight: [40, size.y * 0.74 + 40], animate: true });
    else m.panInside(at, { paddingTopLeft: [80, 80], paddingBottomRight: [DRAWER_W + 80, 80], animate: true });
  }, [drawerOpen, selectedId, focusNodeId]);

  // ---- live radar returns ----
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.radar.clearLayers();
    const byNode = new Map<string, RadarBlip[]>();
    blips.forEach((b) => byNode.set(b.node_id, [...(byNode.get(b.node_id) ?? []), b]));
    byNode.forEach((pts) => {
      if (pts.length > 1) {
        L.polyline(pts.map((p) => [p.lat, p.lon] as L.LatLngExpression), { color: '#22d3ee', weight: 2, opacity: 0.7, interactive: false }).addTo(ls.radar);
      }
      const last = pts[pts.length - 1];
      L.marker([last.lat, last.lon], {
        icon: L.divIcon({ className: 'radar-blip-wrap', html: '<div class="radar-blip"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }),
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

  return (
    <div className="map-stage">
      <div ref={el} id="c2-leaflet-map" />
      {props.popupAt && props.popup && (
        <PopupLayer map={map.current} at={props.popupAt} view={view} drawerOpen={drawerOpen}>
          {props.popup}
        </PopupLayer>
      )}
      {props.children}
      <div className="map-foot">
        {cursor && <span className="map-cursor">{cursor}</span>}
        <span>Tiles © CARTO · Esri · Sensor feeds simulated</span>
      </div>
      {drive.enabled && <div className="drive-hint">Click the map to place a target · drag it to move</div>}
    </div>
  );
}

/** Positions the click card beside its marker and keeps it inside the visible map. */
function PopupLayer({ map, at, view, drawerOpen, children }: { map: L.Map | null; at: [number, number]; view: number; drawerOpen: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!map || !box.current) return;
    const pt = map.latLngToContainerPoint(at);
    const size = map.getSize();
    if (size.x < PHONE_W) {
      setPos({ left: 12, top: size.y - box.current.offsetHeight - 76 });
      return;
    }
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const right = size.x - (drawerOpen ? DRAWER_W : 0) - 12;
    let left = pt.x + 18;
    if (left + w > right) left = pt.x - 18 - w;
    left = Math.max(12, Math.min(left, right - w));
    const top = Math.max(12, Math.min(pt.y - 28, size.y - h - 12));
    setPos({ left, top });
  }, [map, at, view, drawerOpen, children]);

  return (
    <div ref={box} className="map-card-layer" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      {children}
    </div>
  );
}
