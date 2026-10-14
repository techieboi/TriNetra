# TRINETRA

> **Context-aware border watch for unfenced stretches of the India–Nepal border.**
> A radar node picks up movement, a thermal camera wakes and YOLO checks what it is, the zone check asks
> "is this unusual here, at this hour?", and only then is the nearest SSB outpost alerted. A human decides.
>
> 📄 [PRD](PRD.md) · 📋 [Functional requirements & build plan](WEBSITE_FUNCTIONAL_REQUIREMENTS_AND_PLAN.md)

```
radar trigger → camera wakes → YOLO detects → unusual for this zone? ─yes→ alert nearest SSB outpost → operator sends drone / decides
                                                                    └─no──→ log it, keep watching
```

**This is the demo build.** There is no hardware: every sensor input is simulated and labelled as such.
The simulated radar node sends exactly the JSON a real mmWave module would, so real hardware later only needs
to POST to `/api/ingest/event`.

---

## Run it

Needs **Python 3.10+** and **Node 18+**.

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

```bash
cd web
npm install
npm run build
cd ..
```

```bash
uvicorn app.main:app --port 8000
```

Open **http://localhost:8000**. API docs are at `/docs`.

**Developing the dashboard:** run the backend as above, then `npm run dev` in `web/` and open http://localhost:5173
(hot reload; `/api`, `/ws` and `/media` are proxied to port 8000).

**Tests:** `pip install -r requirements-dev.txt` then `pytest`. They check every scenario gives its expected result (intrusion 20 runs in a row).

> Windows tip: if `shapely` fails with "filename too long", the project path is too deep. Create the venv in a short path (e.g. `C:\venvs\trinetra`).

### Deploy (Render)

TriNetra is one long-running server (background engine loop, in-memory state, WebSocket push), so it needs a host
that keeps a process running. Serverless platforms such as Vercel don't, and the live demo breaks there.

1. In Render: **New → Blueprint**, pick this repo. `render.yaml` + `Dockerfile` do the rest (builds the dashboard, then runs uvicorn).
2. Keep it at **one instance**. A redeploy or restart resets the demo to its reference state.
3. The free plan sleeps after ~15 min idle (first load then takes 30–60 s). Open the page a few minutes before presenting, or switch `plan` to `starter`.

The same `Dockerfile` works on Railway or Fly.io.

---

## Demo walkthrough

The dashboard opens on just the map of zone G2, a slim navbar and a **LIVE** headline ticker. Nothing else shows until you ask for it:

- **Click a node or alert dot** on the map for a small card; **Details →** opens the full side panel.
- **Click a headline** in the ticker to jump to that alert or node.
- Navbar: **Layers** (overlays, dark/satellite), **time range**, **re-centre**, **🔔 alert queue**, **Demo**, **resync**, and **☰** for shift briefing, sensor health, activity log and audit trail.
- The pill at the bottom left (link · nodes online · open alerts) opens the matching list.

Open **Demo ▾** in the navbar.

| Button | What happens | Expected |
| :--- | :--- | :--- |
| 🚨 Night Intrusion | N3 radar tracks a group closing in at 02:40, CAM 07 wakes, YOLO sees 3 people + a motorcycle heading into territory | **HIGH 100**, alarm, routed to BOP-1 |
| 🚶 Market Crossing | N2 radar → CAM 05 sees 4 villagers on the authorised crossing at 10:15 | **Logged (5)**, no alert |
| 🐄 Stray Animal | N3 radar → CAM 07 sees no person or vehicle | **Logged (20)**, camera check stops the false alarm |
| 📶 Radar Only | N4 near-static radar flicker, CAM 12 sees nothing | **Logged (20)**, radar alone never alerts |
| 📡 Node Offline | N4 heartbeat lost | N4 and its wedge go grey, blind-spot warning |
| 🎯 Drive a target | Click the map to drop a person / vehicle / animal / clutter target; drag to move it | Whichever radar wedge covers it reports it and the full flow runs live |

Then click the alert (on the map or in the ticker) and open **Details →**:
1. **Summary** has the **pipeline strip** (which step decided what) and the decision buttons; **Why this score** lists every factor and weight.
2. **Camera & radar** has the **camera tile** (looping prerecorded clip, or a placeholder until clips are added) and the **radar scope**.
3. **Send drone for visual check**: operator click only; the drone flies from BOP-1 and the drone feed opens.
4. **Confirm threat** or **Dismiss** (note required); **⋯** holds **Escalate** (note required) and **Keep tracking**. Once decided, the buttons give way to one line saying who decided what. A dismissal lowers the score of similar future events.
5. The alert queue and **Shift briefing** track **alert time** (radar trigger to dashboard) and the **false-alarm rate** (dismissed / decided). **Audit trail** (☰ menu) shows every step.

Hotkeys: `S` satellite (default), `M` dark map, `Esc` closes the card, then the panel.

### Virtual radar node (stands in for the hardware)

```bash
python sim/radar_node.py --node N3 --walk --clock night
```

Walks a target in through N3's radar wedge, sending readings at 5 Hz and one camera result, through the same
ingest endpoint a real node would use. `--label none` makes the camera see nothing; `--heartbeat-only` just keeps the node alive.

---

## Adding the prerecorded clips

Drop `intrusion.mp4`, `market.mp4`, `animal.mp4`, `night_corridor.mp4`, `drone_recon.mp4` (and optionally
`live_person.mp4`, `live_vehicle.mp4`) into `data/media/clips/`. They play muted on loop in the alert's camera tile.
Optional `<clip>.json` files add per-frame YOLO boxes. See [data/media/clips/README.md](data/media/clips/README.md).

## Adding trained models

Drop weights into `app/ml/weights/` and restart: `vision_thermal.pt` (YOLO fine-tuned on HIT-UAV + LLVIP),
`baseline_iso.joblib` (zone anomaly Isolation Forest), optionally `radar_clf.joblib`.
`GET /api/models/status` shows what's live. See [app/ml/weights/README.md](app/ml/weights/README.md).

---

## Repository layout

```
app/
  main.py                 FastAPI app: engine loop, camera wake states, heartbeats, REST + WebSocket
  schema.py               Event / Incident / Alert models (one event schema for every input)
  zone.py                 Zone geometry: geofences, radar wedges, baseline routine, nearest BOP
  db.py                   In-memory store, audit log, PRD metrics
  engine/
    pipeline.py           The PRD flow, end to end
    fusion.py             Groups a radar track and its camera result into one incident
    context.py            What the sensors saw, where, and when
    scoring.py            Zone check: explainable factors, camera gate, bands, pipeline steps
    routing.py            Nearest SSB outpost, distance, QRT ETA
    scenario_player.py    Plays data/scenarios/*.yaml
  ml/                     Model adapters (vision, radar, anomaly) with fallbacks + weights/
data/
  zone.json               Sector G2 · Gandak: nodes + radar wedges, BOP, geofences, fiber line, baseline routine
  scenarios/              Demo scenarios
  seed/                   Reference history loaded on start / reset
  media/                  snapshots/ and clips/ (served at /media)
sim/radar_node.py         Virtual mmWave node
tests/                    Scenario outcome tests
web/                      React dashboard (Vite + TypeScript + Leaflet)
```

## Principles

- **Detect anomalies, not people.** No face recognition, identity or nationality inference anywhere.
- **Humans decide.** Alerts recommend; the operator confirms, dismisses, escalates and sends the drone.
- **Honest labels.** Simulated inputs, placeholders and prerecorded clips are always marked.
