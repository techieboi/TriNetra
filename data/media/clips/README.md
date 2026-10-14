# Prerecorded clips

The dashboard plays a looping, muted clip for an alert when a file with the matching name is here.
Until then it shows a "clip pending" placeholder with the snapshot (if any) and the detection boxes.

| File | Used by |
| :--- | :--- |
| `intrusion.mp4` | Night Intrusion scenario and seed alert |
| `market.mp4` | Market Crossing scenario |
| `animal.mp4` | Stray Animal scenario |
| `night_corridor.mp4` | Seed review alert (person on corridor at night) |
| `live_person.mp4`, `live_vehicle.mp4` | Drive-a-target mode |
| `drone_recon.mp4` | Drone visual check modal |

Use H.264 MP4 (plays in every browser). Keep each clip short (5–15 s) and under ~10 MB.

## Optional per-frame detections

Put `<clip>.json` next to the video to draw YOLO boxes that move with the footage:

```json
{ "fps": 10, "label": "person", "frames": [ [[0.28, 0.35, 0.42, 0.78]], [[0.29, 0.35, 0.43, 0.78]] ] }
```

`frames[i]` is the list of `[x1, y1, x2, y2]` boxes (0–1, relative to the frame) at time `i / fps`.
Without a JSON file the alert's static boxes are drawn over the video.
