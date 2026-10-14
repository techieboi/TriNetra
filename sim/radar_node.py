"""
Virtual mmWave radar node.

Stands in for the hardware node: it sends exactly the JSON a real node would
POST to /api/ingest/event, so swapping in the real module changes nothing downstream.
Standard library only.

    python sim/radar_node.py --node N3 --walk --clock night   # walk a target in through the radar wedge
    python sim/radar_node.py --node N1 --heartbeat-only   # just keep the node alive
    python sim/radar_node.py --node N3 --walk --label none   # target the camera cannot confirm
"""
import argparse
import json
import random
import time
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

def post(base: str, payload: dict):
    req = urllib.request.Request(f"{base}/api/ingest/event", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())

CLOCK = {"mode": "live"}

def now_ts() -> str:
    now = datetime.now(IST)
    if CLOCK["mode"] == "night":
        now = now.replace(hour=2, minute=40)
    elif CLOCK["mode"] == "day":
        now = now.replace(hour=10, minute=15)
    return now.isoformat()

def event(node: str, type_: str, **fields) -> dict:
    return {"event_id": f"EV-{uuid.uuid4().hex[:6].upper()}", "node_id": node, "type": type_,
            "ts": now_ts(), "source": "sim", **fields}

def heartbeat(base: str, node: str, battery: int, signal: int):
    post(base, event(node, "heartbeat", battery=battery, signal_dbm=signal))

def walk(base: str, node: str, bearing: float, start_m: float, end_m: float, speed: float,
         rate_hz: float, label: str, count: int, camera_at_m: float):
    """Radar readings at rate_hz while the target closes in; one camera result once it is close enough."""
    rng = start_m
    camera_done = False
    dt = 1.0 / rate_hz
    while rng > end_m:
        reading = event(node, "radar", range_m=round(rng, 1), speed_mps=-speed,
                        bearing_deg=round(bearing + random.uniform(-1.5, 1.5), 1),
                        track_id="VT1", confidence=round(random.uniform(0.8, 0.93), 2))
        post(base, reading)
        print(f"radar  {node}  {rng:6.1f} m  -{speed:.1f} m/s  @ {reading['bearing_deg']}°")
        if not camera_done and rng <= camera_at_m:
            cam = event(node, "vision", label=label, count=count if label != "none" else 0,
                        confidence=0.86 if label != "none" else 0.0, heading_deg=(bearing + 180) % 360,
                        range_m=round(rng, 1), bearing_deg=bearing)
            post(base, cam)
            print(f"camera {node}  {label} ×{cam['count']}")
            camera_done = True
        rng -= speed * dt * 8  # 8x time compression so a 100 m walk takes ~10 s
        time.sleep(dt)

def main():
    ap = argparse.ArgumentParser(description="Virtual mmWave radar node for TriNetra")
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--node", default="N3")
    ap.add_argument("--walk", action="store_true", help="walk one target in through the wedge")
    ap.add_argument("--heartbeat-only", action="store_true")
    ap.add_argument("--bearing", type=float, default=40.0, help="absolute bearing of the track from the node")
    ap.add_argument("--start", type=float, default=240.0)
    ap.add_argument("--end", type=float, default=120.0)
    ap.add_argument("--speed", type=float, default=1.3, help="walking speed, m/s")
    ap.add_argument("--rate", type=float, default=5.0, help="radar readings per second")
    ap.add_argument("--label", default="person", help="what the camera will report (person, car, none)")
    ap.add_argument("--count", type=int, default=2)
    ap.add_argument("--camera-at", type=float, default=180.0, help="range at which the camera result arrives")
    ap.add_argument("--clock", choices=("live", "night", "day"), default="live",
                    help="time of day the zone check sees (live = real clock)")
    args = ap.parse_args()
    CLOCK["mode"] = args.clock

    heartbeat(args.base, args.node, battery=88, signal=-74)
    if args.walk:
        walk(args.base, args.node, args.bearing, args.start, args.end, args.speed,
             args.rate, args.label, args.count, args.camera_at)
    if args.heartbeat_only or not args.walk:
        print(f"heartbeating {args.node} every 10 s (Ctrl+C to stop; the node goes offline 30 s later)")
        battery = 88
        while True:
            time.sleep(10)
            heartbeat(args.base, args.node, battery, -74 + random.choice((-1, 0, 1)))

if __name__ == "__main__":
    main()
