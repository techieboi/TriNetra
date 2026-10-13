# Trained Model Weights Directory

Drop your trained model weights into this directory to automatically activate live inference across the TriNetra C2 product:

1. **Vision Model (YOLOv8 / YOLO11)**:
   - File: `vision_thermal.pt`
   - Framework: Ultralytics YOLO (`pip install ultralytics`)
   - Classes: `person`, `motorcycle`, `vehicle`, `animal`, `boat`

2. **Ground Vibration / Seismic Classifier**:
   - File: `vibration_clf.joblib`
   - Framework: Scikit-learn / Joblib (`pip install scikit-learn joblib`)
   - Output classes: `footstep`, `vehicle`, `animal`, `noise`

3. **Context Anomaly Scorer (Isolation Forest)**:
   - File: `baseline_iso.joblib`
   - Framework: Scikit-learn (`IsolationForest`)

If any file is absent, TriNetra automatically operates with its built-in high-fidelity synthetic fallback provider so all UI features, alerts, waveforms, and scenarios remain 100% functional without throwing errors.
