"""Each demo scenario must give its expected outcome every run (PRD: repeatable demo)."""
import time
import pytest
from app.db import store
from app.engine import pipeline
from app.engine.fusion import fusion_engine
from app.engine.scoring import scoring_engine
from app.engine.scenario_player import build_events, load_yaml, SCENARIOS_DIR

def run(name):
    store.reset()
    fusion_engine.clear()
    scoring_engine.clear_feedback()
    inc = alert = None
    t0 = time.time()
    for at, ev in build_events(load_yaml(SCENARIOS_DIR / f"{name}.yaml")):
        ev = pipeline.prepare_event(ev)
        store.save_event(ev)
        if ev.type in ("heartbeat", "heartbeat_timeout"):
            continue
        inc, a, _ = pipeline.process(ev, received_at=t0 + at)
        alert = a or alert
    return inc, alert

@pytest.mark.parametrize("_", range(20))
def test_intrusion_is_high(_):
    inc, alert = run("intrusion")
    assert alert is not None and alert.band == "high" and alert.score == 100
    assert alert.bop_id == "BOP-1"
    assert sum(r.weight for r in alert.reasons) == alert.score
    assert [p.status for p in alert.pipeline] == ["done", "done", "done", "yes", "done"]

@pytest.mark.parametrize("name", ["routine", "animal", "radar_only"])
def test_normal_activity_is_logged_not_alerted(name):
    inc, alert = run(name)
    assert alert is None
    assert inc.band == "log" and not inc.unusual
    assert sum(r.weight for r in inc.reasons) == inc.score
    assert inc.pipeline[3].status == "no"

def test_radar_alone_never_alerts():
    store.reset(); fusion_engine.clear()
    events = [e for _, e in build_events(load_yaml(SCENARIOS_DIR / "intrusion.yaml")) if e.type == "radar"]
    for ev in events:
        inc, alert, _ = pipeline.process(pipeline.prepare_event(ev))
        assert alert is None and inc.score < 40

def test_offline_marks_node():
    run("offline")
    assert store.node_status["N4"]["status"] == "offline"

def test_dismissal_lowers_rerun_score():
    _, first = run("intrusion")
    from app.engine.context import event_hour
    scoring_engine.register_dismissal(first.primary_node, 2, "person")
    store.reset(); fusion_engine.clear()
    t0 = time.time()
    for at, ev in build_events(load_yaml(SCENARIOS_DIR / "intrusion.yaml")):
        inc, a, _ = pipeline.process(pipeline.prepare_event(ev), received_at=t0 + at)
    assert inc.score < first.score
