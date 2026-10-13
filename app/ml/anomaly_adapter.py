from pathlib import Path
from typing import Optional
from app.ml.base import BaseAnomalyScorer, AnomalyScoreResult

class AnomalyAdapter(BaseAnomalyScorer):
    def __init__(self, weights_dir: Optional[Path] = None):
        if weights_dir is None:
            self.weights_dir = Path(__file__).resolve().parent / "weights"
        else:
            self.weights_dir = weights_dir
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.weights_file = self.weights_dir / "baseline_iso.joblib"
        
        self.model = None
        self._load_model_if_present()

    def _load_model_if_present(self):
        """Attempts to load trained Isolation Forest model."""
        if self.weights_file.exists():
            try:
                import joblib
                self.model = joblib.load(str(self.weights_file))
                print(f"[AnomalyAdapter] Successfully loaded Isolation Forest model from {self.weights_file}")
            except Exception as e:
                print(f"[AnomalyAdapter] Error loading {self.weights_file}: {e}. Using fallback.")
                self.model = None
        else:
            self.model = None

    def is_model_loaded(self) -> bool:
        return self.model is not None

    def score_incident(self, hour: int, zone_id: str, sensor_count: int, duration_s: float = 10.0) -> AnomalyScoreResult:
        if self.model is not None:
            try:
                # Features: [hour, sensor_count, duration_s]
                features = [[hour, sensor_count, duration_s]]
                decision = self.model.decision_function(features)[0]  # lower means more abnormal
                pred = self.model.predict(features)[0]  # -1 is outlier, 1 is inlier
                # Normalize decision function to 0-100 anomaly score
                anomaly_score = int(max(0, min(100, (0.5 - decision) * 100)))
                return AnomalyScoreResult(
                    anomaly_score=anomaly_score,
                    is_outlier=(pred == -1),
                    cluster_distance=round(float(abs(decision)), 3),
                    is_live_model=True
                )
            except Exception as e:
                print(f"[AnomalyAdapter] Isolation Forest scoring failed: {e}. Falling back.")

        # Heuristic Context Baseline Fallback
        # Night hours (22:00 - 05:00) with multiple sensors = high anomaly
        is_night = (hour >= 21 or hour <= 5)
        base_anomaly = 30 if is_night else 10
        sensor_modifier = sensor_count * 20
        total = min(98, base_anomaly + sensor_modifier)
        
        return AnomalyScoreResult(
            anomaly_score=total,
            is_outlier=total >= 70,
            cluster_distance=0.84 if total >= 70 else 0.22,
            is_live_model=False
        )

anomaly_adapter = AnomalyAdapter()
