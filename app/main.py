import asyncio
import json
from pathlib import Path
from typing import List, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.schema import Event, Alert, OperatorAction
from app.bus import bus
from app.db import store
from app.zone import zone_mgr
from app.engine.fusion import fusion_engine
from app.engine.context import context_evaluator
from app.engine.scoring import scoring_engine
from app.engine.routing import routing_engine
from app.engine.scenario_player import scenario_player

# Connection manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        dead_connections = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.add(connection)
        for dc in dead_connections:
            self.active_connections.discard(dc)

ws_manager = ConnectionManager()

# Background engine loop
async def engine_loop():
    while True:
        try:
            event: Event = await bus.queue.get()
            store.save_event(event)

            # Broadcast raw event & sensor logs to dashboard
            await ws_manager.broadcast({
                "type": "event",
                "data": event.model_dump()
            })
            await ws_manager.broadcast({
                "type": "sensor_logs",
                "data": store.sensor_logs
            })

            # Check if event is heartbeat timeout
            if event.type == "heartbeat_timeout":
                await ws_manager.broadcast({
                    "type": "node_update",
                    "data": store.node_status
                })
                continue

            # Process event through Fusion & Context Engine
            inc = fusion_engine.process_event(event)
            ctx = context_evaluator.evaluate(inc)
            score, band, reasons = scoring_engine.score(inc, ctx)

            inc.score = score
            inc.band = band # type: ignore
            inc.reasons = reasons
            store.save_incident(inc)

            # If score crosses review threshold (score >= 40), generate/update alert
            if band != "log":
                bop, dist_km, eta = routing_engine.route_incident(inc)
                alert_id = f"ALT-{inc.incident_id.replace('INC-', '')}"

                # Extract primary detected class
                detected_class = None
                if ctx.vision_labels:
                    detected_class = next(iter(ctx.vision_labels))
                elif event.label:
                    detected_class = event.label

                existing_alert = store.alerts.get(alert_id)
                actions = existing_alert.actions if existing_alert else []
                status = existing_alert.status if existing_alert else "open"

                alert = Alert(
                    alert_id=alert_id,
                    incident_id=inc.incident_id,
                    bop_id=bop["id"],
                    bop_name=bop["name"],
                    distance_km=dist_km,
                    eta_minutes=eta,
                    score=score,
                    band=band, # type: ignore
                    reasons=reasons,
                    primary_node=ctx.primary_node,
                    lat=ctx.primary_lat,
                    lon=ctx.primary_lon,
                    source=event.source,
                    detected_class=detected_class,
                    detected_count=ctx.max_count,
                    heading_deg=ctx.latest_heading,
                    snapshot=ctx.latest_snapshot or event.snapshot,
                    status=status,
                    actions=actions,
                    created_at=event.ts
                )
                store.upsert_alert(alert)

                # Broadcast live alert to connected command stations
                await ws_manager.broadcast({
                    "type": "alert",
                    "data": alert.model_dump()
                })

            # Broadcast updated node status
            await ws_manager.broadcast({
                "type": "node_update",
                "data": store.node_status
            })

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in engine loop: {e}")
            await asyncio.sleep(0.1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine_task = asyncio.create_task(engine_loop())
    yield
    engine_task.cancel()

app = FastAPI(
    title="TriNetra Sentinel C2 Backend",
    version="1.0.0",
    description="Context-Aware Border Early-Warning Intelligence Engine",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
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
def get_audit(limit: int = 100):
    return store.audit_log[-limit:]

@app.get("/api/scenarios")
def get_scenarios():
    return scenario_player.list_scenarios()

class RunScenarioRequest(BaseModel):
    speed: float = 1.0

@app.post("/api/scenarios/{name}/run")
async def run_scenario(name: str, req: RunScenarioRequest = RunScenarioRequest()):
    success = await scenario_player.play_scenario(name, speed_multiplier=req.speed)
    if not success:
        raise HTTPException(status_code=404, detail="Scenario not found")
    store.log_audit("SCENARIO", name, "TRIGGER", f"Demo scenario '{name}' initiated", {"speed": req.speed})
    await ws_manager.broadcast({
        "type": "scenario_started",
        "scenario": name
    })
    return {"ok": True, "scenario": name}

class ActionPayload(BaseModel):
    action: str
    note: str
    operator: str = "Duty Officer // Sector 4"

@app.post("/api/alerts/{alert_id}/actions")
async def record_action(alert_id: str, payload: ActionPayload):
    alert = store.record_action(alert_id, payload.action, payload.note, payload.operator)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await ws_manager.broadcast({
        "type": "alert_action",
        "data": alert.model_dump()
    })
    return {"ok": True, "alert": alert}

@app.post("/api/alerts/{alert_id}/drone")
async def deploy_drone(alert_id: str):
    alert = store.alerts.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    store.record_action(alert_id, "drone_check", "Autonomous UAV Recon dispatched to geofence", "Autonomous C2")
    await ws_manager.broadcast({
        "type": "drone_dispatch",
        "alert_id": alert_id,
        "target_lat": alert.lat,
        "target_lon": alert.lon,
        "status": "in_flight"
    })
    return {"ok": True, "status": "dispatched", "eta_seconds": 6}

@app.post("/api/demo/reset")
async def reset_demo():
    fusion_engine.clear()
    store.reset()
    await ws_manager.broadcast({"type": "reset"})
    return {"ok": True, "message": "Demo state reset to initial baseline"}

@app.post("/api/ingest/event")
async def ingest_live_event(event: Event):
    await bus.publish(event)
    return {"ok": True, "event_id": event.event_id}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial full state
        await websocket.send_json({
            "type": "init",
            "zone": zone_mgr.get_zone_data(),
            "nodes": store.node_status,
            "alerts": [a.model_dump() for a in store.alerts.values()],
            "events": [e.model_dump() for e in store.events[-20:]],
            "audit": [au.model_dump() for au in store.audit_log[-30:]],
            "sensor_logs": store.sensor_logs
        })
        while True:
            # Keep connection alive & handle incoming pings
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# Mount static directory for frontend
static_dir = Path(__file__).resolve().parent.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/")
def serve_index():
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "TriNetra Sentinel Engine Running. Place dashboard in /static"}
