from abc import ABC, abstractmethod
from typing import List, Optional, Union, Any
from pydantic import BaseModel

class VisionDetectionResult(BaseModel):
    detected_class: str
    count: int = 1
    confidence: float = 1.0
    bounding_boxes: List[List[float]] = []  # [[x1, y1, x2, y2], ...] normalized 0-1
    heading_deg: Optional[float] = None
    snapshot_path: Optional[str] = None
    is_live_model: bool = False

class BaseVisionModel(ABC):
    @abstractmethod
    def predict(self, frame_or_path: Union[str, Any]) -> VisionDetectionResult:
        """Run vision detection on an image path or array."""

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real weights are loaded, False if fallback."""


class RadarTrackResult(BaseModel):
    range_m: float
    speed_mps: float               # radial speed; negative = approaching
    approaching: bool
    motion_class: str              # "walking", "vehicle", "static"
    confidence: float = 1.0
    is_live_model: bool = False

class BaseRadarClassifier(ABC):
    @abstractmethod
    def summarize(self, ranges: List[float], speeds: List[float]) -> RadarTrackResult:
        """Summarise a radar track (range and radial speed samples, oldest first)."""

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real model is loaded, False if fallback."""


class AnomalyScoreResult(BaseModel):
    anomaly_score: int  # 0 to 100
    is_outlier: bool = False
    cluster_distance: float = 0.0
    is_live_model: bool = False

class BaseAnomalyScorer(ABC):
    @abstractmethod
    def score_incident(self, hour: int, expected_activity: float, count: int, in_corridor: bool) -> AnomalyScoreResult:
        """Compare an incident with the zone's normal routine."""

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real model is loaded, False if fallback."""
