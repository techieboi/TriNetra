from typing import Tuple, List
from app.schema import Incident, ReasonItem
from app.engine.context import IncidentContext, HUMAN_CLASSES, ANIMAL_CLASSES

RULE_WEIGHTS = {
    "Night-time in quiet sector": 30,
    "Off authorized crossing route": 25,
    "Inside restricted zero-line geofence": 15,
    "Multi-sensor consensus (cross-modal agreement)": 15,
    "Human or motorized transport detected": 15,
    "Group formation (3+ entities)": 10,
    "Heading vector penetrating territory": 10,
    "Suppression: Livestock/wildlife detected": -40,
    "Suppression: Authorized crossing during market hours": -30,
}

class ScoringEngine:
    def score(self, inc: Incident, ctx: IncidentContext) -> Tuple[int, str, List[ReasonItem]]:
        reasons: List[ReasonItem] = []

        # 1. Spatio-temporal context
        if ctx.is_night and ctx.zone_quiet_now:
            reasons.append(ReasonItem(factor="Night-time in quiet sector", weight=RULE_WEIGHTS["Night-time in quiet sector"]))

        if ctx.off_route:
            reasons.append(ReasonItem(factor="Off authorized crossing route", weight=RULE_WEIGHTS["Off authorized crossing route"]))

        if ctx.in_restricted:
            reasons.append(ReasonItem(factor="Inside restricted zero-line geofence", weight=RULE_WEIGHTS["Inside restricted zero-line geofence"]))

        # 2. Multi-sensor fusion bonus
        # Each extra distinct sensor type gives +15
        extra_sensors = max(0, len(ctx.sensor_types) - 1)
        for i in range(extra_sensors):
            reasons.append(ReasonItem(
                factor=f"Multi-sensor consensus (+{i+1} agreeing modality)",
                weight=RULE_WEIGHTS["Multi-sensor consensus (cross-modal agreement)"]
            ))

        # 3. Vision classification
        has_human = bool(ctx.vision_labels & HUMAN_CLASSES)
        has_animal = bool(ctx.vision_labels & ANIMAL_CLASSES)

        if has_human or ctx.has_motor_vehicle:
            reasons.append(ReasonItem(factor="Human or motorized transport detected", weight=RULE_WEIGHTS["Human or motorized transport detected"]))

        # If only animal and no human detected
        if has_animal and not has_human and not ctx.has_motor_vehicle:
            reasons.append(ReasonItem(factor="Suppression: Livestock/wildlife detected", weight=RULE_WEIGHTS["Suppression: Livestock/wildlife detected"]))

        # 4. Group size & trajectory
        if ctx.max_count >= 3:
            reasons.append(ReasonItem(factor="Group formation (3+ entities)", weight=RULE_WEIGHTS["Group formation (3+ entities)"]))

        if ctx.towards_interior:
            reasons.append(ReasonItem(factor="Heading vector penetrating territory", weight=RULE_WEIGHTS["Heading vector penetrating territory"]))

        # 5. Routine daytime market suppression
        if ctx.on_crossing_in_hours:
            reasons.append(ReasonItem(factor="Suppression: Authorized crossing during market hours", weight=RULE_WEIGHTS["Suppression: Authorized crossing during market hours"]))

        # Calculate sum
        raw_score = sum(r.weight for r in reasons)
        calculated_score = max(0, min(100, raw_score))

        # CRITICAL HARD SAFETY RULE:
        # A single sensor alone NEVER escalates to high band (capped at 69)
        if len(ctx.sensor_types) <= 1:
            calculated_score = min(calculated_score, 65)

        # Categorize into bands
        if calculated_score >= 70:
            band = "high"
        elif calculated_score >= 40:
            band = "review"
        else:
            band = "log"

        return calculated_score, band, reasons

scoring_engine = ScoringEngine()
