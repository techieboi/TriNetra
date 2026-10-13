from abc import ABC, abstractmethod
from typing import List, Optional, Union, Dict, Any
from pydantic import BaseModel
import numpy as np

class VisionDetectionResult(BaseModel):
    detected_class: str
    count: int = 1
    confidence: float = 1.0
    bounding_boxes: List[List[float]] = []  # [[x1, y1, x2, y2], ...] normalized or pixels
    heading_deg: Optional[float] = None
    snapshot_path: Optional[str] = None
    is_live_model: bool = False

class BaseVisionModel(ABC):
    @abstractmethod
    def predict(self, frame_or_path: Union[str, Any]) -> VisionDetectionResult:
        """Run vision detection on an image path or array."""
        pass

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real weights are loaded, False if fallback."""
        pass


class VibrationClassificationResult(BaseModel):
    label: str  # "footstep", "vehicle", "animal", "noise"
    confidence: float = 1.0
    spectral_energy: float = 0.5
    waveform_samples: List[float] = []  # 60-100 normalized points for live canvas visualizer
    is_live_model: bool = False

class BaseVibrationClassifier(ABC):
    @abstractmethod
    def classify(self, window_data: Optional[Union[List[float], Any]] = None, label_hint: Optional[str] = None) -> VibrationClassificationResult:
        """Classify a 2-second vibration window."""
        pass

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real model is loaded, False if fallback."""
        pass


class AnomalyScoreResult(BaseModel):
    anomaly_score: int  # 0 to 100
    is_outlier: bool = False
    cluster_distance: float = 0.0
    is_live_model: bool = False

class BaseAnomalyScorer(ABC):
    @abstractmethod
    def score_incident(self, hour: int, zone_id: str, sensor_count: int, duration_s: float = 10.0) -> AnomalyScoreResult:
        """Evaluate contextual anomaly using Isolation Forest or baseline profile."""
        pass

    @abstractmethod
    def is_model_loaded(self) -> bool:
        """Return True if real model is loaded, False if fallback."""
        pass
