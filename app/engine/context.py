from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.schema import Incident, Event
from app.zone import zone_mgr
from app.ml.radar_adapter import radar_adapter
from app.ml.base import RadarTrackResult

# Classes a thermal YOLO fine-tuned on HIT-UAV + LLVIP can confirm as a target.
TARGET_CLASSES = {"person", "car", "bicycle", "motorcycle", "othervehicle", "other_vehicle", "truck", "van", "boat"}
VEHICLE_CLASSES = TARGET_CLASSES - {"person"}
ANIMAL_CLASSES = {"cow", "dog", "horse", "sheep", "elephant", "bird", "animal", "livestock"}

class IncidentContext(BaseModel):
    hour: int
    is_night: bool
    expected_activity: float
    off_route: bool
    in_restricted: bool
    on_crossing_in_hours: bool
    towards_interior: bool
    radar: Optional[RadarTrackResult] = None
    camera_checked: bool
    target_confirmed: bool
    vision_label: Optional[str] = None
    vision_confidence: Optional[float] = None
    max_count: int
    has_motor_vehicle: bool
    primary_lat: float
    primary_lon: float
    primary_node: str
    camera: Optional[str] = None
    latest_snapshot: Optional[str] = None
    latest_clip: Optional[str] = None
    latest_heading: Optional[float] = None
    bounding_boxes: Optional[List[List[float]]] = None

def event_hour(ev: Event) -> int:
    try:
        return datetime.fromisoformat(ev.ts.replace("Z", "+00:00")).hour
    except Exception:
        return datetime.now().hour

class ContextEvaluator:
    def evaluate(self, inc: Incident) -> IncidentContext:
        radar_events = [e for e in inc.events if e.type == "radar"]
        vision_events = [e for e in inc.events if e.type == "vision"]
        latest = inc.events[-1]
        # Locate the target by the camera if it has looked, else by the radar
        anchor = vision_events[-1] if vision_events else (radar_events[-1] if radar_events else latest)
        lat, lon = anchor.lat, anchor.lon
        hour = event_hour(latest)

        node = zone_mgr.get_node(anchor.node_id) or {}
        in_market = zone_mgr.is_in_market_crossing(lat, lon)
        in_restricted = zone_mgr.is_in_restricted(lat, lon)
        expected = zone_mgr.expected_activity(lat, lon, hour)

        radar = None
        if radar_events:
            radar = radar_adapter.summarize(
                [e.range_m or 0.0 for e in radar_events],
                [e.speed_mps or 0.0 for e in radar_events],
            )

        vision_label = None
        vision_conf = None
        heading = None
        boxes = None
        snapshot = None
        clip = None
        max_count = 0
        has_vehicle = False
        confirmed = False
        for e in vision_events:
            label = (e.label or "none").lower()
            vision_label, vision_conf = label, e.confidence
            if label in TARGET_CLASSES:
                confirmed = True
                max_count = max(max_count, e.count)
                if label in VEHICLE_CLASSES:
                    has_vehicle = True
            if e.heading_deg is not None:
                heading = e.heading_deg
            if e.bounding_boxes:
                boxes = e.bounding_boxes
            snapshot = e.snapshot or snapshot
            clip = e.clip or clip
        # Report the most significant thing the camera saw, not just the last frame
        primary_label = next((e.label.lower() for e in vision_events
                              if e.label and e.label.lower() == "person"), None)
        if confirmed and primary_label:
            vision_label = primary_label
        if confirmed:
            vision_conf = max(e.confidence for e in vision_events if (e.label or "").lower() == vision_label)

        return IncidentContext(
            hour=hour,
            is_night=(hour >= 20 or hour < 5),
            expected_activity=expected,
            off_route=not in_market,
            in_restricted=in_restricted,
            on_crossing_in_hours=in_market and (8 <= hour < 18),
            towards_interior=heading is not None and 130 <= heading <= 230,
            radar=radar,
            camera_checked=bool(vision_events),
            target_confirmed=confirmed,
            vision_label=vision_label,
            vision_confidence=vision_conf,
            max_count=max(max_count, 1),
            has_motor_vehicle=has_vehicle,
            primary_lat=lat,
            primary_lon=lon,
            primary_node=node.get("id", zone_mgr.normalize_node_id(anchor.node_id)),
            camera=node.get("camera"),
            latest_snapshot=snapshot,
            latest_clip=clip,
            latest_heading=heading,
            bounding_boxes=boxes,
        )

context_evaluator = ContextEvaluator()
