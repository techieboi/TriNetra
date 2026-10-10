from datetime import datetime
from typing import Set, Optional
from pydantic import BaseModel
from app.schema import Incident
from app.zone import zone_mgr

HUMAN_CLASSES = {"person", "car", "motorcycle", "bicycle", "truck", "van", "boat"}
ANIMAL_CLASSES = {"cow", "dog", "horse", "sheep", "elephant", "bird", "animal_hoof"}

class IncidentContext(BaseModel):
    is_night: bool
    zone_quiet_now: bool
    off_route: bool
    in_restricted: bool
    on_crossing_in_hours: bool
    towards_interior: bool
    max_count: int
    sensor_types: Set[str]
    vision_labels: Set[str]
    has_motor_vehicle: bool
    primary_lat: float
    primary_lon: float
    primary_node: str
    latest_snapshot: Optional[str] = None
    latest_heading: Optional[float] = None

class ContextEvaluator:
    def evaluate(self, inc: Incident) -> IncidentContext:
        if not inc.events:
            return IncidentContext(
                is_night=False,
                zone_quiet_now=False,
                off_route=True,
                in_restricted=False,
                on_crossing_in_hours=False,
                towards_interior=False,
                max_count=1,
                sensor_types=set(),
                vision_labels=set(),
                has_motor_vehicle=False,
                primary_lat=26.8512,
                primary_lon=84.2321,
                primary_node="Z1-N1"
            )

        latest_event = inc.events[-1]
        lat = latest_event.lat
        lon = latest_event.lon

        # Parse hour from event timestamp
        try:
            dt = datetime.fromisoformat(latest_event.ts.replace("Z", "+00:00"))
            hour = dt.hour
        except Exception:
            hour = 2  # default night for scenarios

        is_night = (hour >= 20 or hour < 5)
        zone_quiet_now = is_night  # Night baseline in remote border sector is quiet

        # Geofence checks
        in_market = zone_mgr.is_in_market_crossing(lat, lon)
        in_restricted = zone_mgr.is_in_restricted(lat, lon)
        in_forest = zone_mgr.is_in_forest_track(lat, lon)

        # Off authorized route if not in designated crossing corridor
        off_route = not in_market or in_restricted or in_forest

        # Market hours crossing: within market corridor between 08:00 and 18:00
        on_crossing_in_hours = in_market and (8 <= hour < 18)

        # Direction checks: Heading towards interior (140 deg to 220 deg approx South/South-West into territory)
        towards_interior = False
        latest_heading = latest_event.heading_deg
        if latest_heading is not None:
            towards_interior = (130 <= latest_heading <= 230)

        # Sensor types present
        sensor_types = {e.type for e in inc.events if e.type not in ("heartbeat", "heartbeat_timeout")}

        # Vision labels and counts
        vision_labels = set()
        max_count = 1
        latest_snapshot = None
        has_motor_vehicle = False

        for e in inc.events:
            if e.count > max_count:
                max_count = e.count
            if e.type == "vision" and e.label:
                vision_labels.add(e.label.lower())
                if e.label.lower() in ("motorcycle", "car", "truck"):
                    has_motor_vehicle = True
            if e.snapshot:
                latest_snapshot = e.snapshot

        return IncidentContext(
            is_night=is_night,
            zone_quiet_now=zone_quiet_now,
            off_route=off_route,
            in_restricted=in_restricted,
            on_crossing_in_hours=on_crossing_in_hours,
            towards_interior=towards_interior,
            max_count=max_count,
            sensor_types=sensor_types,
            vision_labels=vision_labels,
            has_motor_vehicle=has_motor_vehicle,
            primary_lat=lat,
            primary_lon=lon,
            primary_node=latest_event.node_id,
            latest_snapshot=latest_snapshot,
            latest_heading=latest_heading
        )

context_evaluator = ContextEvaluator()
