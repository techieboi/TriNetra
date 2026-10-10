# TRINETRA — Software-First Demo Build Plan

Oct 10, 2026 · @Ananya Negi

## The approach

**Build demo v0 as one Python backend and one web dashboard, with every sensor replaced by a software "virtual node". Use your laptop webcam and your phone's motion sensor as two real live inputs, so judges still see something physical react.** No ESP32, no soldering, no MQTT broker, no Docker; you need a laptop and a phone.

This delivers every P0 requirement in TRINETRA — Product Requirements Document except FR-1 (the real ground node) and FR-2 (heartbeats from hardware), which are simulated instead. The intelligence part (fusion, context engine, explained score, nearest-BOP routing, operator actions, audit log) is identical. That part is what judges score, and none of it depends on hardware.

**Why this works:**

- **The core idea is software.** TRINETRA's value is the context engine, not the sensor. A software-first build puts all your time there.
- **One event shape for everything.** Simulated, live and replayed events use the same JSON. The ESP32 can be added later without changing anything downstream (see the upgrade path at the end).
- **The demo can't break.** Scenarios are data files that play the same way every time, so a loose wire can't ruin the run.
- **Still feels real.** Live YOLO on the webcam detects you walking past. Shaking or tapping the phone sends real vibration data through the browser's motion sensor and over Wi-Fi.

**Effort:** about 10–12 working days for one person, or 4–5 days for a team of three working in parallel (estimates; the build order below is in checkpoints, not dates).

## What is real vs simulated in demo v0

Each source of input in the demo, and how it is produced:

| Input | In demo v0 | How | Label on screen |
| --- | --- | --- | --- |
| Vibration (node 1) | **Real, live** | Phone motion sensor via a small web page (`/sensor`) sends acceleration over Wi-Fi; the backend classifies each 2 s window | `live` |
| PIR motion (node 1) | Simulated from vision | A webcam detection of a person counts as a "PIR" trigger for node 1 | `sim` |
| Vision (node 1) | **Real, live** | YOLO-nano on the laptop webcam (person, dog, car, etc.) | `live` |
| Vision, thermal (night scenarios) | Real model, recorded footage | YOLO on public thermal clips (FLIR ADAS / LLVIP) played as a video file | `replay` |
| Nodes 2–4 | Simulated | Scenario files (YAML) play timed events | `sim` |
| Zone history (30 days) | Synthetic | Generator script writes normal daily patterns into the database | `sim` |
| Drone check | Simulated | Animated icon on the map + recorded aerial thermal clip (HIT-UAV) | `sim` |
| Fusion, context engine, score, routing, alerts, audit | **Real** | Your code, running live on every event | — |

**Phone sensor note:** mobile browsers only expose motion data on a secure (HTTPS) page, and iPhones also ask for permission. Serve the sensor page through a free tunnel (cloudflared or ngrok) or with a self-signed certificate. Backup option: the free **phyphox** app can stream the phone's accelerometer over Wi-Fi, and your backend can read it.

## Architecture

&#91;embedded content: Demo v0 architecture · software only, one laptop + one phone\]

Four inputs publish to one in-process queue. The engine fuses, scores against the zone context and routes alerts to the dashboard over WebSocket. Every event, alert and operator action is stored in SQLite.

## Tech stack (lean version) and setup

I've cut the PRD stack down to what one laptop needs. Every cut has a later upgrade that keeps the same interfaces.

| Layer | Demo v0 choice | Replaces (from PRD) | Upgrade later |
| --- | --- | --- | --- |
| Language | Python 3.11 (backend + ML), TypeScript (frontend) | — | — |
| Backend | FastAPI + Uvicorn | same | same |
| Event bus | In-process `asyncio.Queue` | MQTT / Mosquitto | Add an MQTT adapter that pushes into the same queue |
| Database | SQLite via SQLModel | PostgreSQL + PostGIS | Change the connection string |
| Geo maths | `shapely` (point-in-polygon) + haversine distance | PostGIS | PostGIS queries |
| Vision | `ultralytics` YOLO (yolov8n or yolo11n) + OpenCV | same | Fine-tune on thermal |
| Vibration classifier | NumPy features + scikit-learn RandomForest | same | 1D-CNN |
| Anomaly ML (optional) | scikit-learn IsolationForest | same | same |
| Live push | FastAPI WebSocket | same | same |
| Frontend | React + Vite + TypeScript + Tailwind + react-leaflet | same | same |
| Scenarios | YAML files + a player | — | — |
| Phone sensor | One static HTML page using `DeviceMotionEvent` | ESP32 node | ESP32 publishing the same JSON |
| Run | Two terminals: `uvicorn` and `npm run dev` | Docker Compose | Docker Compose |

**Setup:**

```bash
# backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" sqlmodel pydantic pyyaml shapely numpy scikit-learn ultralytics opencv-python
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# frontend
npm create vite@latest web -- --template react-ts
cd web && npm i leaflet react-leaflet @types/leaflet recharts && npm run dev

# phone sensor page over HTTPS (pick one)
cloudflared tunnel --url http://localhost:8000
```

**If React feels like too much for now:** FastAPI can serve one `index.html` that uses Leaflet and plain JavaScript over the same WebSocket. Build that first, and move to React only once the flow works.

## Project folder structure

One repo with two top-level apps. Every input lives under `inputs/` and only ever calls `bus.publish(event)`.

```
trinetra/
├── app/                      # FastAPI backend
│   ├── main.py               # app, routes, websocket, startup tasks
│   ├── schema.py             # Event, Incident, Alert, Action (pydantic/SQLModel)
│   ├── db.py                 # SQLite engine + session
│   ├── bus.py                # asyncio.Queue + publish()
│   ├── zone.py               # loads zone.json: nodes, BOPs, geofences
│   ├── engine/
│   │   ├── fusion.py         # groups events into incidents
│   │   ├── context.py        # time baseline, routes, geofences, direction
│   │   ├── scoring.py        # weighted rules -> score, band, reasons
│   │   └── routing.py        # nearest BOP (haversine)
│   ├── inputs/
│   │   ├── scenario_player.py  # plays scenarios/*.yaml
│   │   ├── phone_vibration.py  # POST /ingest/phone -> classify -> event
│   │   └── webcam_vision.py    # YOLO on webcam or video file -> event
│   ├── ml/
│   │   ├── vib_features.py   # RMS, peaks, zero-crossing, spectrum
│   │   ├── train_vib.py      # trains vib_model.joblib
│   │   └── baseline.py       # synthetic 30-day history + IsolationForest
│   └── static/sensor.html    # phone page that streams motion data
├── data/
│   ├── zone.json             # fictional Zone 1 layout
│   ├── scenarios/            # routine.yaml, animal.yaml, intrusion.yaml, offline.yaml
│   ├── clips/                # thermal + drone video clips
│   └── vib_samples/          # recorded phone vibration windows (CSV)
├── web/                      # React dashboard
│   └── src/
│       ├── App.tsx
│       ├── ws.ts             # websocket client
│       └── components/       # ZoneMap, AlertQueue, AlertCard, DroneView, ScenarioPanel, AuditLog
└── README.md
```

## Core modules

These are sketches that show the shape of each module, not finished code; fill in imports and error handling as you go.

**1. Event schema** (`schema.py`) is the one contract every input follows.

```python
from datetime import datetime
from typing import Literal
from pydantic import BaseModel

class Event(BaseModel):
    event_id: str
    node_id: str
    zone_id: str
    type: Literal["vibration", "pir", "vision", "heartbeat"]
    label: str | None = None        # footstep / person / cow ...
    confidence: float = 1.0
    count: int = 1                  # people or objects seen
    heading_deg: float | None = None
    ts: datetime
    lat: float
    lon: float
    source: Literal["live", "sim", "replay"]
    snapshot: str | None = None     # path to a JPEG, alerts only
```

**2. Event bus** (`bus.py`): an in-memory queue. Inputs put events in; the engine takes them out.

```python
import asyncio
queue: asyncio.Queue = asyncio.Queue()

async def publish(event):
    await queue.put(event)
```

**3. Engine loop** (`main.py`): one task that turns events into incidents, scores and alerts.

```python
async def engine_loop():
    while True:
        e = await bus.queue.get()
        db.save_event(e)
        await ws.broadcast({"kind": "event", "data": e.model_dump(mode="json")})
        inc = fusion.add(e)                       # new or existing incident
        ctx = context.evaluate(inc)               # facts about time/place/behaviour
        inc.score, inc.band, inc.reasons = scoring.score(inc, ctx)
        db.save_incident(inc)
        if inc.band != "log":
            alert = db.upsert_alert(inc, routing.nearest_bop(inc))  # one alert per incident, updated as score grows
            await ws.broadcast({"kind": "alert", "data": alert})
```

**4. Fusion** (`engine/fusion.py`): events in the same zone within 10 s join one incident.

```python
WINDOW = timedelta(seconds=10)
open_incidents: dict[str, Incident] = {}

def add(e: Event) -> Incident:
    inc = open_incidents.get(e.zone_id)
    if inc and e.ts - inc.last_ts <= WINDOW:
        inc.events.append(e)
        inc.last_ts = e.ts
    else:
        inc = Incident.new(e)
        open_incidents[e.zone_id] = inc
    return inc
```

**5. Context** (`engine/context.py`): turns raw facts into yes/no answers the scorer can use.

```python
def evaluate(inc) -> Context:
    e = inc.events[-1]
    hour = e.ts.hour
    pt = Point(e.lon, e.lat)
    off_route = not any(g.polygon.contains(pt) for g in zone.crossing_routes)
    return Context(
        is_night = hour >= 20 or hour < 5,
        zone_quiet_now = baseline.mean_events(e.node_id, hour) < 0.2,   # from 30-day history
        off_route = off_route,
        in_restricted = any(g.polygon.contains(pt) for g in zone.restricted),
        on_crossing_in_hours = (not off_route) and 8 <= hour < 18,
        towards_interior = heading_points_inward(e.heading_deg),
        max_count = max(ev.count for ev in inc.events),
        sensor_types = {ev.type for ev in inc.events if ev.type != "heartbeat"},
        vision_labels = {ev.label for ev in inc.events if ev.type == "vision"},
    )
```

**6. Scoring** (`engine/scoring.py`) uses transparent weights, and every one that fires becomes a reason.

```python
WEIGHTS = {
    "Night-time in a quiet zone": 30,
    "Off known crossing route": 25,
    "Inside restricted geofence": 15,
    "Extra sensor agrees": 15,          # per extra sensor type
    "Person or vehicle detected": 15,
    "Group of 3 or more": 10,
    "Moving towards interior": 10,
    "Animal detected": -40,
    "Known crossing in market hours": -30,
}
HUMAN = {"person", "car", "motorcycle", "bicycle", "truck", "boat"}
ANIMAL = {"cow", "dog", "horse", "sheep", "elephant", "bird"}

def score(inc, c):
    r = []
    if c.is_night and c.zone_quiet_now: r.append("Night-time in a quiet zone")
    if c.off_route: r.append("Off known crossing route")
    if c.in_restricted: r.append("Inside restricted geofence")
    r += ["Extra sensor agrees"] * (len(c.sensor_types) - 1)
    if c.vision_labels & HUMAN: r.append("Person or vehicle detected")
    if c.vision_labels & ANIMAL and not c.vision_labels & HUMAN: r.append("Animal detected")
    if c.max_count >= 3: r.append("Group of 3 or more")
    if c.towards_interior: r.append("Moving towards interior")
    if c.on_crossing_in_hours: r.append("Known crossing in market hours")

    reasons = [(k, WEIGHTS[k]) for k in r]
    s = max(0, min(100, sum(w for _, w in reasons)))
    if len(c.sensor_types) == 1:
        s = min(s, 69)                  # one sensor alone never reaches 'high'
    band = "high" if s >= 70 else "review" if s >= 40 else "log"
    return s, band, reasons
```

**7. Routing** (`engine/routing.py`) finds the nearest BOP by straight-line distance.

```python
def haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))

def nearest_bop(inc):
    e = inc.events[-1]
    return min(((b, haversine_km(e.lat, e.lon, b.lat, b.lon)) for b in zone.bops), key=lambda t: t[1])
```

**8. Live vision** (`inputs/webcam_vision.py`): YOLO on the webcam, or on a thermal video file for night scenarios.

```python
model = YOLO("yolov8n.pt")

async def run(source=0, node_id="Z1-N1", src_label="live"):
    cap, last = cv2.VideoCapture(source), 0.0
    while True:
        ok, frame = cap.read()
        if not ok:                                   # video ended -> loop
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0); continue
        res = (await asyncio.to_thread(model, frame, verbose=False, conf=0.5))[0]
        names = [model.names[int(c)] for c in res.boxes.cls]
        if names and time.time() - last > 3:         # at most one event per 3 s
            top = max(set(names), key=names.count)
            snap = save_jpeg(res.plot())
            await bus.publish(make_event(node_id, "vision", top, count=names.count(top), source=src_label, snapshot=snap))
            last = time.time()
        await asyncio.sleep(0.2)
```

**9. Phone vibration** (`static/sensor.html` + `inputs/phone_vibration.py`): the phone streams motion every 2 s and the backend classifies it.

```html
<button id="go">Start sensor</button>
<script>
let buf = [];
go.onclick = async () => {
  if (DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission(); // iPhone
  addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity;
    buf.push(Math.hypot(a.x, a.y, a.z));
  });
  setInterval(() => {
    fetch('/ingest/phone', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({node_id: 'Z1-N1', samples: buf})});
    buf = [];
  }, 2000);
};
</script>
```

```python
def features(x):
    x = np.asarray(x) - np.mean(x)
    spec = np.abs(np.fft.rfft(x))
    return [x.std(), np.abs(x).max(), np.mean(x[:-1] * x[1:] < 0),
            spec.argmax(), (spec * np.arange(len(spec))).sum() / (spec.sum() + 1e-9)]

@app.post("/ingest/phone")
async def ingest_phone(p: PhonePayload):
    if len(p.samples) < 40: return {"ok": False}
    label = vib_model.predict([features(p.samples)])[0]   # footstep / heavy / noise
    if label != "noise":
        await bus.publish(make_event(p.node_id, "vibration", label, source="live"))
    return {"ok": True, "label": label}
```

To train the vibration model, put the phone flat on the floor and record about 100 two-second windows of each class: footsteps nearby, stomping (a stand-in for heavy movement), and ordinary noise (handling, fan, tapping the table). Save them as CSV, then train the RandomForest with an 80/20 split and report the confusion matrix. Tell judges plainly that the classes are stand-ins recorded indoors.

## Build order

Build in this order. Each step ends with a checkpoint you can see working, and step 4 is already a demo you could show.

1. **Zone + map (1 day).** Write `data/zone.json` with a fictional zone: 4 nodes, 1 BOP, a market crossing route polygon, a forest track and a restricted riverbed polygon. FastAPI serves `/zone`, and React draws it on a Leaflet map. ✅ *Checkpoint:* the map shows the zone.
2. **Events end to end (1 day).** Add the schema, bus, SQLite and WebSocket, plus a test button that publishes a fake event. ✅ *Checkpoint:* a pin blinks on the node within a second.
3. **Scenario player (1 day).** Load a YAML scenario and publish its events with the right delays. ✅ *Checkpoint:* "Run intrusion" makes three nodes light up in sequence.
4. **Fusion + context + scoring + routing (2 days).** Add the engine loop, and show the alert queue with score, band and reasons. ✅ *Checkpoint:* the routine and animal scenarios raise no alert, and the intrusion scenario raises a high alert at the BOP. **This is your minimum demo; protect it.**
5. **Alert card + operator actions + audit log (1–2 days).** Add confirm, dismiss, escalate and need-more-info with a note, plus the audit list. ✅ *Checkpoint:* the full chain is visible in the audit view.
6. **Live webcam vision (1 day).** Run YOLO on the webcam as node 1, and on a thermal clip for the night scenario. ✅ *Checkpoint:* walking in front of the laptop creates a `vision: person` event with a snapshot.
7. **Phone vibration (1–2 days).** Build the sensor page, the tunnel, record samples, train and serve the model. ✅ *Checkpoint:* stomping near the phone plus being seen by the webcam fuses into one review or high alert.
8. **Baseline + extras (2 days).** Generate the synthetic 30-day history to drive "zone quiet at this hour", then add the drone animation with its clip, the replay switch, reset, the simulation banner and the heatmap. ✅ *Checkpoint:* the demo script from the blueprint runs start to finish.
9. **Measure + rehearse (1 day).** Run each scenario 20 times, count single-sensor vs fused alerts, time the latency, and record YOLO and classifier metrics. ✅ *Checkpoint:* you have numbers for the metrics slide.

**Team split (if you have teammates):** one person on steps 1, 2 and 5 (frontend), one on steps 3, 4 and 8 (backend engine), and one on steps 6, 7 and 9 (ML + inputs). All three agree the event schema on day one.

## Demo scenarios as data files

Each scenario is a YAML file of timed events. It sets a "scenario clock" so a night scenario can run during an afternoon demo. Replay mode is the same player running a recorded live session.

```yaml
# data/scenarios/intrusion.yaml
name: Night intrusion on forest track
clock: "2026-10-12T02:40:00+05:30"   # scenario time shown on screen
events:
  - {at: 0.0, node: Z1-N3, type: vibration, label: footstep, confidence: 0.84, lat: 26.8512, lon: 84.2321}
  - {at: 1.5, node: Z1-N3, type: pir,       label: motion,                    lat: 26.8512, lon: 84.2321}
  - {at: 3.0, node: Z1-N3, type: vision,    label: person, count: 3, confidence: 0.78,
     heading_deg: 190, clip: clips/thermal_group.mp4, lat: 26.8513, lon: 84.2319}
  - {at: 4.0, node: Z1-N3, type: vision,    label: motorcycle, count: 1, confidence: 0.71, lat: 26.8513, lon: 84.2319}
```

| Scenario file | Clock | Events | Expected outcome |
| --- | --- | --- | --- |
| `routine.yaml` | 10:00 | Vibration + vision (person ×4) on the market crossing | Score below 40 (on route, market hours); logged, no alert |
| `animal.yaml` | 23:30 | Vibration + vision (cow) on the forest edge | Animal factor −40; no alert |
| `intrusion.yaml` | 02:40 | Vibration + PIR + vision (3 people + motorcycle), off-route, heading inward | Roughly 100 (capped); high alert at nearest BOP |
| `single_sensor.yaml` | 02:00 | Vibration only, off-route | Capped at 69; review alert at most |
| `offline.yaml` | any | Node 4 heartbeats stop | Node turns grey; "node offline" notice |
| `live` (no file) | real time | Your webcam + phone | Whatever you do in front of it |

Check the arithmetic of `intrusion.yaml` against the weights above: night in a quiet zone 30 + off-route 25 + two extra sensor types 30 + person 15 + group 10 + inward 10 = 120, capped at 100. Since this lands well above 70, small changes to the weights won't break the demo.

## Upgrade path to hardware later

Each hardware step adds a new input that publishes the same `Event`; the engine, dashboard and scenarios don't change.

| Step | Add | Code change |
| --- | --- | --- |
| 1 | Mosquitto broker | New `inputs/mqtt_bridge.py`: subscribe to `trinetra/#`, parse JSON into `Event`, `bus.publish()` |
| 2 | ESP32 + vibration sensor + PIR | Firmware publishes the same JSON to MQTT; reuse `features()` and the trained model on its samples (retrain on the new sensor) |
| 3 | Thermal camera / Jetson | Point `webcam_vision.run()` at the camera stream; nothing else changes |
| 4 | PostgreSQL + PostGIS | Change the SQLModel connection string; move the polygon checks to SQL when it helps |
| 5 | LoRa | ESP32 sends over LoRa to a gateway that forwards to MQTT; backend unchanged |
| 6 | Docker Compose | Wrap broker, database, API and web in one `docker compose up` |

**What to say to judges about v0:** *"The intelligence layer is fully built and runs live. Ground sensing comes from a phone accelerometer standing in for a geophone, and night vision uses public thermal footage. Swapping in the ESP32 node only means adding a new input, because every source speaks the same event format."*
