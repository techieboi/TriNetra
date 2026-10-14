from pathlib import Path
from typing import Optional
from app.ml.base import BaseAnomalyScorer, AnomalyScoreResult

OUTLIER_THRESHOLD = 65

class AnomalyAdapter(BaseAnomalyScorer):
    def __init__(self, weights_dir: Optional[Path] = None):
        self.weights_dir = weights_dir or Path(__file__).resolve().parent / "weights"
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.weights_file = self.weights_dir / "baseline_iso.joblib"
        self.model = None
        if self.weights_file.exists():
            try:
                import joblib
                self.model = joblib.load(str(self.weights_file))
                print(f"[AnomalyAdapter] Loaded Isolation Forest from {self.weights_file}")
            except Exception as e:
                print(f"[AnomalyAdapter] Error loading {self.weights_file}: {e}. Using zone baseline.")

    def is_model_loaded(self) -> bool:
        return self.model is not None

    def score_incident(self, hour: int, expected_activity: float, count: int, in_corridor: bool) -> AnomalyScoreResult:
        if self.model is not None:
            try:
                # Features: [hour, expected_activity, count, in_corridor]
                feats = [[hour, expected_activity, count, int(in_corridor)]]
                decision = float(self.model.decision_function(feats)[0])  # lower = more abnormal
                pred = int(self.model.predict(feats)[0])                  # -1 = outlier
                score = int(max(0, min(100, (0.5 - decision) * 100)))
                return AnomalyScoreResult(anomaly_score=score, is_outlier=(pred == -1),
                                          cluster_distance=round(abs(decision), 3), is_live_model=True)
            except Exception as e:
                print(f"[AnomalyAdapter] Isolation Forest scoring failed: {e}. Using zone baseline.")

        # Zone-baseline fallback: rarer activity for this place and hour = more anomalous,
        # nudged up for groups.
        score = (1.0 - expected_activity) * 85 + min(count, 5) * 3
        score = int(max(0, min(100, round(score))))
        return AnomalyScoreResult(anomaly_score=score, is_outlier=score >= OUTLIER_THRESHOLD,
                                  cluster_distance=round(1.0 - expected_activity, 3))

anomaly_adapter = AnomalyAdapter()
