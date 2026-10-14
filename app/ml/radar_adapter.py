from pathlib import Path
from statistics import mean, pstdev
from typing import List, Optional
from app.ml.base import BaseRadarClassifier, RadarTrackResult

WALKING_MAX_MPS = 2.5

class RadarAdapter(BaseRadarClassifier):
    def __init__(self, weights_dir: Optional[Path] = None):
        self.weights_dir = weights_dir or Path(__file__).resolve().parent / "weights"
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.weights_file = self.weights_dir / "radar_clf.joblib"
        self.model = None
        if self.weights_file.exists():
            try:
                import joblib
                self.model = joblib.load(str(self.weights_file))
                print(f"[RadarAdapter] Loaded classifier from {self.weights_file}")
            except Exception as e:
                print(f"[RadarAdapter] Error loading {self.weights_file}: {e}. Using speed rules.")

    def is_model_loaded(self) -> bool:
        return self.model is not None

    def summarize(self, ranges: List[float], speeds: List[float]) -> RadarTrackResult:
        rng = ranges[-1] if ranges else 0.0
        spd = speeds[-1] if speeds else 0.0
        approaching = (ranges[-1] < ranges[0]) if len(ranges) > 1 else spd < 0
        abs_speed = abs(mean(speeds)) if speeds else 0.0

        if self.model is not None:
            try:
                # Features: [mean |speed|, speed std-dev, range change over the track]
                feats = [[abs_speed, pstdev(speeds) if len(speeds) > 1 else 0.0, ranges[-1] - ranges[0]]]
                label = str(self.model.predict(feats)[0])
                conf = float(max(self.model.predict_proba(feats)[0])) if hasattr(self.model, "predict_proba") else 0.9
                return RadarTrackResult(range_m=rng, speed_mps=spd, approaching=approaching,
                                        motion_class=label, confidence=round(conf, 2), is_live_model=True)
            except Exception as e:
                print(f"[RadarAdapter] Inference error: {e}. Using speed rules.")

        if abs_speed < 0.2:
            motion, conf = "static", 0.7
        elif abs_speed <= WALKING_MAX_MPS:
            motion, conf = "walking", 0.85
        else:
            motion, conf = "vehicle", 0.8
        return RadarTrackResult(range_m=rng, speed_mps=spd, approaching=approaching,
                                motion_class=motion, confidence=conf)

radar_adapter = RadarAdapter()
