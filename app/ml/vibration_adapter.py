import os
from pathlib import Path
from typing import Optional, Union, List, Any
import math
import random
from app.ml.base import BaseVibrationClassifier, VibrationClassificationResult

class VibrationAdapter(BaseVibrationClassifier):
    def __init__(self, weights_dir: Optional[Path] = None):
        if weights_dir is None:
            self.weights_dir = Path(__file__).resolve().parent / "weights"
        else:
            self.weights_dir = weights_dir
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.weights_file = self.weights_dir / "vibration_clf.joblib"
        
        self.model = None
        self._load_model_if_present()

    def _load_model_if_present(self):
        """Attempts to load trained vibration classifier joblib if present."""
        if self.weights_file.exists():
            try:
                import joblib
                self.model = joblib.load(str(self.weights_file))
                print(f"[VibrationAdapter] Successfully loaded classifier from {self.weights_file}")
            except Exception as e:
                print(f"[VibrationAdapter] Error loading {self.weights_file}: {e}. Using fallback.")
                self.model = None
        else:
            self.model = None

    def is_model_loaded(self) -> bool:
        return self.model is not None

    def generate_synthetic_waveform(self, label: str, length: int = 80) -> List[float]:
        """Generates realistic normalized frequency / time-series waveform points (0.0 - 1.0)."""
        samples = []
        label_lower = (label or "footstep").lower()
        
        if "footstep" in label_lower or "intrusion" in label_lower or "person" in label_lower:
            # Footfall pattern: rhythmic pulse bursts with low baseline ambient noise
            for i in range(length):
                phase = (i % 20) / 20.0
                if phase < 0.3:
                    # Impact pulse
                    amp = math.sin(phase / 0.3 * math.pi) * 0.85 + (random.random() * 0.15)
                else:
                    amp = (random.random() * 0.12)
                samples.append(round(amp, 3))
        elif "vehicle" in label_lower or "motorcycle" in label_lower:
            # Continuous harmonic hum + engine rumble
            for i in range(length):
                amp = 0.5 + 0.35 * math.sin(i * 0.4) + (random.random() * 0.15)
                samples.append(round(min(1.0, max(0.0, amp)), 3))
        elif "animal" in label_lower or "livestock" in label_lower:
            # Irregular, lighter trotting pulses
            for i in range(length):
                phase = (i % 28) / 28.0
                if phase < 0.25:
                    amp = math.sin(phase / 0.25 * math.pi) * 0.55 + (random.random() * 0.1)
                else:
                    amp = (random.random() * 0.1)
                samples.append(round(amp, 3))
        else:
            # Ambient environmental noise
            for _ in range(length):
                samples.append(round(random.random() * 0.15, 3))
        return samples

    def classify(self, window_data: Optional[Union[List[float], Any]] = None, label_hint: Optional[str] = None) -> VibrationClassificationResult:
        if self.model is not None and window_data is not None:
            try:
                # If window_data is passed to trained model
                pred = self.model.predict([window_data])[0]
                probs = self.model.predict_proba([window_data])[0] if hasattr(self.model, "predict_proba") else [0.9]
                conf = float(max(probs))
                waveform = list(window_data)[:80] if len(window_data) >= 80 else self.generate_synthetic_waveform(str(pred))
                return VibrationClassificationResult(
                    label=str(pred),
                    confidence=round(conf, 2),
                    spectral_energy=0.82,
                    waveform_samples=waveform,
                    is_live_model=True
                )
            except Exception as e:
                print(f"[VibrationAdapter] Classification failed: {e}. Falling back.")

        label = label_hint or "footstep"
        conf = 0.81 if label == "footstep" else 0.76
        waveform = self.generate_synthetic_waveform(label)
        return VibrationClassificationResult(
            label=label,
            confidence=conf,
            spectral_energy=0.78 if label != "noise" else 0.15,
            waveform_samples=waveform,
            is_live_model=False
        )

vibration_adapter = VibrationAdapter()
