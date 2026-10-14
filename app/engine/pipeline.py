"""
The PRD flow in one place:

    radar trigger → camera wakes → YOLO detects → unusual for this zone? → alert nearest SSB outpost
                                                                        ↘ no: log, keep watching
"""
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from app.schema import Event, Incident, Alert, RadarPoint
from app.zone import zone_mgr
from app.db import store, IST
from app.engine.fusion import fusion_engine
from app.engine.context import context_evaluator
from app.engine.scoring import scoring_engine
from app.engine.routing import routing_engine
from app.ml.vision_adapter import vision_adapter

MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "media"
FALLBACK_SNAPSHOT = "/media/snapshots/thermal_intrusion_group.jpg"

def prepare_event(event: Event) -> Event:
    """Normalise node ids and derive the target position for radar readings."""
    event.node_id = zone_mgr.normalize_node_id(event.node_id)
    node = zone_mgr.get_node(event.node_id)
    if event.lat is None or event.lon is None:
        if node and event.range_m is not None and event.bearing_deg is not None:
            event.lat, event.lon = zone_mgr.project(node["lat"], node["lon"], event.range_m, event.bearing_deg)
        elif node:
            event.lat, event.lon = node["lat"], node["lon"]
        else:
            center = zone_mgr.get_zone_data()["center"]
            event.lat, event.lon = center["lat"], center["lon"]
    return event

def clip_urls(clip: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """URLs for a prerecorded clip and its optional per-frame detections, if the files exist."""
    if not clip:
        return None, None
    video = MEDIA_DIR / "clips" / f"{clip}.mp4"
    dets = MEDIA_DIR / "clips" / f"{clip}.json"
    return (f"/media/clips/{clip}.mp4" if video.exists() else None,
            f"/media/clips/{clip}.json" if dets.exists() else None)

def process(event: Event, received_at: Optional[float] = None,
            created_at: Optional[str] = None, measure_latency: bool = True) -> Tuple[Incident, Optional[Alert], bool]:
    """Run one sensor event through the pipeline. Returns (incident, alert or None, alert_is_new)."""
    received_at = received_at if received_at is not None else time.time()
    inc = fusion_engine.process_event(event, received_at)
    ctx = context_evaluator.evaluate(inc)
    bop, dist_km, eta = routing_engine.route_point(ctx.primary_lat, ctx.primary_lon)
    result = scoring_engine.score(inc, ctx, bop["name"])

    inc.score, inc.ml_score, inc.band = result.score, result.ml_score, result.band  # type: ignore[assignment]
    inc.unusual, inc.reasons, inc.pipeline = result.unusual, result.reasons, result.pipeline
    store.save_incident(inc)

    alert_id = f"ALT-{inc.incident_id.replace('INC-', '')}"
    existing = store.alerts.get(alert_id)
    if not result.unusual and not existing:
        return inc, None, False

    detected_class = None
    if ctx.target_confirmed and ctx.vision_label:
        detected_class = f"{ctx.vision_label.capitalize()} ×{ctx.max_count}"

    confidence = {}
    if ctx.radar:
        confidence["Radar"] = ctx.radar.confidence
    if ctx.vision_confidence is not None:
        confidence["Thermal"] = round(ctx.vision_confidence, 2)

    snapshot = ctx.latest_snapshot
    video_url, detections_url = clip_urls(ctx.latest_clip)
    boxes = ctx.bounding_boxes
    if boxes is None and ctx.target_confirmed:
        boxes = vision_adapter.predict(snapshot or FALLBACK_SNAPSHOT, hint_class=ctx.vision_label,
                                       hint_count=ctx.max_count).bounding_boxes

    radar_track = [
        RadarPoint(ts=e.ts, range_m=e.range_m or 0.0, speed_mps=e.speed_mps or 0.0,
                   bearing_deg=e.bearing_deg or 0.0, lat=e.lat or 0.0, lon=e.lon or 0.0)
        for e in inc.events if e.type == "radar"
    ]

    latency = None
    if existing:
        latency = existing.alert_latency_s
    elif measure_latency:
        latency = round(time.time() - inc.received_at, 2)

    alert = Alert(
        alert_id=alert_id,
        incident_id=inc.incident_id,
        bop_id=bop["id"],
        bop_name=bop["name"],
        distance_km=dist_km,
        eta_minutes=eta,
        score=result.score,
        ml_score=result.ml_score,
        band=result.band,  # type: ignore[arg-type]
        reasons=result.reasons,
        pipeline=result.pipeline,
        primary_node=ctx.primary_node,
        camera=ctx.camera,
        lat=ctx.primary_lat,
        lon=ctx.primary_lon,
        source=event.source,
        detected_class=detected_class,
        detected_count=ctx.max_count,
        heading_deg=ctx.latest_heading,
        snapshot=snapshot,
        video_url=video_url,
        detections_url=detections_url,
        bounding_boxes=boxes,
        radar_track=radar_track,
        confidence_breakdown=confidence or None,
        alert_latency_s=latency,
        status=existing.status if existing else "open",
        actions=existing.actions if existing else [],
        created_at=existing.created_at if existing else (created_at or datetime.now(IST).isoformat()),
    )
    store.upsert_alert(alert, is_new=existing is None)
    return inc, alert, existing is None
