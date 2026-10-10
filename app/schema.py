from datetime import datetime
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class Event(BaseModel):
    event_id: str
    node_id: str
    zone_id: str = "Z1"
    type: Literal["vibration", "pir", "vision", "heartbeat", "heartbeat_timeout"]
    label: Optional[str] = None
    confidence: float = 1.0
    count: int = 1
    heading_deg: Optional[float] = None
    ts: str
    lat: float
    lon: float
    source: Literal["live", "sim", "replay"] = "sim"
    snapshot: Optional[str] = None

class ReasonItem(BaseModel):
    factor: str
    weight: int

class Incident(BaseModel):
    incident_id: str
    zone_id: str
    node_ids: List[str]
    events: List[Event]
    start_ts: str
    last_ts: str
    score: int = 0
    band: Literal["high", "review", "log"] = "log"
    reasons: List[ReasonItem] = []
    status: Literal["open", "confirmed", "dismissed", "escalated"] = "open"

class OperatorAction(BaseModel):
    action_id: str
    alert_id: str
    action: Literal["confirm", "dismiss", "escalate", "need_info", "drone_check"]
    note: str
    operator: str = "Duty Commander // BOP-1"
    ts: str

class Alert(BaseModel):
    alert_id: str
    incident_id: str
    bop_id: str
    bop_name: str
    distance_km: float
    eta_minutes: float
    score: int
    band: Literal["high", "review", "log"]
    reasons: List[ReasonItem]
    primary_node: str
    lat: float
    lon: float
    source: str
    detected_class: Optional[str] = None
    detected_count: int = 1
    heading_deg: Optional[float] = None
    snapshot: Optional[str] = None
    status: Literal["open", "confirmed", "dismissed", "escalated"] = "open"
    actions: List[OperatorAction] = []
    created_at: str

class AuditEntry(BaseModel):
    audit_id: str
    timestamp: str
    actor: str
    category: str
    summary: str
    details: Dict[str, Any]
