import time
import uuid
from datetime import datetime, timezone, timedelta
from statistics import mean, median
from typing import List, Dict, Optional, Any
from app.schema import Event, Incident, Alert, OperatorAction, AuditEntry
from app.zone import zone_mgr

IST = timezone(timedelta(hours=5, minutes=30))

def ist_clock() -> str:
    return datetime.now(IST).strftime("%H:%M:%S")

class MemoryStore:
    def __init__(self):
        self.events: List[Event] = []
        self.incidents: Dict[str, Incident] = {}
        self.alerts: Dict[str, Alert] = {}
        self.audit_log: List[AuditEntry] = []
        self.sensor_logs: List[Dict[str, str]] = []
        self.node_status: Dict[str, Dict[str, Any]] = {}
        self.reset_nodes()

    def reset_nodes(self):
        now = time.time()
        batteries = {"N1": 91, "N2": 84, "N3": 67, "N4": 23}
        signals = {"N1": -71, "N2": -76, "N3": -82, "N4": -88}
        self.node_status = {
            n["id"]: {
                "name": n["name"],
                "camera": n.get("camera"),
                "status": "warning" if batteries.get(n["id"], 80) < 30 else "online",
                "battery": batteries.get(n["id"], 80),
                "signal_dbm": signals.get(n["id"], -75),
                "last_seen": now,
                "camera_state": "standby",
                "source": n.get("source_type", "sim"),
            }
            for n in zone_mgr.get_zone_data().get("nodes", [])
        }

    def reset(self):
        self.events.clear()
        self.incidents.clear()
        self.alerts.clear()
        self.audit_log.clear()
        self.sensor_logs.clear()
        self.reset_nodes()
        self.log_audit("SYSTEM", "SYS-BOOT", "INIT", "TriNetra G2 · Gandak engine started, baseline loaded", {})

    # ---------- nodes ----------
    def touch_node(self, node_id: str, battery: Optional[int] = None, signal_dbm: Optional[int] = None):
        node = self.node_status.get(node_id)
        if not node:
            return
        node["last_seen"] = time.time()
        if battery is not None:
            node["battery"] = battery
        if signal_dbm is not None:
            node["signal_dbm"] = signal_dbm
        if node["status"] == "offline":
            self.add_sensor_log(node_id, "Heartbeat restored · node back ONLINE", "info")
        node["status"] = "warning" if node["battery"] < 30 else "online"

    def mark_offline(self, node_id: str, reason: str):
        node = self.node_status.get(node_id)
        if not node or node["status"] == "offline":
            return False
        node["status"] = "offline"
        node["camera_state"] = "offline"
        self.add_sensor_log(node_id, f"{reason} · node marked OFFLINE, blind spot", "warning")
        self.log_audit("NODE_HEALTH", node_id, "NODE_OFFLINE", f"{node_id} offline: {reason}", {})
        return True

    def set_camera_state(self, node_id: str, state: str):
        node = self.node_status.get(node_id)
        if node and node["status"] != "offline":
            node["camera_state"] = state

    # ---------- events ----------
    def save_event(self, event: Event):
        self.events.append(event)
        if len(self.events) > 500:
            self.events.pop(0)
        node_id = event.node_id
        if event.type == "heartbeat_timeout":
            self.mark_offline(node_id, "Heartbeat lost")
            return
        if event.type == "heartbeat":
            self.touch_node(node_id, event.battery, event.signal_dbm)
            return

        self.touch_node(node_id)
        cam = (self.node_status.get(node_id) or {}).get("camera") or "CAM"
        if event.type == "radar":
            direction = "closing" if (event.speed_mps or 0) < 0 else "receding"
            self.add_sensor_log(node_id, f"Radar: target {event.range_m:.0f} m, {abs(event.speed_mps or 0):.1f} m/s {direction}", "info")
        elif event.type == "vision":
            label = event.label or "none"
            if label == "none":
                self.add_sensor_log(cam, "Thermal: no person or vehicle in frame", "info")
            else:
                self.add_sensor_log(cam, f"Thermal: {label} ×{event.count} ({event.confidence:.0%})", "info")
        else:
            self.add_sensor_log(node_id, f"{event.type.upper()}: {event.label or 'trigger'}", "info")

        self.log_audit("SENSOR_INGEST", event.event_id, "EVENT_RECEIVED",
                       f"{event.type} event from {node_id} ({event.label or 'unclassified'}) [{event.source}]",
                       event.model_dump())

    def add_sensor_log(self, source: str, text: str, log_type: str = "info"):
        self.sensor_logs.append({"time": ist_clock(), "source": source, "text": text, "type": log_type})
        if len(self.sensor_logs) > 80:
            self.sensor_logs.pop(0)

    # ---------- incidents & alerts ----------
    def save_incident(self, inc: Incident):
        self.incidents[inc.incident_id] = inc

    def upsert_alert(self, alert: Alert, is_new: bool):
        self.alerts[alert.alert_id] = alert
        if is_new:
            self.add_sensor_log("ZONE CHECK", f"{alert.alert_id} unusual · score {alert.score} · {alert.band.upper()} → {alert.bop_name}",
                                "high" if alert.band == "high" else "info")
            self.log_audit("ALERT_ENGINE", alert.alert_id, "ALERT_RAISED",
                           f"Alert {alert.alert_id} ({alert.band.upper()}) routed to {alert.bop_name} [Score: {alert.score}]",
                           {"score": alert.score, "band": alert.band, "bop": alert.bop_name,
                            "distance_km": alert.distance_km, "alert_latency_s": alert.alert_latency_s})

    def log_normal(self, inc: Incident):
        self.add_sensor_log("ZONE CHECK", f"{inc.incident_id} normal for zone · score {inc.score} · logged", "info")
        self.log_audit("ALERT_ENGINE", inc.incident_id, "LOGGED_NORMAL",
                       f"Incident {inc.incident_id} logged as normal activity [Score: {inc.score}]", {"score": inc.score})

    def record_action(self, alert_id: str, action: str, note: str, operator: str) -> Optional[Alert]:
        alert = self.alerts.get(alert_id)
        if not alert:
            return None
        act = OperatorAction(
            action_id=f"ACT-{uuid.uuid4().hex[:6].upper()}", alert_id=alert_id,
            action=action, note=note, operator=operator,  # type: ignore[arg-type]
            ts=datetime.now(IST).isoformat(),
        )
        alert.actions.append(act)
        if action in ("confirm", "dismiss", "escalate"):
            alert.status = {"confirm": "confirmed", "dismiss": "dismissed", "escalate": "escalated"}[action]  # type: ignore[assignment]
        elif action == "track":
            alert.status = "tracked"
        elif action in ("pending", "need_info"):
            alert.status = "open"

        log_type = "drone" if action == "drone_check" else "operator"
        self.add_sensor_log("OPERATOR", f"{action.replace('_', ' ').upper()} on {alert_id} by {operator}", log_type)
        self.log_audit("OPERATOR", alert_id, f"ACTION_{action.upper()}",
                       f"{operator} recorded '{action}': {note}", act.model_dump())
        return alert

    def log_audit(self, actor: str, entity_id: str, category: str, summary: str, details: Dict[str, Any]):
        self.audit_log.append(AuditEntry(
            audit_id=f"AUD-{uuid.uuid4().hex[:6].upper()}",
            timestamp=datetime.now(IST).isoformat(),
            actor=actor, category=category, summary=summary,
            details={"entity_id": entity_id, **details},
        ))

    # ---------- PRD success metrics ----------
    def metrics(self) -> Dict[str, Any]:
        live = [a for a in self.alerts.values() if a.alert_latency_s is not None]
        latencies = [a.alert_latency_s for a in live if a.alert_latency_s is not None]
        decided = [a for a in self.alerts.values() if a.status in ("confirmed", "dismissed", "escalated")]
        dismissed = [a for a in decided if a.status == "dismissed"]
        logged = [i for i in self.incidents.values() if i.band == "log" and any(e.type == "vision" for e in i.events)]
        return {
            "alerts_raised": len(live),
            "incidents_logged_normal": len(logged),
            "decided": len(decided),
            "dismissed": len(dismissed),
            "false_alarm_rate": round(len(dismissed) / len(decided), 3) if decided else None,
            "alert_time_s_avg": round(mean(latencies), 2) if latencies else None,
            "alert_time_s_median": round(median(latencies), 2) if latencies else None,
        }

store = MemoryStore()
