import asyncio
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
import yaml
from app.schema import Event
from app.bus import bus

SCENARIOS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "scenarios"

class ScenarioPlayer:
    def __init__(self, scenarios_dir: Path = SCENARIOS_DIR):
        self.scenarios_dir = scenarios_dir
        self.current_task: Optional[asyncio.Task] = None
        self.active_scenario_name: Optional[str] = None
        self.is_playing: bool = False

    def list_scenarios(self) -> Dict[str, Any]:
        scenarios = {}
        for yml in self.scenarios_dir.glob("*.yaml"):
            try:
                with open(yml, "r", encoding="utf-8") as f:
                    content = yaml.safe_load(f)
                    scenarios[yml.stem] = {
                        "name": content.get("name", yml.stem),
                        "description": content.get("description", ""),
                        "clock": content.get("clock", ""),
                        "event_count": len(content.get("events", []))
                    }
            except Exception as e:
                print(f"Error loading {yml}: {e}")
        return scenarios

    async def play_scenario(self, scenario_name: str, speed_multiplier: float = 1.0) -> bool:
        scenario_file = self.scenarios_dir / f"{scenario_name}.yaml"
        if not scenario_file.exists():
            return False

        with open(scenario_file, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if self.current_task and not self.current_task.done():
            self.current_task.cancel()

        self.active_scenario_name = scenario_name
        self.is_playing = True
        self.current_task = asyncio.create_task(self._run_events(data, speed_multiplier))
        return True

    async def _run_events(self, data: Dict[str, Any], speed: float):
        try:
            base_clock = data.get("clock", "2026-10-12T02:40:00+05:30")
            events_def = data.get("events", [])
            last_delay = 0.0

            for ev_def in events_def:
                at_time = float(ev_def.get("at", 0.0))
                sleep_duration = max(0.0, (at_time - last_delay) / speed)
                if sleep_duration > 0:
                    await asyncio.sleep(sleep_duration)
                last_delay = at_time

                # Generate event
                ev = Event(
                    event_id=f"EV-{uuid.uuid4().hex[:6].upper()}",
                    node_id=ev_def.get("node", "Z1-N1"),
                    zone_id="Z1",
                    type=ev_def.get("type", "vibration"),
                    label=ev_def.get("label"),
                    confidence=float(ev_def.get("confidence", 0.9)),
                    count=int(ev_def.get("count", 1)),
                    heading_deg=float(ev_def["heading_deg"]) if "heading_deg" in ev_def else None,
                    ts=base_clock,
                    lat=float(ev_def.get("lat", 26.8512)),
                    lon=float(ev_def.get("lon", 84.2321)),
                    source=ev_def.get("source", "sim"),
                    snapshot=ev_def.get("snapshot")
                )
                await bus.publish(ev)

        except asyncio.CancelledError:
            pass
        finally:
            self.is_playing = False

scenario_player = ScenarioPlayer()
