from datetime import datetime, timezone
from typing import Dict, Optional, List
import time
import uuid
from app.schema import Event, Incident
from app.zone import zone_mgr

FUSION_WINDOW_SECONDS = 10.0
SPATIAL_PROXIMITY_KM = 0.40  # 400m radius

class FusionEngine:
    def __init__(self):
        # zone_id -> Incident
        self.active_incidents: Dict[str, Incident] = {}
        self.last_received: Dict[str, float] = {}

    def parse_time(self, ts_str: str) -> float:
        try:
            # Handles ISO strings with offset or Z
            dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            return dt.timestamp()
        except Exception:
            return datetime.now(timezone.utc).timestamp()

    def process_event(self, event: Event, received_at: Optional[float] = None) -> Incident:
        """
        Groups a radar trigger and the camera result that follows it (same zone,
        10 s window, ~400 m) into one incident.
        """
        zone_key = event.zone_id
        received_at = received_at if received_at is not None else time.time()
        inc = self.active_incidents.get(zone_key)

        is_close = False
        is_fresh = False

        if inc and inc.events:
            last_event = inc.events[-1]
            # Window on arrival time, so a replayed scenario never merges into the previous run
            time_diff = received_at - self.last_received.get(zone_key, 0.0)

            # Spatial check
            dist_km = zone_mgr.haversine_km(event.lat, event.lon, last_event.lat, last_event.lon)

            is_fresh = (time_diff <= FUSION_WINDOW_SECONDS)
            is_close = (dist_km <= SPATIAL_PROXIMITY_KM)

        self.last_received[zone_key] = received_at
        if inc and is_fresh and is_close:
            inc.events.append(event)
            if event.node_id not in inc.node_ids:
                inc.node_ids.append(event.node_id)
            inc.last_ts = event.ts
            return inc
        else:
            # Start a brand new incident
            new_inc = Incident(
                incident_id=f"INC-{uuid.uuid4().hex[:6].upper()}",
                zone_id=event.zone_id,
                node_ids=[event.node_id],
                events=[event],
                start_ts=event.ts,
                last_ts=event.ts,
                received_at=received_at,
                score=0,
                band="log",
                reasons=[],
                status="open"
            )
            self.active_incidents[zone_key] = new_inc
            return new_inc

    def clear(self):
        self.active_incidents.clear()
        self.last_received.clear()

fusion_engine = FusionEngine()
