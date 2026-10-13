from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
import uuid
from app.schema import Event, Incident, Alert, OperatorAction, AuditEntry, ReasonItem

class MemoryStore:
    def __init__(self):
        self.events: List[Event] = []
        self.incidents: Dict[str, Incident] = {}
        self.alerts: Dict[str, Alert] = {}
        self.audit_log: List[AuditEntry] = []
        self.sensor_logs: List[Dict[str, str]] = []
        
        self.node_status: Dict[str, Dict[str, Any]] = {
            "N1": {"status": "online", "battery": 91, "signal": "-71 dBm", "seen": "1 s", "name": "N1"},
            "N2": {"status": "online", "battery": 84, "signal": "-76 dBm", "seen": "1 s", "name": "N2"},
            "N3": {"status": "online", "battery": 67, "signal": "-82 dBm", "seen": "2 s", "name": "N3 · CAM 07"},
            "N4": {"status": "warning", "battery": 23, "signal": "-88 dBm", "seen": "4 s", "name": "N4 · CAM 12"},
        }
        self.init_reference_state()

    def init_reference_state(self):
        """Initializes data to match the reference C2 dashboard layout."""
        self.alerts.clear()
        self.sensor_logs = [
            {"time": "22:29:12", "source": "N4", "text": "Battery low (23%) · maintenance ticket opened", "type": "warning"},
            {"time": "22:31:31", "source": "N4", "text": "Seismic + PIR agree, no thermal lock · ALT-1139 · 65", "type": "info"},
            {"time": "22:33:48", "source": "N4", "text": "Heartbeat lost · node marked OFFLINE", "type": "warning"},
            {"time": "22:35:05", "source": "N3", "text": "Seismic: footfall pattern, 3 sources (81%)", "type": "info"},
            {"time": "22:35:06", "source": "N3", "text": "PIR: motion in zone A (88%)", "type": "info"},
            {"time": "22:35:09", "source": "CAM 07", "text": "Thermal: person ×3, heading 045° (94%)", "type": "info"},
            {"time": "22:35:09", "source": "FUSION", "text": "ALT-5408 raised · score 92 · HIGH", "type": "high"},
            {"time": "22:36:12", "source": "OPERATOR", "text": "CAM 07 viewed on ALT-5408 by Op. R. Sharma", "type": "operator"},
            {"time": "22:36:15", "source": "DR-02", "text": "Pre-flight check OK · ready for launch (86%)", "type": "drone"}
        ]

        # 1. Primary Highlight Alert ALT-5408
        self.alerts["ALT-5408"] = Alert(
            alert_id="ALT-5408",
            incident_id="INC-5408",
            bop_id="BOP-1",
            bop_name="BOP-1 (Forward)",
            distance_km=2.4,
            eta_minutes=6.0,
            score=92,
            ml_score=88,
            band="high",
            reasons=[
                ReasonItem(factor="Night-time, low-traffic sector", weight=30),
                ReasonItem(factor="Off authorised crossing route", weight=25),
                ReasonItem(factor="3 sensors agree (seismic, PIR, thermal)", weight=30),
                ReasonItem(factor="Group of 3 or more", weight=7),
            ],
            primary_node="N3 · CAM 07",
            lat=26.8540,
            lon=84.2270,
            source="sim",
            detected_class="Person ×3",
            detected_count=3,
            heading_deg=45.0,
            snapshot="/static/assets/thermal_intrusion_group.jpg",
            bounding_boxes=[[0.28, 0.35, 0.42, 0.78], [0.45, 0.32, 0.58, 0.81], [0.62, 0.38, 0.75, 0.84]],
            waveform_samples=[0.05, 0.08, 0.75, 0.92, 0.65, 0.12, 0.04, 0.06, 0.71, 0.88, 0.60, 0.10, 0.05, 0.07, 0.73, 0.89, 0.62, 0.08],
            confidence_breakdown={"Thermal": 0.94, "PIR": 0.88, "Seismic": 0.81},
            status="open",
            created_at="2 min ago"
        )

        # 2. ALT-1139 (Review 65)
        self.alerts["ALT-1139"] = Alert(
            alert_id="ALT-1139",
            incident_id="INC-1139",
            bop_id="BOP-1",
            bop_name="BOP-1 (Forward)",
            distance_km=2.8,
            eta_minutes=9.0,
            score=65,
            ml_score=62,
            band="review",
            reasons=[
                ReasonItem(factor="Night-time, low-traffic sector", weight=30),
                ReasonItem(factor="Off authorised crossing route", weight=25),
                ReasonItem(factor="Seismic + PIR agree, no thermal lock", weight=10),
            ],
            primary_node="N4 · CAM 12",
            lat=26.8530,
            lon=84.2360,
            source="sim",
            detected_class="Footsteps ×1",
            detected_count=1,
            heading_deg=350.0,
            waveform_samples=[0.02, 0.04, 0.55, 0.72, 0.45, 0.08, 0.02, 0.03, 0.52, 0.69, 0.40, 0.05],
            confidence_breakdown={"Seismic": 0.85, "PIR": 0.78},
            status="open",
            created_at="5 min ago"
        )

        # 3. ALT-DA8C (Review 52)
        self.alerts["ALT-DA8C"] = Alert(
            alert_id="ALT-DA8C",
            incident_id="INC-DA8C",
            bop_id="BOP-1",
            bop_name="BOP-1 (Forward)",
            distance_km=3.1,
            eta_minutes=10.0,
            score=52,
            ml_score=48,
            band="review",
            reasons=[
                ReasonItem(factor="Night-time, low-traffic sector", weight=30),
                ReasonItem(factor="Inside restricted zero-line zone", weight=15),
                ReasonItem(factor="Seismic footfall trigger", weight=7),
            ],
            primary_node="N4 · CAM 13",
            lat=26.8532,
            lon=84.2365,
            source="sim",
            detected_class="Footsteps ×1",
            detected_count=1,
            heading_deg=10.0,
            waveform_samples=[0.03, 0.05, 0.48, 0.61, 0.38, 0.07, 0.02, 0.04, 0.45, 0.58, 0.32, 0.06],
            confidence_breakdown={"Seismic": 0.79, "PIR": 0.65},
            status="open",
            created_at="11 min ago"
        )

        # 4. ALT-56A0 (Log 25)
        self.alerts["ALT-56A0"] = Alert(
            alert_id="ALT-56A0",
            incident_id="INC-56A0",
            bop_id="BOP-1",
            bop_name="BOP-1 (Forward)",
            distance_km=2.4,
            eta_minutes=0.0,
            score=25,
            ml_score=20,
            band="log",
            reasons=[
                ReasonItem(factor="Night-time, low-traffic sector", weight=30),
                ReasonItem(factor="Suppression: Livestock/wildlife detected", weight=-40),
                ReasonItem(factor="Off authorised crossing route", weight=25),
                ReasonItem(factor="PIR + Seismic triggered", weight=10),
            ],
            primary_node="N3 · CAM 07",
            lat=26.8540,
            lon=84.2270,
            source="sim",
            detected_class="Cattle ×2",
            detected_count=2,
            heading_deg=120.0,
            snapshot="/static/assets/thermal_livestock.jpg",
            waveform_samples=[0.04, 0.08, 0.35, 0.42, 0.31, 0.09, 0.05, 0.09, 0.38, 0.44, 0.29, 0.07],
            confidence_breakdown={"Thermal": 0.89, "Seismic": 0.62},
            status="open",
            created_at="18 min ago"
        )

        self.log_audit("SYSTEM", "SYS-BOOT", "INIT", "TriNetra G2-Gandak Sentinel Engine loaded reference baseline", {})

    def save_event(self, event: Event):
        self.events.append(event)
        node_id = event.node_id.replace("Z1-", "")
        if node_id in self.node_status:
            if event.type == "heartbeat_timeout":
                self.node_status[node_id]["status"] = "offline"
                self.add_sensor_log(node_id, f"Node offline · telemetry loss", "warning")
            else:
                self.node_status[node_id]["status"] = "online"
                self.node_status[node_id]["seen"] = "1 s"
                self.add_sensor_log(node_id, f"{event.type.capitalize()}: {event.label or 'trigger'} ({(event.confidence*100):.0f}%)", "info")

        self.log_audit(
            "SENSOR_INGEST",
            event.event_id,
            "EVENT_RECEIVED",
            f"Sensor event from {event.node_id}: {event.type} ({event.label or 'unclassified'})",
            event.model_dump()
        )

    def add_sensor_log(self, source: str, text: str, log_type: str = "info"):
        now_time = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.sensor_logs.append({"time": now_time, "source": source, "text": text, "type": log_type})
        if len(self.sensor_logs) > 60:
            self.sensor_logs.pop(0)

    def save_incident(self, inc: Incident):
        self.incidents[inc.incident_id] = inc

    def upsert_alert(self, alert: Alert):
        self.alerts[alert.alert_id] = alert
        self.add_sensor_log("FUSION", f"{alert.alert_id} raised · score {alert.score} · {alert.band.upper()}", "high" if alert.band == "high" else "info")
        self.log_audit(
            "ALERT_ENGINE",
            alert.alert_id,
            "ALERT_RAISED",
            f"Alert {alert.alert_id} ({alert.band.upper()}) routed to {alert.bop_name} [Score: {alert.score}]",
            {"score": alert.score, "band": alert.band, "bop": alert.bop_name, "distance_km": alert.distance_km}
        )

    def record_action(self, alert_id: str, action: str, note: str, operator: str = "Op. R. Sharma · Shift B") -> Optional[Alert]:
        alert = self.alerts.get(alert_id)
        if not alert:
            return None

        act_obj = OperatorAction(
            action_id=f"ACT-{uuid.uuid4().hex[:6].upper()}",
            alert_id=alert_id,
            action=action, # type: ignore
            note=note,
            operator=operator,
            ts=datetime.now(timezone.utc).isoformat()
        )
        alert.actions.append(act_obj)

        if action in ("confirm", "dismiss", "escalate"):
            alert.status = action # type: ignore
        elif action == "track":
            alert.status = "tracked"
        elif action == "pending":
            alert.status = "open"

        self.add_sensor_log("OPERATOR", f"Action {action.upper()} on {alert_id} by {operator}", "info")
        self.log_audit(
            "OPERATOR",
            alert_id,
            f"ACTION_{action.upper()}",
            f"Operator '{operator}' recorded decision '{action}': {note}",
            act_obj.model_dump()
        )
        return alert

    def log_audit(self, category: str, entity_id: str, action: str, summary: str, details: Dict[str, Any]):
        entry = AuditEntry(
            audit_id=f"AUD-{uuid.uuid4().hex[:6].upper()}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            actor=category,
            category=action,
            summary=summary,
            details=details
        )
        self.audit_log.append(entry)

    def reset(self):
        self.init_reference_state()

store = MemoryStore()
