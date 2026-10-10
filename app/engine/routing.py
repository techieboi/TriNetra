from typing import Tuple, Dict, Any
from app.schema import Incident
from app.zone import zone_mgr

# Quick Response Team average cross-country tactical speed: ~20 km/h on rural tracks
QRT_SPEED_KMH = 20.0

class RoutingEngine:
    def route_incident(self, inc: Incident) -> Tuple[Dict[str, Any], float, float]:
        """
        Calculates nearest BOP to the incident's latest location,
        straight-line distance (km), and estimated response team transit time (minutes).
        """
        if not inc.events:
            return ({"id": "BOP-1", "name": "BOP Sutlej (Forward HQ)"}, 1.2, 3.6)

        latest_event = inc.events[-1]
        bop, dist_km = zone_mgr.get_nearest_bop(latest_event.lat, latest_event.lon)

        # ETA in minutes (dist / speed * 60) + 1.5 min gear up buffer
        eta_minutes = round((dist_km / QRT_SPEED_KMH) * 60.0 + 1.5, 1)

        return bop, dist_km, eta_minutes

routing_engine = RoutingEngine()
