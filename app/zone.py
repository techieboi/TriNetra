import json
import math
from pathlib import Path
from typing import Dict, Any, List, Tuple
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
