from typing import Tuple, Dict, Any
from app.zone import zone_mgr

# Quick Response Team average cross-country speed: ~20 km/h on rural tracks
QRT_SPEED_KMH = 20.0
GEAR_UP_MINUTES = 1.5

class RoutingEngine:
    def route_point(self, lat: float, lon: float) -> Tuple[Dict[str, Any], float, float]:
        """Nearest SSB outpost, straight-line distance (km) and QRT ETA (minutes)."""
        bop, dist_km = zone_mgr.get_nearest_bop(lat, lon)
        eta_minutes = round((dist_km / QRT_SPEED_KMH) * 60.0 + GEAR_UP_MINUTES, 1)
        return bop, dist_km, eta_minutes

routing_engine = RoutingEngine()
