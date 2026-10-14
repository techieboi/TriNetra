from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel

EventType = Literal["radar", "vision", "heartbeat", "heartbeat_timeout", "das"]
Source = Literal["live", "sim", "replay"]
Band = Literal["high", "review", "log"]
AlertStatus = Literal["open", "confirmed", "dismissed", "escalated", "tracked"]

class Event(BaseModel):
    """One shape for every input. A real mmWave node, the virtual node script and
    the scenario player all send this; only `source` differs."""
    event_id: str
    node_id: str
    zone_id: str = "G2"
    type: EventType
    label: Optional[str] = None
    confidence: float = 1.0
    count: int = 1
    heading_deg: Optional[float] = None
    ts: str
    # Target position. Radar events may omit it; it is derived from the node
    # position plus range_m / bearing_deg.
    lat: Optional[float] = None
    lon: Optional[float] = None
    source: Source = "sim"
    # radar fields
    range_m: Optional[float] = None
    speed_mps: Optional[float] = None      # radial speed; negative = approaching the node
    bearing_deg: Optional[float] = None    # absolute compass bearing from the node
    track_id: Optional[str] = None
    # camera fields
    snapshot: Optional[str] = None
    clip: Optional[str] = None             # name of a prerecorded clip in data/media/clips
    bounding_boxes: Optional[List[List[float]]] = None
    # heartbeat fields
    battery: Optional[int] = None
    signal_dbm: Optional[int] = None

class ReasonItem(BaseModel):
    factor: str
    weight: int

class RadarPoint(BaseModel):
    ts: str
    range_m: float
    speed_mps: float
    bearing_deg: float
    lat: float
    lon: float

class PipelineStage(BaseModel):
    """One step of the PRD flow: radar → camera → detection → zone check → alert."""
    stage: Literal["radar", "camera", "detection", "zone_check", "outcome"]
    status: Literal["done", "pending", "skipped", "yes", "no"]
    detail: str

class Incident(BaseModel):
    incident_id: str
    zone_id: str
    node_ids: List[str]
    events: List[Event]
    start_ts: str
    last_ts: str
    received_at: float                     # server wall clock when the first trigger arrived
    score: int = 0
    ml_score: Optional[int] = None
    band: Band = "log"
    unusual: bool = False
    reasons: List[ReasonItem] = []
    pipeline: List[PipelineStage] = []
    status: AlertStatus = "open"

class OperatorAction(BaseModel):
    action_id: str
    alert_id: str
    action: Literal["confirm", "dismiss", "escalate", "need_info", "drone_check", "track", "pending"]
    note: str
    operator: str = "Op. R. Sharma · Shift B"
    ts: str

class Alert(BaseModel):
    alert_id: str
    incident_id: str
    bop_id: str
    bop_name: str
    distance_km: float
    eta_minutes: float
    score: int
    ml_score: Optional[int] = None
    band: Band
    reasons: List[ReasonItem]
    pipeline: List[PipelineStage] = []
    primary_node: str
    camera: Optional[str] = None
    lat: float
    lon: float
    source: str
    detected_class: Optional[str] = None
    detected_count: int = 1
    heading_deg: Optional[float] = None
    snapshot: Optional[str] = None
    video_url: Optional[str] = None
    detections_url: Optional[str] = None
    bounding_boxes: Optional[List[List[float]]] = None
    radar_track: List[RadarPoint] = []
    confidence_breakdown: Optional[Dict[str, float]] = None
    alert_latency_s: Optional[float] = None
    status: AlertStatus = "open"
    actions: List[OperatorAction] = []
    created_at: str

class AuditEntry(BaseModel):
    audit_id: str
    timestamp: str
    actor: str
    category: str
    summary: str
    details: Dict[str, Any]
