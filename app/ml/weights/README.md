# Trained Model Weights Directory

Drop trained weights here and TriNetra switches from its fallback to live inference on the next start.

1. **Vision model (YOLO, fine-tuned on HIT-UAV + LLVIP thermal)**
   - File: `vision_thermal.pt`
   - Framework: Ultralytics YOLO (`pip install ultralytics`)
   - Classes the pipeline treats as a confirmed target: `person`, `car`, `bicycle`, `motorcycle`, `othervehicle`, `truck`, `boat`.
     Anything else (or no detection) is logged, not alerted.

2. **Radar track classifier (optional)**
   - File: `radar_clf.joblib`
   - Framework: scikit-learn / joblib
   - Features: `[mean |radial speed|, speed std-dev, range change]` → label (`walking`, `vehicle`, `static`)
   - Without it, speed thresholds are used (≤ 2.5 m/s walking, above that vehicle).

3. **Zone anomaly scorer (Isolation Forest)**
   - File: `baseline_iso.joblib`
   - Features: `[hour, expected_activity, count, in_corridor]` (expected_activity comes from `baseline_profile` in `data/zone.json`)
   - Without it, the anomaly score is computed from the zone baseline directly.

`GET /api/models/status` shows which models are live and which are on fallback.
