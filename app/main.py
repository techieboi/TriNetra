import asyncio
import random
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Set, Dict, Optional, Literal, Tuple

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.schema import Event
from app.bus import bus
from app.db import store, IST
from app.zone import zone_mgr
from app.engine import pipeline
from app.engine.fusion import fusion_engine
from app.engine.scoring import scoring_engine
from app.engine.scenario_player import scenario_player, build_events, load_yaml, SEED_DIR
from app.ml.vision_adapter import vision_adapter
from app.ml.radar_adapter import radar_adapter
from app.ml.anomaly_adapter import anomaly_adapter

ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = ROOT / "data" / "media"
WEB_DIST = ROOT / "web" / "dist"

HEARTBEAT_INTERVAL_S = 10
HEARTBEAT_TIMEOUT_S = 30
CAMERA_STANDBY_AFTER_S = 20
OPERATOR = "Op. R. Sharma · Shift B"

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.discard(connection)

ws_manager = ConnectionManager()
camera_timers: Dict[str, asyncio.Task] = {}

def snapshot_state() -> dict:
    return {
        "zone": zone_mgr.get_zone_data(),
        "nodes": store.node_status,
        "alerts": [a.model_dump() for a in store.alerts.values()],
        "sensor_logs": store.sensor_logs,
        "metrics": store.metrics(),
        "server_time": time.time(),
    }

async def broadcast_nodes():
    await ws_manager.broadcast({"type": "node_update", "data": store.node_status, "server_time": time.time()})

async def broadcast_logs():
    await ws_manager.broadcast({"type": "sensor_logs", "data": store.sensor_logs})

# ---------- camera wake / standby ----------
async def _camera_to_standby(node_id: str):
    try:
        await asyncio.sleep(CAMERA_STANDBY_AFTER_S)
        store.set_camera_state(node_id, "standby")
        await broadcast_nodes()
    except asyncio.CancelledError:
        pass

def set_camera(node_id: str, state: str):
    store.set_camera_state(node_id, state)
    old = camera_timers.pop(node_id, None)
    if old:
        old.cancel()
    camera_timers[node_id] = asyncio.create_task(_camera_to_standby(node_id))

# ---------- engine ----------
async def handle_event(event: Event):
    received_at = time.time()
    event = pipeline.prepare_event(event)
    store.save_event(event)
    await ws_manager.broadcast({"type": "event", "data": event.model_dump()})

    if event.type in ("heartbeat", "heartbeat_timeout", "das"):
        await broadcast_logs()
        await broadcast_nodes()
        return

    node = store.node_status.get(event.node_id)
    if node and node["status"] == "offline":
        store.add_sensor_log(event.node_id, f"{event.type} ignored · node is offline", "warning")
        await broadcast_logs()
        return

    if event.type == "radar":
        if node and node["camera_state"] == "standby":
            set_camera(event.node_id, "waking")
        await ws_manager.broadcast({"type": "radar", "data": event.model_dump()})
    elif event.type == "vision":
        set_camera(event.node_id, "recording")

    inc, alert, is_new = pipeline.process(event, received_at=received_at)
    if event.type == "vision" and alert is None:
        store.log_normal(inc)

    await ws_manager.broadcast({"type": "incident", "data": {
        "incident_id": inc.incident_id, "score": inc.score, "band": inc.band,
        "unusual": inc.unusual, "pipeline": [p.model_dump() for p in inc.pipeline],
        "node_id": event.node_id, "alert_id": alert.alert_id if alert else None,
    }})
    if alert:
        await ws_manager.broadcast({"type": "alert", "data": alert.model_dump(),
                                    "audio_cue": is_new and alert.band == "high", "is_new": is_new})
    await broadcast_logs()
    await broadcast_nodes()
    await ws_manager.broadcast({"type": "metrics", "data": store.metrics()})

async def engine_loop():
    while True:
        try:
            event: Event = await bus.queue.get()
            await handle_event(event)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in engine loop: {e!r}")
            await asyncio.sleep(0.1)

async def heartbeat_loop():
    """Virtual nodes send heartbeats like real hardware would; the watchdog marks silent nodes offline."""
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)
            now = time.time()
            for node_id, node in store.node_status.items():
                if node["source"] == "sim" and node["status"] != "offline":
                    drain = 1 if random.random() < 0.05 else 0
                    store.touch_node(node_id, battery=max(1, node["battery"] - drain),
                                     signal_dbm=node["signal_dbm"] + random.choice((-1, 0, 0, 1)))
                elif node["status"] != "offline" and now - node["last_seen"] > HEARTBEAT_TIMEOUT_S:
                    store.mark_offline(node_id, f"No heartbeat for {HEARTBEAT_TIMEOUT_S} s")
                    await broadcast_logs()
            await broadcast_nodes()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in heartbeat loop: {e!r}")

def load_seed():
    """Run the reference history through the real pipeline so seed alerts follow the same rules."""
    store.reset()
    for path in sorted(SEED_DIR.glob("*.yaml")):
        data = load_yaml(path)
        minutes_ago = float(data.get("minutes_ago", 5))
        wall = time.time() - minutes_ago * 60
        created = (datetime.now(IST) - timedelta(minutes=minutes_ago)).isoformat()
        fusion_engine.clear()
        for at, ev in build_events(data):
            ev = pipeline.prepare_event(ev)
            store.events.append(ev)
            inc, alert, _ = pipeline.process(ev, received_at=wall + at, created_at=created, measure_latency=False)
            if ev.type == "vision" and alert is None:
                store.log_normal(inc)
    fusion_engine.clear()
    store.sensor_logs.clear()
    store.add_sensor_log("SYSTEM", "Reference history loaded · zone G2 under watch", "info")

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_seed()
    tasks = [asyncio.create_task(engine_loop()), asyncio.create_task(heartbeat_loop())]
    yield
    for t in tasks:
        t.cancel()

app = FastAPI(
    title="TriNetra Sentinel C2 Backend",
    version="2.0.0",
    description="Radar-triggered, camera-confirmed, zone-aware border alerting (demo build, simulated inputs)",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------- read API ----------
@app.get("/api/zone")
def get_zone():
    return zone_mgr.get_zone_data()

@app.get("/api/alerts")
def get_alerts():
    return list(store.alerts.values())

@app.get("/api/events")
def get_events(limit: int = 50):
    return store.events[-limit:]

@app.get("/api/nodes")
def get_nodes():
    return store.node_status

@app.get("/api/audit")
def get_audit(limit: int = 200):
    return store.audit_log[-limit:]

@app.get("/api/metrics")
def get_metrics():
    return store.metrics()

@app.get("/api/models/status")
def get_models_status():
    return {
        "vision": {"loaded": vision_adapter.is_model_loaded(),
                   "mode": "live_yolo" if vision_adapter.is_model_loaded() else "scenario_fallback",
                   "weights_path": str(vision_adapter.weights_file)},
        "radar": {"loaded": radar_adapter.is_model_loaded(),
                  "mode": "live_classifier" if radar_adapter.is_model_loaded() else "speed_rules",
                  "weights_path": str(radar_adapter.weights_file)},
        "anomaly": {"loaded": anomaly_adapter.is_model_loaded(),
                    "mode": "live_isolation_forest" if anomaly_adapter.is_model_loaded() else "zone_baseline",
                    "weights_path": str(anomaly_adapter.weights_file)},
    }

@app.get("/api/scenarios")
def get_scenarios():
    return scenario_player.list_scenarios()

# ---------- demo controls ----------
class RunScenarioRequest(BaseModel):
    speed: float = 1.0

@app.post("/api/scenarios/{name}/run")
async def run_scenario(name: str, req: RunScenarioRequest = RunScenarioRequest()):
    if not await scenario_player.play_scenario(name, speed_multiplier=req.speed):
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    store.log_audit("SCENARIO", name, "TRIGGER", f"Demo scenario '{name}' started", {"speed": req.speed})
    await ws_manager.broadcast({"type": "scenario_started", "scenario": name})
    return {"ok": True, "scenario": name}

@app.post("/api/demo/reset")
async def reset_demo():
    scenario_player.stop()
    for t in camera_timers.values():
        t.cancel()
    camera_timers.clear()
    drive_state.clear()
    scoring_engine.clear_feedback()
    load_seed()
    await ws_manager.broadcast({"type": "init", **snapshot_state()})
    return {"ok": True}

# ---------- drive-a-target (live demo mode) ----------
class DriveTarget(BaseModel):
    lat: float
    lon: float
    kind: Literal["person", "vehicle", "animal", "none"] = "person"
    count: int = 1
    clock: Literal["live", "night", "day"] = "night"

drive_state: Dict[str, Tuple[float, float, float]] = {}  # node -> (range_m, time, bearing)
DRIVE_LABEL = {"person": "person", "vehicle": "car", "animal": "none", "none": "none"}
DRIVE_SNAPSHOT = {"person": "/media/snapshots/thermal_intrusion_group.jpg",
                  "animal": "/media/snapshots/thermal_livestock.jpg"}
DRIVE_CLIP = {"person": "live_person", "vehicle": "live_vehicle", "animal": "animal"}
last_drive_pos: Dict[str, Tuple[float, float]] = {}

def drive_clock() -> Dict[str, datetime]:
    now = datetime.now(IST)
    return {"live": now,
            "night": now.replace(hour=2, minute=40),
            "day": now.replace(hour=10, minute=15)}

async def _camera_after_wake(ev: Event):
    await asyncio.sleep(1.2)
    await bus.publish(ev)

@app.post("/api/sim/target")
async def drive_target(t: DriveTarget):
    """Place or move a simulated target. Every radar wedge that covers it reports it, then its camera checks."""
    ts = drive_clock()[t.clock].isoformat()
    now = time.time()
    prev = last_drive_pos.get("target")
    heading = zone_mgr.bearing_deg(prev[0], prev[1], t.lat, t.lon) if prev else None
    last_drive_pos["target"] = (t.lat, t.lon)

    seen_by = []
    for node in zone_mgr.get_zone_data().get("nodes", []):
        if store.node_status.get(node["id"], {}).get("status") == "offline":
            continue
        hit = zone_mgr.radar_sees(node, t.lat, t.lon)
        if not hit:
            continue
        rng, brg = hit
        prev_rng = drive_state.get(node["id"])
        speed = 0.0
        if prev_rng and now - prev_rng[1] < 60:
            speed = max(-12.0, min(12.0, (rng - prev_rng[0]) / max(1.0, now - prev_rng[1])))
        drive_state[node["id"]] = (rng, now, brg)
        seen_by.append(node["id"])

        await bus.publish(Event(event_id=f"EV-{uuid.uuid4().hex[:6].upper()}", node_id=node["id"], type="radar",
                                ts=ts, source="sim", range_m=rng, bearing_deg=brg,
                                speed_mps=round(speed, 2) if speed else -1.2, confidence=0.85))
        label = DRIVE_LABEL[t.kind]
        asyncio.create_task(_camera_after_wake(Event(
            event_id=f"EV-{uuid.uuid4().hex[:6].upper()}", node_id=node["id"], type="vision", ts=ts, source="sim",
            label=label, count=t.count if label != "none" else 0, confidence=0.86 if label != "none" else 0.0,
            heading_deg=heading, lat=t.lat, lon=t.lon,
            snapshot=DRIVE_SNAPSHOT.get(t.kind), clip=DRIVE_CLIP.get(t.kind))))
        break  # nearest covering node handles it; one camera check per move

    return {"ok": True, "seen_by": seen_by}

# ---------- operator ----------
class ActionPayload(BaseModel):
    action: Literal["confirm", "dismiss", "escalate", "need_info", "track", "pending"]
    note: str = ""
    operator: str = OPERATOR

@app.post("/api/alerts/{alert_id}/actions")
async def record_action(alert_id: str, payload: ActionPayload):
    if payload.action in ("dismiss", "escalate") and not payload.note.strip():
        raise HTTPException(status_code=422, detail=f"A note is required to {payload.action}")
    alert = store.record_action(alert_id, payload.action, payload.note.strip() or payload.action, payload.operator)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if payload.action == "dismiss":
        inc = store.incidents.get(alert.incident_id)
        hour = 2
        if inc and inc.events:
            from app.engine.context import event_hour
            hour = event_hour(inc.events[-1])
        cls = (alert.detected_class or "unknown").split(" ")[0]
        scoring_engine.register_dismissal(alert.primary_node, hour, cls)

    await ws_manager.broadcast({"type": "alert_action", "data": alert.model_dump()})
    await broadcast_logs()
    await ws_manager.broadcast({"type": "metrics", "data": store.metrics()})
    return {"ok": True, "alert": alert}

class DronePayload(BaseModel):
    operator: str = OPERATOR

@app.post("/api/alerts/{alert_id}/drone")
async def deploy_drone(alert_id: str, payload: DronePayload = DronePayload()):
    """Operator-initiated only: nothing in the pipeline calls this automatically."""
    alert = store.alerts.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    bop = next((b for b in zone_mgr.get_zone_data().get("bops", []) if b["id"] == alert.bop_id), None)
    store.record_action(alert_id, "drone_check", "Drone sent for visual check (simulated)", payload.operator)
    video, _ = pipeline.clip_urls("drone_recon")
    await ws_manager.broadcast({
        "type": "drone_dispatch", "alert_id": alert_id,
        "bop_lat": bop["lat"] if bop else alert.lat, "bop_lon": bop["lon"] if bop else alert.lon,
        "target_lat": alert.lat, "target_lon": alert.lon, "eta_seconds": 6,
        "video_url": video, "snapshot": "/media/snapshots/drone_recon.jpg",
    })
    await ws_manager.broadcast({"type": "alert_action", "data": alert.model_dump()})
    await broadcast_logs()
    return {"ok": True, "status": "dispatched", "eta_seconds": 6}

# ---------- ingest (real or virtual nodes) ----------
@app.post("/api/ingest/event")
async def ingest_event(event: Event):
    await bus.publish(event)
    return {"ok": True, "event_id": event.event_id}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "init", **snapshot_state()})
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        ws_manager.disconnect(websocket)

# ---------- static ----------
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

if (WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")

@app.get("/")
def serve_index():
    index_file = WEB_DIST / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "TriNetra API running. Build the dashboard with `npm run build` in web/, or use `npm run dev`."}
