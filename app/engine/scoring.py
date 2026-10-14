from typing import Tuple, List, Dict, Optional
from pydantic import BaseModel
from app.schema import Incident, ReasonItem, PipelineStage
from app.engine.context import IncidentContext, ANIMAL_CLASSES
from app.ml.anomaly_adapter import anomaly_adapter

# Zone-check factors. Every alert lists the ones that applied; the score is their sum.
WEIGHTS = {
    "night_quiet": 30,
    "off_route": 25,
    "restricted": 15,
    "camera_confirmed": 20,
    "group": 10,
    "towards_interior": 10,
    "radar_closing": 5,
    "market_hours": -30,
}
QUIET_ACTIVITY_LEVEL = 0.1      # baseline at or below this counts as a "quiet" place/hour
RADAR_ONLY_CAP = 39             # radar alone can never alert: held below the review band
CAMERA_NEGATIVE_CAP = 20        # camera looked and saw no person/vehicle: logged
REVIEW_THRESHOLD = 40
HIGH_THRESHOLD = 70

class ZoneCheckResult(BaseModel):
    score: int
    band: str
    unusual: bool
    reasons: List[ReasonItem]
    pipeline: List[PipelineStage]
    ml_score: int

class ScoringEngine:
    def __init__(self):
        # Operator feedback: (node, 3-hour band, class) -> learned discount
        self.dismissed_suppressions: Dict[Tuple[str, int, str], int] = {}

    def register_dismissal(self, node: str, hour: int, target_class: Optional[str] = None):
        key = (node, hour // 3, (target_class or "unknown").lower())
        self.dismissed_suppressions[key] = self.dismissed_suppressions.get(key, 0) + 10

    def clear_feedback(self):
        self.dismissed_suppressions.clear()

    def score(self, inc: Incident, ctx: IncidentContext, bop_name: str) -> ZoneCheckResult:
        reasons: List[ReasonItem] = []

        def add(factor: str, weight: int):
            reasons.append(ReasonItem(factor=factor, weight=weight))

        # 1. Compare with the zone's normal routine
        if ctx.is_night and ctx.expected_activity <= QUIET_ACTIVITY_LEVEL:
            add("Night-time, low-traffic sector", WEIGHTS["night_quiet"])
        if ctx.off_route:
            add("Off authorised crossing route", WEIGHTS["off_route"])
        if ctx.in_restricted:
            add("Inside restricted zero-line geofence", WEIGHTS["restricted"])
        if ctx.on_crossing_in_hours:
            add("Authorised crossing during market hours", WEIGHTS["market_hours"])

        # 2. What the sensors saw
        if ctx.target_confirmed:
            conf = f" ({ctx.vision_confidence:.0%})" if ctx.vision_confidence else ""
            add(f"Thermal camera confirms {ctx.vision_label}{conf}", WEIGHTS["camera_confirmed"])
            if ctx.max_count >= 3:
                add(f"Group of {ctx.max_count}", WEIGHTS["group"])
            if ctx.towards_interior:
                add("Heading into territory", WEIGHTS["towards_interior"])
        if ctx.radar and ctx.radar.approaching and ctx.radar.motion_class != "static":
            add(f"Radar: target closing in ({abs(ctx.radar.speed_mps):.1f} m/s)", WEIGHTS["radar_closing"])

        # 3. Learned suppression from operator dismissals
        cls = (ctx.vision_label or "unknown").lower()
        discount = self.dismissed_suppressions.get((ctx.primary_node, ctx.hour // 3, cls), 0)
        if discount:
            add("Operator dismissed similar pattern before", -min(30, discount))

        # 4. Gate: only a camera-confirmed person or vehicle can raise an alert
        raw = sum(r.weight for r in reasons)
        if not ctx.camera_checked and raw > RADAR_ONLY_CAP:
            add("Radar only, awaiting camera check", RADAR_ONLY_CAP - raw)
        elif ctx.camera_checked and not ctx.target_confirmed and raw > CAMERA_NEGATIVE_CAP:
            seen = "animal only" if cls in ANIMAL_CLASSES else "no person or vehicle"
            add(f"Camera: {seen}, held at log", CAMERA_NEGATIVE_CAP - raw)

        score = max(0, min(100, sum(r.weight for r in reasons)))
        band = "high" if score >= HIGH_THRESHOLD else "review" if score >= REVIEW_THRESHOLD else "log"
        unusual = band != "log"

        ml = anomaly_adapter.score_incident(
            hour=ctx.hour,
            expected_activity=ctx.expected_activity,
            count=ctx.max_count if ctx.target_confirmed else 0,
            in_corridor=not ctx.off_route,
        )

        return ZoneCheckResult(
            score=score, band=band, unusual=unusual, reasons=reasons,
            pipeline=self.pipeline(ctx, score, unusual, bop_name), ml_score=ml.anomaly_score,
        )

    @staticmethod
    def pipeline(ctx: IncidentContext, score: int, unusual: bool, bop_name: str) -> List[PipelineStage]:
        cam = ctx.camera or "camera"
        stages: List[PipelineStage] = []

        if ctx.radar:
            if ctx.radar.motion_class == "static":
                motion = "near-static return"
            else:
                motion = f"{'closing' if ctx.radar.approaching else 'moving away'}, {ctx.radar.motion_class}"
            stages.append(PipelineStage(stage="radar", status="done",
                detail=f"{ctx.primary_node} radar · {ctx.radar.range_m:.0f} m, {motion}"))
        else:
            stages.append(PipelineStage(stage="radar", status="skipped", detail="No radar track"))

        if not ctx.camera_checked:
            stages.append(PipelineStage(stage="camera", status="pending", detail=f"Waking {cam}"))
            stages.append(PipelineStage(stage="detection", status="pending", detail="Waiting for frame"))
            stages.append(PipelineStage(stage="zone_check", status="pending", detail="Needs camera result"))
            stages.append(PipelineStage(stage="outcome", status="pending", detail="Logged while waiting"))
            return stages

        stages.append(PipelineStage(stage="camera", status="done", detail=f"{cam} woke on radar trigger"))
        if ctx.target_confirmed:
            conf = f" ({ctx.vision_confidence:.0%})" if ctx.vision_confidence else ""
            stages.append(PipelineStage(stage="detection", status="done",
                detail=f"YOLO: {ctx.vision_label} ×{ctx.max_count}{conf}"))
        else:
            stages.append(PipelineStage(stage="detection", status="done", detail="YOLO: no person or vehicle"))

        if not ctx.target_confirmed:
            stages.append(PipelineStage(stage="zone_check", status="no", detail=f"No target to check · {score}"))
            stages.append(PipelineStage(stage="outcome", status="done", detail="Logged, zone keeps watching"))
        elif unusual:
            stages.append(PipelineStage(stage="zone_check", status="yes", detail=f"Unusual for this zone · {score}"))
            stages.append(PipelineStage(stage="outcome", status="done", detail=f"Alert sent to {bop_name}"))
        else:
            stages.append(PipelineStage(stage="zone_check", status="no", detail=f"Normal for this zone · {score}"))
            stages.append(PipelineStage(stage="outcome", status="done", detail="Logged, zone keeps watching"))
        return stages

scoring_engine = ScoringEngine()
