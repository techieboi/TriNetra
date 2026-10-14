import json
import math
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from shapely.geometry import Point, Polygon

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "zone.json"

class ZoneManager:
    def __init__(self, json_path: Path = DATA_PATH):
        self.json_path = json_path
        self.data: Dict[str, Any] = {}
        self.geofence_polygons: Dict[str, Polygon] = {}
        self.load()

    def load(self):
        if not self.json_path.exists():
            raise FileNotFoundError(f"Zone file not found at {self.json_path}")
        with open(self.json_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        self.geofence_polygons = {}
        for gf in self.data.get("geofences", []):
            # Polygon expects (lon, lat) or (x, y) coordinates
            pts = [(pt[1], pt[0]) for pt in gf["polygon"]]
            self.geofence_polygons[gf["id"]] = Polygon(pts)

    def get_zone_data(self) -> Dict[str, Any]:
        return self.data

    def check_geofences(self, lat: float, lon: float) -> List[Dict[str, Any]]:
        """Returns all matching geofences for a given coordinate."""
        pt = Point(lon, lat)
        matches = []
        for gf in self.data.get("geofences", []):
            poly = self.geofence_polygons.get(gf["id"])
            if poly and poly.contains(pt):
                matches.append(gf)
        return matches

    def is_in_market_crossing(self, lat: float, lon: float) -> bool:
        matches = self.check_geofences(lat, lon)
        return any(m.get("kind") == "crossing_route" for m in matches)

    def is_in_restricted(self, lat: float, lon: float) -> bool:
        matches = self.check_geofences(lat, lon)
        return any(m.get("kind") == "restricted" for m in matches)

    def is_in_forest_track(self, lat: float, lon: float) -> bool:
        matches = self.check_geofences(lat, lon)
        return any(m.get("kind") == "forest_track" for m in matches)

    def get_nearest_bop(self, lat: float, lon: float) -> Tuple[Dict[str, Any], float]:
        """Finds nearest BOP using Haversine formula, returns (bop_dict, distance_km)."""
        bops = self.data.get("bops", [])
        if not bops:
            return ({"id": "BOP-DEF", "name": "Main Post"}, 1.0)

        nearest = None
        min_dist = float("inf")

        for b in bops:
            dist = self.haversine_km(lat, lon, b["lat"], b["lon"])
            if dist < min_dist:
                min_dist = dist
                nearest = b

        return (nearest, round(min_dist, 2))

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        node_id = self.normalize_node_id(node_id)
        return next((n for n in self.data.get("nodes", []) if n["id"] == node_id), None)

    @staticmethod
    def normalize_node_id(node_id: str) -> str:
        # Accept legacy "Z1-N3" style ids and "N3 · CAM 07" display names
        return node_id.split("·")[0].strip().split("-")[-1]

    @staticmethod
    def project(lat: float, lon: float, range_m: float, bearing_deg: float) -> Tuple[float, float]:
        """Point at range_m along bearing_deg from (lat, lon). Flat-earth is fine at radar ranges."""
        b = math.radians(bearing_deg)
        dlat = range_m * math.cos(b) / 111320.0
        dlon = range_m * math.sin(b) / (111320.0 * math.cos(math.radians(lat)))
        return round(lat + dlat, 6), round(lon + dlon, 6)

    @staticmethod
    def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        dy = (lat2 - lat1) * 111320.0
        dx = (lon2 - lon1) * 111320.0 * math.cos(math.radians(lat1))
        return (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0

    def radar_sees(self, node: Dict[str, Any], lat: float, lon: float) -> Optional[Tuple[float, float]]:
        """(range_m, bearing_deg) if the point is inside the node's radar wedge, else None."""
        radar = node.get("radar")
        if not radar:
            return None
        rng = self.haversine_km(node["lat"], node["lon"], lat, lon) * 1000.0
        brg = self.bearing_deg(node["lat"], node["lon"], lat, lon)
        off = abs((brg - radar["facing_deg"] + 180.0) % 360.0 - 180.0)
        if rng <= radar["range_m"] and off <= radar["fov_deg"] / 2.0:
            return round(rng, 1), round(brg, 1)
        return None

    def geofence_kind(self, lat: float, lon: float) -> Optional[str]:
        matches = self.check_geofences(lat, lon)
        return matches[0].get("kind") if matches else None

    def expected_activity(self, lat: float, lon: float, hour: int) -> float:
        """How normal any activity is at this place and hour (0 = never seen, 1 = routine)."""
        profile = self.data.get("baseline_profile", {})
        kind = self.geofence_kind(lat, lon) or "default"
        row = profile.get(kind) or profile.get("default") or [0.5] * 5
        band = 0 if hour < 5 else 1 if hour < 8 else 2 if hour < 18 else 3 if hour < 20 else 4
        return float(row[band])

    @staticmethod
    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        p = math.pi / 180
        a = (
            math.sin((lat2 - lat1) * p / 2) ** 2
            + math.cos(lat1 * p)
            * math.cos(lat2 * p)
            * math.sin((lon2 - lon1) * p / 2) ** 2
        )
        return 12742 * math.asin(math.sqrt(max(0.0, min(1.0, a))))

zone_mgr = ZoneManager()
