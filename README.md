# TRINETRA // OSINT-C2 Sentinel

> **Context-Aware Border Early-Warning Command & Control System**  
> *Software-First Demo v1.0 — Inspired by Defense Intelligence & OSINT Project Osiris UI*

---

## 🛰️ Overview

On open, remote border tracts, movement is constant and normal. Thinly spread border outposts (BOPs) are frequently overwhelmed by single-sensor false alarms triggered by livestock, weather, or routine civilian traffic during market hours.

**TRINETRA** changes the paradigm:
- **Fuses Ground, Optical, and Simulated Aerial Signals:** Cross-modal agreement between geophones (vibration), passive infrared (PIR), and thermal/optical cameras.
- **Context Over Raw Detection:** Evaluates time-of-day baselines, designated crossing corridors, restricted zero-line riverbeds, group sizes, and movement trajectories.
- **Explainable AI (XAI) Scoring:** Every alert includes an itemized breakdown of exact positive and negative factors ($+30$ Night in quiet zone, $+25$ Off-route, $-40$ Wildlife suppression).
- **Automated Outpost Dispatch Routing:** Directly computes straight-line distance, compass heading vector, and Quick Response Team (QRT) intercept ETA to the nearest Border Outpost.

---

## 🎯 The Software-First Approach

In hackathon and early defense-tech prototypes, physical sensor hardware (breadboards, wires, batteries, RF transceivers) creates a high point-of-failure surface during live presentations.

TRINETRA’s core value is **not the sensor hardware, but the Contextual Intelligence Layer**:
- **Zero Demo Breakage:** Deterministic, timed scenario files (`data/scenarios/*.yaml`) guarantee 100% repeatability for judges.
- **Unified Event Contract:** Simulated nodes, live laptop webcams (YOLOv8), phone accelerometers (`/sensor`), and future ESP32 LoRa nodes emit the identical JSON event schema.
- **No Login / Registration:** Jumps directly into the tactical command center for immediate operational situational awareness.

---

## 🖥️ OSINT Project Osiris-Inspired UI Features

- **Tactical Dark Space Theme:** Military C2 console aesthetics with glassmorphic panels, HUD gridlines, and real-time telemetry coordinates.
- **Map-View & Satellite-View Switcher:**
  - **Map View:** CartoDB Dark Matter tactical vector layer.
  - **Satellite View:** High-resolution Esri World Imagery satellite layer for granular terrain and trail inspection.
  - **Hotkeys:** Press `[M]` for Map View or `[S]` for Satellite View.
- **Target Sector Z1 (Kali-Gandak Basin):** Small, focused operational bounding box ($\approx 1.5\text{ km}^2$, Lat 26.840–26.862° N, Lon 84.218–84.246° E).
- **Tactical Geofences:**
  - 🟢 **Authorized Market Crossing Corridor:** Open 08:00–18:00 ($-30$ threat modifier).
  - 🔴 **Restricted Zero-Line Riverbed:** Strict 24/7 zero-access zone ($+15$ threat modifier).
  - 🟡 **Forest Flank Track:** Unmonitored night infiltration route ($+25$ threat modifier).
- **Sensor Nodes & Outpost:** Live pulse rings on sensor nodes (`Z1-N1` through `Z1-N4`), concentric security perimeter rings around `BOP Sutlej (Forward HQ)`.
- **Explainable Threat Inspector:**
  - Radial score gauge ($0–100$) and severity badges (`HIGH`, `REVIEW`, `LOG`).
  - Itemized factor weight tally.
  - FLIR white-hot thermal snapshot viewer with detection labels.
  - Real-time animated canvas seismic frequency waveform visualizer.
  - Tactical BOP intercept distance and QRT ETA.
  - Operator triage actions (`CONFIRM & DISPATCH`, `DISMISS`, `ESCALATE`, `DRONE RECON`).
- **Simulated Autonomous Drone Recon:** UAV flight animation from BOP to alert coordinates with simulated aerial thermal HUD feed modal.
- **Append-Only Audit Trail:** Tamper-evident, timestamped decision and sensor event log.

---

## 🚀 Step-by-Step Setup & Running Guide

### 1. Prerequisites
- **Python 3.10+** (Python 3.11 or 3.12 recommended)
- **Git**
- A modern browser (Chrome, Edge, Firefox, or Safari)

### 2. Clone the Repository
```bash
git clone https://github.com/techieboi/TriNetra.git
cd TriNetra
```

### 3. Create and Activate Virtual Environment

**Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```
*(If PowerShell restricts scripts, run `.venv\Scripts\activate.bat` in CMD or run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

**Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Launch the TriNetra Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Open the Tactical Dashboard
Open your web browser and navigate to:
```
http://localhost:8000
```

- **Live Dashboard:** [http://localhost:8000](http://localhost:8000)
- **Interactive REST API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Raw Zone Telemetry Endpoint:** [http://localhost:8000/api/zone](http://localhost:8000/api/zone)

---

## 🎮 How to Test & Demo (Walkthrough)

### 1. Toggle Map vs. Satellite Imagery
- Look at the top-left HUD over the map.
- Click **SATELLITE VIEW** (or press `[S]`) to inspect satellite terrain imagery.
- Click **MAP VIEW** (or press `[M]`) to switch back to the tactical dark vector map.

### 2. Run Demo Scenarios (Bottom Command Bar)
Click any scenario button on the bottom HUD to test the context engine live:

| Button | Scenario | What Happens | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **🚨 NIGHT INTRUSION** | 3 infiltrators + motorcycle off-route at 02:40 AM | Charlie Node (`Z1-N3`) detects vibration, PIR, and thermal vision | **Score 100 (HIGH ALERT)**. Alarm sounds, routes to BOP Sutlej (1.48 km, ETA 5.9 min). |
| **🚶 MARKET CROSSING** | 4 villagers on crossing corridor at 10:15 AM | Bravo Node (`Z1-N2`) detects footsteps and pedestrians | **Score 25 (LOG ONLY)**. Daytime market crossing rule suppresses alert; **0 false alarms**. |
| **🐄 STRAY ANIMAL** | Livestock grazing near forest edge at 23:30 | Charlie Node (`Z1-N3`) detects movement; vision confirms cow | **Score 45 (REVIEW BAND)**. Animal suppression ($-40$) prevents high-priority alarm. |
| **⚠️ SINGLE SENSOR** | Lone geophone vibration off-route at 02:00 AM | Delta Node (`Z1-N4`) detects vibration with no visual/PIR consensus | **Score 65 (REVIEW ONLY)**. Hard safety cap prevents lone sensor from raising High Alert. |
| **📡 NODE OFFLINE** | Delta Node heartbeat drops | Sudden loss of telemetry | Node turns grey on the map; blind-spot warning issued. |

### 3. Triage an Alert
1. In the left **Threat Queue**, click on `ALT-... (HIGH)`.
2. Review the **Explainable AI Factors** in the right-hand panel.
3. Observe the **Optical/Thermal FLIR Snapshot** and live **Seismic Waveform Canvas**.
4. Enter a note and click **CONFIRM & DISPATCH**, **DISMISS**, or **ESCALATE COMMAND**.
5. Click **DRONE RECON** to dispatch an autonomous UAV reconnaissance flight and open the aerial FLIR feed modal.
6. Click **AUDIT TRAIL** on the top header to inspect the complete append-only event record.

---

## 📁 Repository Structure

```
TriNetra/
├── app/                        # FastAPI Backend & Intelligence Core
│   ├── main.py                 # FastAPI application, routes, WebSocket manager
│   ├── schema.py               # Pydantic data models (Event, Alert, Incident, Action)
│   ├── db.py                   # In-memory store & append-only audit logger
│   ├── bus.py                  # Asynchronous event bus (asyncio.Queue)
│   ├── zone.py                 # Shapely geo-math, geofencing & Haversine distance
│   └── engine/
│       ├── fusion.py           # Spatio-temporal event fusion (10s / 400m window)
│       ├── context.py          # Baseline evaluator (time of day, routes, geofences)
│       ├── scoring.py          # Explainable threat scoring & single-sensor safety cap
│       ├── routing.py          # Nearest BOP routing & QRT ETA calculator
│       └── scenario_player.py  # Asynchronous scenario player for YAML definitions
├── data/
│   ├── zone.json               # Sector Z1 coordinates, nodes, BOPs, and geofences
│   ├── scenarios/              # intrusion.yaml, routine.yaml, animal.yaml, single_sensor.yaml, offline.yaml
│   └── snapshots/              # Thermal and surveillance demonstration imagery
├── static/                     # Frontend OSINT Dashboard
│   ├── index.html              # Project Osiris-styled Command & Control dashboard
│   ├── style.css               # Tactical dark theme styling & glassmorphic layout
│   ├── app.js                  # Leaflet mapping, WebSocket sync, waveform animation, UI logic
│   └── assets/                 # FLIR thermal and aerial drone reconnaissance imagery
├── requirements.txt            # Python dependencies
├── .gitignore                  # Git ignore rules (.venv, caches, etc.)
└── README.md                   # Project documentation
```

---

## 🔮 Hardware Upgrade Roadmap

| Phase | Component | Software Integration |
| :--- | :--- | :--- |
| **Phase 1 (Current)** | Software-First Prototype | Virtual nodes + YAML scenarios + WebSocket dashboard |
| **Phase 2** | Live Physical Inputs | Laptop webcam (YOLOv8) + smartphone accelerometer (`/sensor`) |
| **Phase 3** | ESP32 Hardware Nodes | Geophone + HC-SR501 PIR publishing to Mosquitto MQTT broker bridge |
| **Phase 4** | Field Defense Edge | LoRa SX1276 long-range mesh gateway + Jetson Nano thermal vision |

---

## ⚖️ Safeguards & Privacy (FR-31 / NFR-5)
- **Zero Facial Recognition:** TRINETRA detects object classes (`person`, `vehicle`, `cow`), never individual identities or demographic attributes.
- **Human-in-the-Loop:** No autonomous kinetic or dispatch action leaves the system without human operator confirmation.
- **Honesty in Demonstration:** All simulated, replayed, and live sources are clearly flagged across the UI.