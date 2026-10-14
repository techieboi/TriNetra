import { useState } from 'react';
import type { Alert, NodeStatus, Zone } from '../types';
import type { OperatorActionName } from '../lib/api';
import { heading, istClock, pct, relativeTime, targetLabel } from '../lib/format';
import { CameraFeed } from './CameraFeed';
import { PipelineStrip } from './PipelineStrip';
import { RadarScope } from './RadarScope';
import { Popover } from './Popover';

interface Props {
  alert: Alert | null;
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  now: number;
  onAction: (action: OperatorActionName) => void;
  onNoteAction: (action: 'dismiss' | 'escalate') => void;
  onDrone: () => void;
  /** True while DR-02 is still flying to this alert. */
  droneInFlight: boolean;
  /** Reopens the drone feed; absent when there is no feed to show (e.g. after a reload). */
  onViewDrone?: () => void;
  onOpenCamera: () => void;
}

const ML_OUTLIER = 65;
const DECIDED = ['confirmed', 'dismissed', 'escalated'];
const DECISION: Record<string, string> = { confirmed: 'confirm', dismissed: 'dismiss', escalated: 'escalate' };
const OUTCOME_TEXT: Record<string, string> = {
  confirmed: 'Confirmed as a threat · respond per SOP',
  dismissed: 'Dismissed as normal activity',
  escalated: 'Escalated to sector command',
};

type Tab = 'summary' | 'evidence' | 'why';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'evidence', label: 'Camera & radar' },
  { key: 'why', label: 'Why this score' },
];

/** Full alert details, split into tabs so the drawer never becomes one long wall. Render with key={alert_id}. */
export function ThreatPanel({ alert, zone, nodes, now, onAction, onNoteAction, onDrone, droneInFlight, onViewDrone, onOpenCamera }: Props) {
  const [tab, setTab] = useState<Tab>('summary');
  if (!alert) {
    return (
      <div className="c2-panel panel-threat-c2 empty">
        <div className="threat-empty">
          <div className="threat-empty-title">No alert selected</div>
          <div>Only activity that is unusual for this zone reaches the queue. Run a scenario from the Demo menu.</div>
        </div>
      </div>
    );
  }

  const node = zone?.nodes.find((n) => n.id === alert.primary_node);
  const nodeState = nodes[alert.primary_node];
  const camState = nodeState?.status === 'offline' ? 'offline' : nodeState?.camera_state;
  const droneSent = alert.actions.some((a) => a.action === 'drone_check');
  // Escalated is still live on the map, but the operator's decision is made.
  const outcome = DECIDED.includes(alert.status) ? [...alert.actions].reverse().find((x) => x.action === DECISION[alert.status]) ?? alert.actions[alert.actions.length - 1] ?? { operator: 'Operator', ts: '', note: '' } : null;
  const ml = alert.ml_score;
  const created = new Date(alert.created_at);
  const droneArrived = droneSent && !droneInFlight;

  // Whatever the main buttons don't cover. Once the drone is up, Escalate is a main button and Confirm moves here.
  const moreMenu = (
    <Popover
      trigger={(open, toggle) => (
        <button className={`btn btn-more ${open ? 'on' : ''}`} onClick={toggle} aria-label="More actions">⋯</button>
      )}
    >
      {(close) => (
        <div className="menu">
          {droneArrived ? (
            <button className="menu-item" onClick={() => { onAction('confirm'); close(); }}>
              <span className="mi-label mi-stack"><span>Confirm threat</span><span className="mi-sub">Respond per SOP</span></span>
            </button>
          ) : (
            <button className="menu-item" onClick={() => { onNoteAction('escalate'); close(); }}>
              <span className="mi-label mi-stack"><span>Escalate</span><span className="mi-sub">Hand to sector command · note required</span></span>
            </button>
          )}
          {alert.status === 'tracked' ? (
            <button className="menu-item" onClick={() => { onAction('need_info'); close(); }}>
              <span className="mi-label mi-stack"><span>Stop tracking</span><span className="mi-sub">Back to the review queue</span></span>
            </button>
          ) : (
            <button className="menu-item" onClick={() => { onAction('track'); close(); }}>
              <span className="mi-label mi-stack"><span>Keep tracking</span><span className="mi-sub">Leave open and watch for more</span></span>
            </button>
          )}
        </div>
      )}
    </Popover>
  );

  return (
    <div className="c2-panel panel-threat-c2">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div className="threat-meta-grid">
            <div className="meta-col">
              <span className="meta-label">Target</span>
              <span className="meta-val">{targetLabel(alert.detected_class, alert.detected_count)}</span>
            </div>
            <div className="meta-col">
              <span className="meta-label">First seen</span>
              <span className="meta-val">
                {relativeTime(alert.created_at, now)}{' '}
                <span className="meta-time-sub">{Number.isNaN(created.getTime()) ? '' : istClock(created)}</span>
              </span>
            </div>
            <div className="meta-col">
              <span className="meta-label">Heading</span>
              <span className="meta-val">{heading(alert.heading_deg)}</span>
            </div>
            <div className="meta-col">
              <span className="meta-label">Node / camera</span>
              <span className="meta-val">{alert.primary_node}{alert.camera ? ` · ${alert.camera}` : ''}</span>
            </div>
            <div className="meta-col">
              <span className="meta-label">To {alert.bop_id}</span>
              <span className="meta-val">{alert.distance_km} km</span>
            </div>
            <div className="meta-col">
              <span className="meta-label">QRT ETA</span>
              <span className="meta-val">{Math.round(alert.eta_minutes)} min</span>
            </div>
          </div>

          <PipelineStrip stages={alert.pipeline} />

          {outcome ? (
            <div className={`outcome-line ${alert.status}`}>
              <span className="outcome-title">{OUTCOME_TEXT[alert.status]}</span>
              <span className="outcome-meta">
                {outcome.operator} · {Number.isNaN(Date.parse(outcome.ts)) ? '' : istClock(new Date(outcome.ts))}
                {droneSent ? ' · drone checked' : ''}
              </span>
              {outcome.note && <span className="outcome-note">“{outcome.note}”</span>}
            </div>
          ) : droneArrived ? (
            <div className="decide-prompt">
              <div className="decide-text">
                <span className="decide-title">Drone is on station · what did it see?</span>
                <span className="decide-sub">
                  Decide now so {alert.bop_id} knows whether to move.
                  {onViewDrone && <> <button className="link-btn" onClick={onViewDrone}>View drone feed</button></>}
                </span>
              </div>
              <div className="decide-btns">
                <button className="btn btn-escalate" onClick={() => onNoteAction('escalate')}>Escalate</button>
                <button className="btn btn-dismiss" onClick={() => onNoteAction('dismiss')}>Dismiss as normal</button>
                {moreMenu}
              </div>
            </div>
          ) : (
            <div className="action-row">
              <button className="btn btn-confirm" onClick={() => onAction('confirm')}>Confirm threat</button>
              <button className="btn" onClick={() => onNoteAction('dismiss')}>Dismiss</button>
              <button
                className={`btn ${droneInFlight ? 'in-flight' : ''}`}
                disabled={droneSent}
                onClick={onDrone}
                title={`Send DR-02 from ${alert.bop_id} for a visual check (simulated flight)`}
              >
                {droneInFlight ? 'Drone en route…' : 'Send drone'}
              </button>
              {moreMenu}
            </div>
          )}
        </>
      )}

      {tab === 'evidence' && (
        <>
          <div className="cam-feed-container">
            <div className="cam-feed-header">
              <div className="cam-title-left">
                <span className="cam-id-txt">{alert.camera ?? 'Camera'} · Thermal</span>
                <span className="yolo-tag">YOLO · HIT-UAV + LLVIP</span>
              </div>
              <div className="cam-header-right">
                {alert.alert_latency_s != null && (
                  <span className="cam-viewed-pill" title="Radar trigger to alert on dashboard">Alert in {alert.alert_latency_s.toFixed(1)} s</span>
                )}
              </div>
            </div>
            <CameraFeed
              videoUrl={alert.video_url}
              detectionsUrl={alert.detections_url}
              snapshot={alert.snapshot}
              boxes={alert.bounding_boxes}
              label={alert.detected_class}
              cameraState={camState}
              onClick={onOpenCamera}
            />
          </div>
          <RadarScope track={alert.radar_track} radar={node?.radar} nodeId={alert.primary_node} />
        </>
      )}

      {tab === 'why' && (
        <div className="why-score-card">
          <div className="why-score-title">Zone check · what moved the score</div>
          <div className="why-score-rows">
            {alert.reasons.map((r) => (
              <div className="score-row" key={r.factor}>
                <span>{r.factor}</span>
                <span className="score-val" style={{ color: r.weight < 0 ? '#4ade80' : '#60a5fa' }}>
                  {r.weight > 0 ? '+' : ''}{r.weight}
                </span>
              </div>
            ))}
          </div>
          <div className="score-divider" />
          <div className="score-total-row">
            <span>Total</span>
            <span className="score-total-val">{alert.score}</span>
          </div>
          {alert.confidence_breakdown && (
            <div className="sensor-confidence-line">
              {Object.entries(alert.confidence_breakdown).map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}
            </div>
          )}
          {ml != null && (
            <div className="ml-anomaly-line" title="How rare this activity is for this place and hour, from the zone's baseline routine">
              <span>Zone baseline anomaly:</span>
              <span className="ml-score-val">{ml} / 100</span>
              <span className={`ml-outlier-tag ${ml >= ML_OUTLIER ? 'outlier' : 'normal'}`}>{ml >= ML_OUTLIER ? 'OUTLIER' : 'NORMAL'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
