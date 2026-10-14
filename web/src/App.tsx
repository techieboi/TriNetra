import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from './types';
import { useLiveState } from './lib/store';
import { useNow } from './lib/useNow';
import { api, type OperatorActionName } from './lib/api';
import { Header } from './components/Header';
import { AlertQueue } from './components/AlertQueue';
import { SensorHealth } from './components/SensorHealth';
import { TacticalMap, type DriveSettings } from './components/TacticalMap';
import { SensorLog } from './components/SensorLog';
import { ThreatPanel } from './components/ThreatPanel';
import { PipelineStrip } from './components/PipelineStrip';
import { DemoBar } from './components/DemoBar';
import { AuditModal, CameraModal, DroneModal, NoteModal } from './components/Modals';

type ModalState =
  | { kind: 'camera' }
  | { kind: 'audit'; entries: AuditEntry[] }
  | { kind: 'note'; action: 'dismiss' | 'escalate'; alertId: string }
  | { kind: 'drone'; videoUrl: string | null; snapshot: string }
  | null;

export default function App() {
  const [state, dispatch] = useLiveState();
  const now = useNow(1000);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drive, setDrive] = useState<DriveSettings>({ enabled: false, kind: 'person', count: 2, clock: 'night' });

  const selected = state.alerts.find((a) => a.alert_id === state.selectedId) ?? null;
  const serverNow = now / 1000 + state.serverOffset;

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const act = useCallback(async (action: OperatorActionName) => {
    if (!selected) return;
    try {
      await api.action(selected.alert_id, action);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, [selected]);

  const openAudit = async () => setModal({ kind: 'audit', entries: await api.audit() });

  const onDroneArrived = useCallback(() => {
    const d = state.drone;
    dispatch({ type: 'droneDone' });
    if (d) setModal({ kind: 'drone', videoUrl: d.video_url, snapshot: d.snapshot });
  }, [state.drone, dispatch]);

  const live = state.latestIncident;

  return (
    <div id="c2-layout">
      <Header zone={state.zone} link={state.link} lastSync={state.lastSync} metrics={state.metrics} now={now} onAudit={openAudit} />

      <div className="c2-workspace">
        <aside className="col-left">
          <AlertQueue
            alerts={state.alerts}
            filter={state.filter}
            selectedId={state.selectedId}
            now={now}
            onFilter={(filter) => dispatch({ type: 'filter', filter })}
            onSelect={(id) => dispatch({ type: 'select', id })}
          />
          <SensorHealth nodes={state.nodes} serverNow={serverNow} />
        </aside>

        <main className="col-center">
          <TacticalMap
            zone={state.zone}
            nodes={state.nodes}
            alerts={state.alerts}
            selectedId={state.selectedId}
            blips={state.blips}
            drone={state.drone}
            drive={drive}
            onSelect={(id) => dispatch({ type: 'select', id })}
            onDroneArrived={onDroneArrived}
            onDriveResult={setNotice}
          >
            {live && (
              <div className={`live-pipeline ${live.unusual ? 'unusual' : 'normal'}`}>
                <PipelineStrip
                  compact
                  title={`LIVE · ${live.node_id} · ${live.incident_id}${live.alert_id ? ` → ${live.alert_id}` : ''}`}
                  stages={live.pipeline}
                />
              </div>
            )}
            {notice && <div className="map-notice">{notice}</div>}
          </TacticalMap>
          <SensorLog logs={state.logs} />
        </main>

        <aside className="col-right">
          <ThreatPanel
            alert={selected}
            zone={state.zone}
            nodes={state.nodes}
            now={now}
            onAction={act}
            onNoteAction={(action) => selected && setModal({ kind: 'note', action, alertId: selected.alert_id })}
            onDrone={() => selected && api.drone(selected.alert_id).catch((e) => setNotice((e as Error).message))}
            onOpenCamera={() => setModal({ kind: 'camera' })}
          />
        </aside>
      </div>

      <DemoBar drive={drive} onDrive={setDrive} onNotice={setNotice} />

      {modal?.kind === 'camera' && selected && <CameraModal alert={selected} onClose={() => setModal(null)} />}
      {modal?.kind === 'audit' && <AuditModal entries={modal.entries} onClose={() => setModal(null)} />}
      {modal?.kind === 'drone' && <DroneModal videoUrl={modal.videoUrl} snapshot={modal.snapshot} onClose={() => setModal(null)} />}
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
