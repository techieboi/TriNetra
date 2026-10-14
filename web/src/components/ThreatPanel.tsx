import type { Alert, NodeStatus, Zone } from '../types';
import type { OperatorActionName } from '../lib/api';
import { heading, isActive, istClock, pct, relativeTime } from '../lib/format';
import { CameraFeed } from './CameraFeed';
import { PipelineStrip } from './PipelineStrip';
import { RadarScope } from './RadarScope';

interface Props {
  alert: Alert | null;
  zone: Zone | null;
  nodes: Record<string, NodeStatus>;
  now: number;
  onAction: (action: OperatorActionName) => void;
  onNoteAction: (action: 'dismiss' | 'escalate') => void;
  onDrone: () => void;
  onOpenCamera: () => void;
}

const ML_OUTLIER = 65;

export function ThreatPanel({ alert, zone, nodes, now, onAction, onNoteAction, onDrone, onOpenCamera }: Props) {
  if (!alert) {
    return (
      <div className="c2-panel panel-threat-c2 empty">
        <div className="threat-empty">
          <div className="threat-empty-title">No alert selected</div>
          <div>Only activity that is unusual for this zone reaches the queue. Run a scenario from Demo controls.</div>
        </div>
      </div>
    );
  }

  const node = zone?.nodes.find((n) => n.id === alert.primary_node);
  const nodeState = nodes[alert.primary_node];
  const camState = nodeState?.status === 'offline' ? 'offline' : nodeState?.camera_state;
  const droneSent = alert.actions.some((a) => a.action === 'drone_check');
  const closed = !isActive(alert.status);
  const ml = alert.ml_score;
  const created = new Date(alert.created_at);

  return (
    <div className="c2-panel panel-threat-c2">
      <div className="threat-header">
        <div className="threat-id-row">
          <span className="threat-id">{alert.alert_id}</span>
          <span className={`threat-badge ${alert.band}`}>{alert.band.toUpperCase()} · {alert.score}</span>
        </div>
        <div className="threat-subtitle">
          {zone?.name ?? 'Sector'} · {node?.name ?? alert.primary_node} · status {alert.status.toUpperCase()}
        </div>
      </div>

      <PipelineStrip stages={alert.pipeline} />

      <div className="threat-meta-grid">
        <div className="meta-col">
          <span className="meta-label">Target</span>
          <span className="meta-val">{alert.detected_class ?? 'Unconfirmed'}</span>
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
          <span className="meta-label">Distance to {alert.bop_id}</span>
          <span className="meta-val">{alert.distance_km} km</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">QRT ETA</span>
          <span className="meta-val">{Math.round(alert.eta_minutes)} min</span>
        </div>
      </div>

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

      <div className="why-score-card">
        <div className="why-score-title">WHY THIS SCORE · ZONE CHECK</div>
        <div className="why-score-rows">
          {alert.reasons.map((r) => (
            <div className="score-row" key={r.factor}>
              <span>{r.factor}</span>
              <span className="score-val" style={{ color: r.weight < 0 ? '#4ade80' : '#38bdf8' }}>
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

      <div className="threat-actions-container">
        <div className="decision-cards-row">
          <button className="decision-card" onClick={onOpenCamera}>
            <div className="card-icon-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              <span className="card-title">View clip</span>
            </div>
            <div className="card-subtext">Full-size recorded feed</div>
          </button>
          <button className={`decision-card ${alert.status === 'tracked' ? 'pending' : ''}`} disabled={closed} onClick={() => onAction('track')}>
            <div className="card-icon-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></svg>
              <span className="card-title">Track</span>
            </div>
            <div className="card-subtext">Keep under watch</div>
          </button>
          <button className="decision-card" disabled={closed} onClick={() => onAction('need_info')}>
            <div className="card-icon-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span className="card-title amber-text">Need info</span>
            </div>
            <div className="card-subtext">Back to review</div>
          </button>
        </div>

        <div className="decision-cards-row decision-secondary-row">
          <button className="decision-card action-confirm" disabled={closed} onClick={() => onAction('confirm')}>
            <div className="card-icon-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              <span className="card-title">Confirm</span>
            </div>
            <div className="card-subtext">Threat, respond per SOP</div>
          </button>
          <button className="decision-card action-dismiss" disabled={closed} onClick={() => onNoteAction('dismiss')}>
            <div className="card-icon-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              <span className="card-title">Dismiss</span>
            </div>
            <div className="card-subtext">Close as normal · note</div>
          </button>
          <button className="decision-card action-escalate" disabled={closed} onClick={() => onNoteAction('escalate')}>
            <div className="card-icon-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              <span className="card-title">Escalate</span>
            </div>
            <div className="card-subtext">To sector command · note</div>
          </button>
        </div>

        <button className="dispatch-primary-btn" disabled={droneSent || closed} onClick={onDrone}>
          <div className="dispatch-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><path d="M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>
          </div>
          <div className="dispatch-text-box">
            <span className="dispatch-headline">{droneSent ? 'Drone sent ✓' : 'Send drone for visual check'}</span>
            <span className="dispatch-footnote">Operator decision · DR-02 from {alert.bop_id} · simulated flight</span>
          </div>
        </button>
      </div>
    </div>
  );
}
