from pathlib import Path
from typing import Union, Any, Optional
from app.ml.base import BaseVisionModel, VisionDetectionResult

class VisionAdapter(BaseVisionModel):
    def __init__(self, weights_dir: Optional[Path] = None):
        if weights_dir is None:
            self.weights_dir = Path(__file__).resolve().parent / "weights"
        else:
            self.weights_dir = weights_dir
        self.weights_dir.mkdir(parents=True, exist_ok=True)
        self.weights_file = self.weights_dir / "vision_thermal.pt"
        
        self.model = None
        self._load_model_if_present()

    def _load_model_if_present(self):
        """Attempts to load trained YOLO weights if the file exists and ultralytics is installed."""
        if self.weights_file.exists():
            try:
                from ultralytics import YOLO
                self.model = YOLO(str(self.weights_file))
                print(f"[VisionAdapter] Successfully loaded trained weights from {self.weights_file}")
            except Exception as e:
                print(f"[VisionAdapter] Found weights at {self.weights_file} but failed to load: {e}. Using fallback.")
                self.model = None
        else:
            self.model = None

    def is_model_loaded(self) -> bool:
        return self.model is not None

    def predict(self, frame_or_path: Union[str, Any], hint_class: Optional[str] = None, hint_count: int = 1) -> VisionDetectionResult:
        # Check if live model is available
        if self.model is not None:
            try:
                results = self.model(frame_or_path, verbose=False)
                if results and len(results) > 0:
                    r = results[0]
                    boxes = r.boxes
                    if len(boxes) > 0:
                        classes = [r.names[int(c)] for c in boxes.cls]
                        confidences = [float(c) for c in boxes.conf]
                        xyxyn = boxes.xyxyn.tolist()
                        primary_class = classes[0]
                        max_conf = max(confidences) if confidences else 0.85
                        count = len(boxes)
                        
                        return VisionDetectionResult(
                            detected_class=f"{primary_class.capitalize()} ×{count}",
                            count=count,
                            confidence=round(max_conf, 2),
                            bounding_boxes=xyxyn,
                            heading_deg=None,
                            snapshot_path=str(frame_or_path) if isinstance(frame_or_path, (str, Path)) else None,
                            is_live_model=True
                        )
            except Exception as e:
                print(f"[VisionAdapter] Inference error: {e}. Falling back to synthetic detection.")

        # Fallback / Synthetic Detection: echo the scenario's detection with demo boxes
        detected_class = hint_class or "Person"
        count = hint_count if detected_class.lower() != "none" else 0
        confidence = 0.94 if "person" in detected_class.lower() else 0.87

        if count >= 3:
            boxes = [[0.28, 0.35, 0.42, 0.78], [0.45, 0.32, 0.58, 0.81], [0.62, 0.38, 0.75, 0.84]]
        elif count == 2:
            boxes = [[0.35, 0.32, 0.48, 0.80], [0.55, 0.36, 0.68, 0.82]]
        elif count == 1:
            boxes = [[0.40, 0.30, 0.60, 0.82]]
        else:
            boxes = []

        return VisionDetectionResult(
            detected_class=f"{detected_class.capitalize()} ×{count}",
            count=count,
            confidence=confidence,
            bounding_boxes=boxes,
            heading_deg=None,
            snapshot_path=str(frame_or_path) if isinstance(frame_or_path, (str, Path)) else None,
            is_live_model=False
        )

vision_adapter = VisionAdapter()
