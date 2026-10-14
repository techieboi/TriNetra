import asyncio
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import yaml
from app.schema import Event
from app.bus import bus

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SCENARIOS_DIR = DATA_DIR / "scenarios"
SEED_DIR = DATA_DIR / "seed"

EVENT_FIELDS = ("label", "heading_deg", "lat", "lon", "range_m", "speed_mps", "bearing_deg",
                "track_id", "snapshot", "clip", "bounding_boxes", "battery", "signal_dbm")

def load_yaml(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def build_events(data: Dict[str, Any]) -> List[Tuple[float, Event]]:
    """Turn a scenario file into (offset_seconds, Event) pairs. Event time = scenario clock + offset."""
    base = datetime.fromisoformat(data.get("clock", "2026-10-12T02:40:00+05:30"))
    out = []
    for d in data.get("events", []):
        at = float(d.get("at", 0.0))
        fields = {k: d[k] for k in EVENT_FIELDS if k in d}
        out.append((at, Event(
            event_id=f"EV-{uuid.uuid4().hex[:6].upper()}",
            node_id=str(d.get("node", "N1")),
            type=d.get("type", "radar"),
            confidence=float(d.get("confidence", 0.9)),
            count=int(d.get("count", 1)),
            ts=(base + timedelta(seconds=at)).isoformat(),
            source=d.get("source", "sim"),
            **fields,
        )))
    return out

class ScenarioPlayer:
    def __init__(self, scenarios_dir: Path = SCENARIOS_DIR):
        self.scenarios_dir = scenarios_dir
        self.current_task: Optional[asyncio.Task] = None
        self.active_scenario_name: Optional[str] = None

    def list_scenarios(self) -> Dict[str, Any]:
        scenarios = {}
        for yml in sorted(self.scenarios_dir.glob("*.yaml")):
            try:
                content = load_yaml(yml)
                scenarios[yml.stem] = {
                    "name": content.get("name", yml.stem),
                    "description": content.get("description", ""),
                    "expected": content.get("expected", ""),
                    "clock": content.get("clock", ""),
                    "event_count": len(content.get("events", [])),
                }
            except Exception as e:
                print(f"Error loading {yml}: {e}")
        return scenarios

    async def play_scenario(self, scenario_name: str, speed_multiplier: float = 1.0) -> bool:
        scenario_file = self.scenarios_dir / f"{scenario_name}.yaml"
        if not scenario_file.exists():
            return False
        events = build_events(load_yaml(scenario_file))
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
        self.active_scenario_name = scenario_name
        self.current_task = asyncio.create_task(self._run(events, max(0.1, speed_multiplier)))
        return True

    async def _run(self, events: List[Tuple[float, Event]], speed: float):
        try:
            last = 0.0
            for at, ev in events:
                await asyncio.sleep(max(0.0, (at - last) / speed))
                last = at
                await bus.publish(ev)
        except asyncio.CancelledError:
            pass

    def stop(self):
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()

scenario_player = ScenarioPlayer()
