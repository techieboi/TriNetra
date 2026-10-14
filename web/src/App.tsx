import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditEntry } from './types';
import { useLiveState, type Panel } from './lib/store';
import { useNow } from './lib/useNow';
import { api, type OperatorActionName } from './lib/api';
import { inRange, isActive } from './lib/format';
import { NavBar } from './components/NavBar';
import { HeadlineTicker } from './components/HeadlineTicker';
import { StatusPill } from './components/StatusPill';
import { DemoMenu } from './components/DemoMenu';
import { TacticalMap, DEFAULT_LAYERS, type BaseLayer, type DriveSettings, type LayerVisibility } from './components/TacticalMap';
import { MapPopupCard } from './components/MapPopupCard';
import { Drawer } from './components/Drawer';
import { NodeDetail } from './components/NodeDetail';
import { Briefing } from './components/Briefing';
import { AlertQueue } from './components/AlertQueue';
import { SensorHealth } from './components/SensorHealth';
import { SensorLog } from './components/SensorLog';
import { ThreatPanel } from './components/ThreatPanel';
import { PipelineStrip } from './components/PipelineStrip';
import { AuditModal, CameraModal, DroneModal, NoteModal } from './components/Modals';

type ModalState =
  | { kind: 'camera' }
  | { kind: 'audit'; entries: AuditEntry[] }
  | { kind: 'note'; action: 'dismiss' | 'escalate'; alertId: string }
  | { kind: 'drone'; alertId: string; videoUrl: string | null; snapshot: string }
  | null;

const LIVE_TOAST_MS = 8000;
const FRESH_MS = 6000;

export default function App() {
  const [state, dispatch, resync] = useLiveState();
  const now = useNow(1000);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drive, setDrive] = useState<DriveSettings>({ enabled: false, kind: 'person', count: 2, clock: 'night' });
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('satellite');
  const [recenter, setRecenter] = useState(0);
  const [liveAt, setLiveAt] = useState(0);

  const { zone, nodes, popup, panel } = state;
  const selected = state.alerts.find((a) => a.alert_id === state.selectedId) ?? null;
  const serverNow = now / 1000 + state.serverOffset;
  const shownAlerts = state.alerts.filter((a) => inRange(a.created_at, state.timeRange, now));
  const active = shownAlerts.filter((a) => isActive(a.status));
  const nodeIds = Object.keys(nodes);
  const nodesOnline = nodeIds.filter((id) => nodes[id].status !== 'offline').length;

  // The drawer keeps showing its last content while it slides closed.
  const lastPanel = useRef<Panel | null>(null);
  if (panel) lastPanel.current = panel;
  const shownPanel = panel ?? lastPanel.current;

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (state.latestIncident) setLiveAt(Date.now());
  }, [state.latestIncident]);

  // Esc closes the innermost thing first: modal (handled by the modal), then the click card, then the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || modal) return;
      if (popup) dispatch({ type: 'close', what: 'popup' });
      else if (panel) dispatch({ type: 'close', what: 'panel' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup, panel, modal, dispatch]);

  const openPanel = useCallback((p: Panel) => dispatch({ type: 'openPanel', panel: p }), [dispatch]);
  const openAlert = useCallback((id: string) => dispatch({ type: 'openPopup', popup: { kind: 'alert', id } }), [dispatch]);
  const openNode = useCallback((id: string) => dispatch({ type: 'openPopup', popup: { kind: 'node', id } }), [dispatch]);

  const act = useCallback(async (alertId: string, action: OperatorActionName) => {
    try {
      await api.action(alertId, action);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, []);

  const openAudit = async () => {
    try {
      setModal({ kind: 'audit', entries: await api.audit() });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  // Drone feeds by alert, so the decision prompt can reopen one after its popup is closed.
  const droneFeeds = useRef<Record<string, { videoUrl: string | null; snapshot: string }>>({});
  const onDroneArrived = useCallback(() => {
    const d = state.drone;
    dispatch({ type: 'droneDone' });
    if (!d) return;
    droneFeeds.current[d.alert_id] = { videoUrl: d.video_url, snapshot: d.snapshot };
    setModal({ kind: 'drone', alertId: d.alert_id, videoUrl: d.video_url, snapshot: d.snapshot });
  }, [state.drone, dispatch]);

  // ---- click card ----
  let popupAt: [number, number] | null = null;
  if (popup?.kind === 'node') {
    const n = zone?.nodes.find((x) => x.id === popup.id);
    if (n) popupAt = [n.lat, n.lon];
  } else if (popup?.kind === 'alert') {
    const a = state.alerts.find((x) => x.alert_id === popup.id);
    if (a) popupAt = [a.lat, a.lon];
  }
  const focusNodeId = popup?.kind === 'node' ? popup.id : panel?.kind === 'node' ? panel.id : null;

  // ---- drawer ----
  let title: React.ReactNode = '';
  let subtitle: React.ReactNode = null;
  let body: React.ReactNode = null;
  if (shownPanel?.kind === 'node') {
    const node = zone?.nodes.find((n) => n.id === shownPanel.id);
    if (node) {
      title = node.name;
      subtitle = `mmWave radar${node.camera ? ` + ${node.camera} thermal` : ''} · ${zone?.name ?? ''}`;
      body = (
        <NodeDetail
          node={node}
          status={nodes[node.id]}
          alerts={shownAlerts}
          logs={state.logs}
          now={now}
          serverNow={serverNow}
          onOpenAlert={(id) => openPanel({ kind: 'alert', id })}
        />
      );
    }
  } else if (shownPanel?.kind === 'alert') {
    const a = state.alerts.find((x) => x.alert_id === shownPanel.id) ?? null;
    if (a) {
      const node = zone?.nodes.find((n) => n.id === a.primary_node);
      title = (
        <>
          <span className="mono">{a.alert_id}</span>
          <span className={`threat-badge ${a.band}`}>{a.band.toUpperCase()} · {a.score}</span>
        </>
      );
      subtitle = (
        <>
          <button className="link-btn" onClick={() => openPanel({ kind: 'node', id: a.primary_node })}>{node?.name ?? a.primary_node}</button>
          {' · '}status {a.status}
        </>
      );
      body = (
        <ThreatPanel
          key={a.alert_id}
          alert={a}
          zone={zone}
          nodes={nodes}
          now={now}
          onAction={(action) => act(a.alert_id, action)}
          onNoteAction={(action) => setModal({ kind: 'note', action, alertId: a.alert_id })}
          onDrone={() => api.drone(a.alert_id).catch((e) => setNotice((e as Error).message))}
          droneInFlight={state.drone?.alert_id === a.alert_id}
          onViewDrone={droneFeeds.current[a.alert_id] && (() => setModal({ kind: 'drone', alertId: a.alert_id, ...droneFeeds.current[a.alert_id] }))}
          onOpenCamera={() => setModal({ kind: 'camera' })}
        />
      );
    }
  } else if (shownPanel?.kind === 'alerts') {
    title = 'Alert queue';
    subtitle = 'Only activity unusual for this zone and hour lands here';
    body = (
      <AlertQueue
        alerts={shownAlerts}
        metrics={state.metrics}
        filter={state.filter}
        selectedId={state.selectedId}
        now={now}
        onFilter={(filter) => dispatch({ type: 'filter', filter })}
        onSelect={(id) => openPanel({ kind: 'alert', id })}
      />
    );
  } else if (shownPanel?.kind === 'sensors') {
    title = 'Sensor health';
    subtitle = `${nodesOnline} of ${nodeIds.length} nodes online · click a row for details`;
    body = <SensorHealth nodes={nodes} serverNow={serverNow} onSelect={(id) => openPanel({ kind: 'node', id })} />;
  } else if (shownPanel?.kind === 'log') {
    title = 'Activity log';
    subtitle = 'Every reading, zone check and operator action, newest first';
    body = <SensorLog logs={state.logs} />;
  } else if (shownPanel?.kind === 'briefing') {
    title = 'Shift briefing';
    subtitle = zone?.name;
    body = <Briefing zone={zone} metrics={state.metrics} alerts={state.alerts} nodes={nodes} />;
  }

  const undecided = (id: string) => {
    const s = state.alerts.find((x) => x.alert_id === id)?.status;
    return s === 'open' || s === 'tracked';
  };

  const live = state.latestIncident;
  const showLive = live && now - liveAt < LIVE_TOAST_MS;
  const fresh = state.freshAlert && now - state.freshAlert.at < FRESH_MS ? state.freshAlert.id : null;

  return (
    <div id="c2-layout">
      <NavBar
        zone={zone}
        now={now}
        activeAlerts={active.length}
        hasHigh={active.some((a) => a.band === 'high')}
        nodesOnline={nodesOnline}
        nodesTotal={nodeIds.length}
        timeRange={state.timeRange}
        onTimeRange={(range) => dispatch({ type: 'timeRange', range })}
        layers={layers}
        onLayers={setLayers}
        baseLayer={baseLayer}
        onBaseLayer={setBaseLayer}
        onRecenter={() => setRecenter((r) => r + 1)}
        onPanel={openPanel}
        onAudit={openAudit}
        onResync={resync}
        demo={<DemoMenu drive={drive} onDrive={setDrive} onNotice={setNotice} />}
      />
      <HeadlineTicker
        zone={zone}
        alerts={shownAlerts}
        nodes={nodes}
        latestIncident={state.latestIncident}
        freshAlertId={fresh}
        now={now}
        onAlert={openAlert}
        onNode={openNode}
      />

      <main className="stage">
        <TacticalMap
          zone={zone}
          nodes={nodes}
          alerts={shownAlerts}
          selectedId={state.selectedId}
          focusNodeId={focusNodeId}
          blips={state.blips}
          drone={state.drone}
          drive={drive}
          layers={layers}
          baseLayer={baseLayer}
          onBaseLayer={setBaseLayer}
          recenter={recenter}
          drawerOpen={!!panel}
          popupAt={popupAt}
          popup={popup && (
            <MapPopupCard
              popup={popup}
              zone={zone}
              nodes={nodes}
              alerts={state.alerts}
              now={now}
              serverNow={serverNow}
              onDetails={() => openPanel(popup)}
              onOpenAlert={(id) => openPanel({ kind: 'alert', id })}
              onAction={act}
              onDismiss={(alertId) => setModal({ kind: 'note', action: 'dismiss', alertId })}
              onClose={() => dispatch({ type: 'close', what: 'popup' })}
            />
          )}
          onNodeClick={openNode}
          onAlertClick={openAlert}
          onMapClick={() => popup && dispatch({ type: 'close', what: 'popup' })}
          onDroneArrived={onDroneArrived}
          onDriveResult={setNotice}
        >
          {showLive && (
            <div className={`live-pipeline ${live.unusual ? 'unusual' : 'normal'}`}>
              <PipelineStrip
                compact
                title={`LIVE · ${live.node_id} · ${live.incident_id}${live.alert_id ? ` → ${live.alert_id}` : ' · logged as normal'}`}
                stages={live.pipeline}
              />
            </div>
          )}
          {notice && <div className="map-notice">{notice}</div>}
        </TacticalMap>

        <StatusPill
          link={state.link}
          lastSync={state.lastSync}
          now={now}
          nodesOnline={nodesOnline}
          nodesTotal={nodeIds.length}
          activeAlerts={active.length}
          onPanel={openPanel}
        />

        <Drawer open={!!panel} title={title} subtitle={subtitle} onClose={() => dispatch({ type: 'close', what: 'panel' })}>
          {body}
        </Drawer>
      </main>

      {modal?.kind === 'camera' && selected && <CameraModal alert={selected} onClose={() => setModal(null)} />}
      {modal?.kind === 'audit' && <AuditModal entries={modal.entries} onClose={() => setModal(null)} />}
      {modal?.kind === 'drone' && (
        <DroneModal
          videoUrl={modal.videoUrl}
          snapshot={modal.snapshot}
          onClose={() => setModal(null)}
          onDecide={undecided(modal.alertId) ? (action) => setModal({ kind: 'note', action, alertId: modal.alertId }) : undefined}
        />
      )}
      {modal?.kind === 'note' && (
        <NoteModal
          action={modal.action}
          alertId={modal.alertId}
          onSubmit={async (note) => { await api.action(modal.alertId, modal.action, note); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
