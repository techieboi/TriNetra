from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
import uuid
from app.schema import Event, Incident, Alert, OperatorAction, AuditEntry

class MemoryStore:
    def __init__(self):
        self.events: List[Event] = []
        self.incidents: Dict[str, Incident] = {}
        self.alerts: Dict[str, Alert] = {}
        self.audit_log: List[AuditEntry] = []
        self.node_status: Dict[str, Dict[str, Any]] = {
            "Z1-N1": {"status": "online", "battery": 94, "last_seen": "just now", "name": "Alpha Node (Live Post)"},
            "Z1-N2": {"status": "online", "battery": 88, "last_seen": "just now", "name": "Bravo Node (Market Approach)"},
            "Z1-N3": {"status": "online", "battery": 91, "last_seen": "just now", "name": "Charlie Node (Forest Flank)"},
            "Z1-N4": {"status": "online", "battery": 76, "last_seen": "just now", "name": "Delta Node (Dry Riverbed)"},
        }
        self.log_audit("SYSTEM", "SYS-BOOT", "INIT", "TriNetra Sentinel Engine initialized in Software-First demo mode", {})

    def save_event(self, event: Event):
        self.events.append(event)
        # Update node status
        if event.node_id in self.node_status:
            if event.type == "heartbeat_timeout":
                self.node_status[event.node_id]["status"] = "offline"
                self.log_audit("SENSOR_NET", event.node_id, "NODE_OFFLINE", f"Telemetry loss on {event.node_id}", {"type": event.type})
            else:
                self.node_status[event.node_id]["status"] = "online"
                self.node_status[event.node_id]["last_seen"] = "active"

        self.log_audit(
            "SENSOR_INGEST",
            event.event_id,
            "EVENT_RECEIVED",
            f"Sensor event from {event.node_id}: {event.type} ({event.label or 'unclassified'})",
            event.model_dump()
        )

    def save_incident(self, inc: Incident):
        self.incidents[inc.incident_id] = inc

    def upsert_alert(self, alert: Alert):
        self.alerts[alert.alert_id] = alert
        self.log_audit(
            "ALERT_ENGINE",
            alert.alert_id,
            "ALERT_RAISED",
            f"Alert {alert.alert_id} ({alert.band.upper()}) routed to {alert.bop_name} [Score: {alert.score}]",
            {"score": alert.score, "band": alert.band, "bop": alert.bop_name, "distance_km": alert.distance_km}
        )

    def record_action(self, alert_id: str, action: str, note: str, operator: str = "Duty Commander") -> Optional[Alert]:
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
        self.events.clear()
        self.incidents.clear()
        self.alerts.clear()
        for k in self.node_status:
            self.node_status[k]["status"] = "online"
            self.node_status[k]["last_seen"] = "online"
        self.log_audit("SYSTEM", "SYS-RESET", "RESET", "Demo sandbox reset to pristine baseline", {})

store = MemoryStore()
