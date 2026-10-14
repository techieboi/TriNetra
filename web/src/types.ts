export type Band = 'high' | 'review' | 'log';
export type AlertStatus = 'open' | 'confirmed' | 'dismissed' | 'escalated' | 'tracked';
export type CameraState = 'standby' | 'waking' | 'recording' | 'offline';
export type LatLon = [number, number];

export interface RadarConfig {
  model: string;
  facing_deg: number;
  fov_deg: number;
  range_m: number;
  demo_range_m: number;
}

export interface ZoneNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  camera?: string;
  radar?: RadarConfig;
  sensors: string[];
  source_type: string;
}

export interface Geofence {
  id: string;
  name: string;
  kind: 'forest_track' | 'restricted' | 'crossing_route';
  active_hours: string;
  risk_modifier: number;
  color: string;
  polygon: LatLon[];
}

export interface Bop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  contact: string;
}

export interface Zone {
  zone_id: string;
  name: string;
  description: string;
  bounds?: { min_lat: number; max_lat: number; min_lon: number; max_lon: number };
  center: { lat: number; lon: number; zoom: number };
  international_border: LatLon[];
  nodes: ZoneNode[];
  bops: Bop[];
  geofences: Geofence[];
  das_fiber?: { id: string; name: string; path: LatLon[]; deployment_only: boolean };
}

export interface NodeStatus {
  name: string;
  camera?: string;
  status: 'online' | 'warning' | 'offline';
  battery: number;
  signal_dbm: number;
  last_seen: number;
  camera_state: CameraState;
  source: string;
}

export interface ReasonItem {
  factor: string;
  weight: number;
}

export interface PipelineStage {
  stage: 'radar' | 'camera' | 'detection' | 'zone_check' | 'outcome';
  status: 'done' | 'pending' | 'skipped' | 'yes' | 'no';
  detail: string;
}

export interface RadarPoint {
  ts: string;
  range_m: number;
  speed_mps: number;
  bearing_deg: number;
  lat: number;
  lon: number;
}

export interface OperatorAction {
  action_id: string;
  action: string;
  note: string;
  operator: string;
  ts: string;
}

export interface Alert {
  alert_id: string;
  incident_id: string;
  bop_id: string;
  bop_name: string;
  distance_km: number;
  eta_minutes: number;
  score: number;
  ml_score: number | null;
  band: Band;
  reasons: ReasonItem[];
  pipeline: PipelineStage[];
  primary_node: string;
  camera: string | null;
  lat: number;
  lon: number;
  source: string;
  detected_class: string | null;
  detected_count: number;
  heading_deg: number | null;
  snapshot: string | null;
  video_url: string | null;
  detections_url: string | null;
  bounding_boxes: number[][] | null;
  radar_track: RadarPoint[];
  confidence_breakdown: Record<string, number> | null;
  alert_latency_s: number | null;
  status: AlertStatus;
  actions: OperatorAction[];
  created_at: string;
}

export interface LogRow {
  time: string;
  source: string;
  text: string;
  type: string;
}

export interface Metrics {
  alerts_raised: number;
  incidents_logged_normal: number;
  decided: number;
  dismissed: number;
  false_alarm_rate: number | null;
  alert_time_s_avg: number | null;
  alert_time_s_median: number | null;
}

export interface IncidentUpdate {
  incident_id: string;
  score: number;
  band: Band;
  unusual: boolean;
  pipeline: PipelineStage[];
  node_id: string;
  alert_id: string | null;
}

export interface RadarEvent {
  node_id: string;
  lat: number;
  lon: number;
  range_m: number;
  speed_mps: number;
  bearing_deg: number;
  ts: string;
}

export interface DroneDispatch {
  alert_id: string;
  bop_lat: number;
  bop_lon: number;
  target_lat: number;
  target_lon: number;
  eta_seconds: number;
  video_url: string | null;
  snapshot: string;
}

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  actor: string;
  category: string;
  summary: string;
}

export interface ScenarioInfo {
  name: string;
  description: string;
  expected: string;
}
