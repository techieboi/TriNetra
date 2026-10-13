// TRINETRA // BORDER SENSOR FUSION v1.4.2
// Exact Reference Tactical C2 Dashboard Controller

(function () {
  'use strict';

  // Application State
  const state = {
    zone: null,
    nodes: {},
    alerts: [],
    selectedAlertId: 'ALT-5408',
    sensorLogs: [],
    auditLogs: [],
    currentBaseLayer: 'satellite',
    activeFilter: 'high',
    wsConnected: false,
    dismissingAlertId: null,
    activeDroneAnimation: null
  };

  // Map References
  let map = null;
  let darkMapLayer = null;
  let satelliteLayer = null;
  let mapLayers = {
    border: null,
    zones: null,
    nodes: null,
    bop: null,
    threat: null,
    bearings: null,
    drone: null
  };

  // DOM Elements
  const el = {
    queueList: document.getElementById('queue-list-items'),
    activeCount: document.getElementById('active-alert-count'),
    filterBtns: document.querySelectorAll('.queue-filters .filter-btn'),
    healthTableBody: document.getElementById('health-table-body'),
    sensorLogBox: document.getElementById('sensor-log-box'),
    cursorCoords: document.getElementById('map-cursor-coords'),
    mapAlertBanner: document.getElementById('map-alert-banner'),
    btnMapView: document.getElementById('btn-map-view'),
    btnSatelliteView: document.getElementById('btn-satellite-view'),
    headerLinkStatus: document.getElementById('header-link-status'),
    linkStatusText: document.getElementById('link-status-text'),
    btnAuditTrail: document.getElementById('btn-audit-trail'),
    modalAudit: document.getElementById('modal-audit-trail'),
    btnCloseAudit: document.getElementById('btn-close-audit-modal'),
    auditTbody: document.getElementById('audit-modal-tbody'),
    btnOpenCameras: document.getElementById('btn-open-cameras'),
    camViewportBox: document.getElementById('cam-viewport-box'),
    camBoxesOverlay: document.getElementById('cam-boxes-overlay'),
    modalCam: document.getElementById('modal-cam-view'),
    btnCloseCam: document.getElementById('btn-close-cam-modal'),
    modalFeedImg: document.getElementById('modal-feed-img'),
    modalCamTime: document.getElementById('modal-cam-time'),
    modalDrone: document.getElementById('modal-drone-recon'),
    btnCloseDrone: document.getElementById('btn-close-drone-modal'),
    modalDismiss: document.getElementById('modal-dismiss-reason'),
    btnCloseDismiss: document.getElementById('btn-close-dismiss-modal'),
    btnCancelDismiss: document.getElementById('btn-cancel-dismiss'),
    btnConfirmDismiss: document.getElementById('btn-confirm-dismiss'),
    dismissInput: document.getElementById('dismiss-note-input'),
    btnActionPending: document.getElementById('btn-action-pending'),
    btnActionTrack: document.getElementById('btn-action-track'),
    btnActionConfirm: document.getElementById('btn-action-confirm'),
    btnActionDismiss: document.getElementById('btn-action-dismiss'),
    btnActionEscalate: document.getElementById('btn-action-escalate'),
    btnActionDispatch: document.getElementById('btn-action-dispatch'),
    btnToggleDemo: document.getElementById('btn-toggle-demo-drawer'),
    demoBar: document.getElementById('demo-controls-bar'),
    btnResetSandbox: document.getElementById('btn-reset-sandbox'),
    selSpeed: document.getElementById('sel-scenario-speed'),
    clockIst: document.getElementById('clock-ist'),
    seismicCanvas: document.getElementById('seismic-waveform-canvas'),
    waveformFreqTag: document.getElementById('waveform-freq-tag')
  };

  // Audio Tactical Alarm Synthesizer (Web Audio API)
  let audioCtx = null;
  function playTacticalAlarm() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // Audio playback silently suppressed if blocked by user gesture
    }
  }

  // 1. Initialize Tactical Leaflet Map
  function initMap() {
    const center = [26.8525, 84.2295];

    map = L.map('c2-leaflet-map', {
      center: center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    darkMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    });

    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18
    });

    satelliteLayer.addTo(map);

    mapLayers.border = L.layerGroup().addTo(map);
    mapLayers.zones = L.layerGroup().addTo(map);
    mapLayers.bearings = L.layerGroup().addTo(map);
    mapLayers.nodes = L.layerGroup().addTo(map);
    mapLayers.bop = L.layerGroup().addTo(map);
    mapLayers.threat = L.layerGroup().addTo(map);
    mapLayers.drone = L.layerGroup().addTo(map);

    map.on('mousemove', function (e) {
      if (el.cursorCoords) {
        const mgrsGrid = `MGRS 45R TK ${Math.round(e.latlng.lat * 850)} ${Math.round(e.latlng.lng * 870)}`;
        el.cursorCoords.innerHTML = `${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E &nbsp; ${mgrsGrid}`;
      }
    });

    setupMapSwitcher();
  }

  function setupMapSwitcher() {
    el.btnMapView?.addEventListener('click', () => setBaseLayer('map'));
    el.btnSatelliteView?.addEventListener('click', () => setBaseLayer('satellite'));

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'm' || e.key === 'M') setBaseLayer('map');
      if (e.key === 's' || e.key === 'S') setBaseLayer('satellite');
      if (e.key === 'Escape') {
        el.modalCam?.classList.remove('active');
        el.modalAudit?.classList.remove('active');
        el.modalDrone?.classList.remove('active');
        el.modalDismiss?.classList.remove('active');
      }
    });
  }

  function setBaseLayer(type) {
    if (state.currentBaseLayer === type) return;

    if (type === 'satellite') {
      map.removeLayer(darkMapLayer);
      map.addLayer(satelliteLayer);
      el.btnSatelliteView?.classList.add('active');
      el.btnMapView?.classList.remove('active');
      state.currentBaseLayer = 'satellite';
    } else {
      map.removeLayer(satelliteLayer);
      map.addLayer(darkMapLayer);
      el.btnMapView?.classList.add('active');
      el.btnSatelliteView?.classList.remove('active');
      state.currentBaseLayer = 'map';
    }
  }

  // 2. Render Zone Elements, Borders & BOPs
  function renderZoneOnMap(zoneData) {
    state.zone = zoneData;
    mapLayers.border.clearLayers();
    mapLayers.zones.clearLayers();
    mapLayers.nodes.clearLayers();
    mapLayers.bop.clearLayers();

    // 2a. Indicative International Border
    if (zoneData.international_border) {
      L.polyline(zoneData.international_border, {
        color: '#60a5fa',
        weight: 1.8,
        dashArray: '5, 6',
        opacity: 0.75
      }).addTo(mapLayers.border);

      L.marker([26.8565, 84.2280], {
        icon: L.divIcon({
          className: 'border-line-label',
          html: 'International border (indicative)',
          iconSize: [210, 20],
          iconAnchor: [60, 10]
        })
      }).addTo(mapLayers.border);
    }

    // 2b. Geofence Zones
    (zoneData.geofences || []).forEach(gf => {
      const poly = L.polygon(gf.polygon, {
        color: gf.color,
        weight: 1.5,
        dashArray: '4, 6',
        fillColor: gf.color,
        fillOpacity: 0.14
      }).addTo(mapLayers.zones);

      poly.bindTooltip(`${gf.name} · ${gf.kind}`, { className: 'tactical-tooltip', sticky: true });
    });

    // 2c. BOP (Forward Outpost)
    (zoneData.bops || []).forEach(bop => {
      const bopIcon = L.divIcon({
        className: 'bop-marker-wrap',
        html: `
          <div style="width:26px; height:26px; border-radius:50%; background:rgba(37,99,235,0.3); border:1.5px solid #3b82f6; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px #3b82f6;">
            <span style="font-size:9px; font-weight:800; color:#fff;">BOP</span>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([bop.lat, bop.lon], { icon: bopIcon }).addTo(mapLayers.bop);

      // Security perimeter ring around BOP
      L.circle([bop.lat, bop.lon], {
        radius: 600,
        color: '#3b82f6',
        weight: 1,
        dashArray: '4, 8',
        fill: false,
        opacity: 0.4
      }).addTo(mapLayers.bop);
    });

    // 2d. Nodes (N1, N2, N3, N4)
    (zoneData.nodes || []).forEach(node => {
      const isOffline = (state.nodes[node.id] && state.nodes[node.id].status === 'offline') || (node.id === 'N4' && state.nodes[node.id]?.status !== 'online');

      const icon = L.divIcon({
        className: 'node-marker-wrap',
        html: `
          <div class="node-circle-marker">
            <div class="node-circle-outer ${isOffline ? 'offline' : ''}">
              ${node.id}
            </div>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const m = L.marker([node.lat, node.lon], { icon: icon }).addTo(mapLayers.nodes);
      m.on('click', () => {
        const matched = state.alerts.find(a => a.primary_node.includes(node.id));
        if (matched) selectAlert(matched.alert_id);
      });
    });

    renderThreatOnMap();
  }

  // 2e. Render Threat Radar Marker & Triangulation
  function renderThreatOnMap() {
    mapLayers.threat.clearLayers();
    mapLayers.bearings.clearLayers();

    const curr = state.alerts.find(a => a.alert_id === state.selectedAlertId) || state.alerts[0];
    if (!curr || !curr.lat || !curr.lon) return;

    const threatIcon = L.divIcon({
      className: 'threat-marker-wrap',
      html: `
        <div class="threat-pulse-ring"></div>
        <div class="threat-center-dot"></div>
        <div class="threat-tag-label">${curr.alert_id} · ${curr.detected_class || 'Person ×3'} · ${Math.round(curr.heading_deg || 45)}°</div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    L.marker([curr.lat, curr.lon], { icon: threatIcon }).addTo(mapLayers.threat);

    // Vector heading ray
    const heading = (curr.heading_deg || 45) * (Math.PI / 180);
    const dist = 0.003;
    const endLat = curr.lat + dist * Math.cos(heading);
    const endLon = curr.lon + dist * Math.sin(heading);

    L.polyline([[curr.lat, curr.lon], [endLat, endLon]], {
      color: curr.band === 'high' ? '#ef4444' : '#f59e0b',
      weight: 2,
      opacity: 0.9
    }).addTo(mapLayers.threat);

    // Triangulation lines from active reporting nodes
    if (state.zone && state.zone.nodes) {
      state.zone.nodes.forEach(node => {
        const isOffline = (state.nodes[node.id] && state.nodes[node.id].status === 'offline');
        if (!isOffline) {
          L.polyline([[node.lat, node.lon], [curr.lat, curr.lon]], {
            color: '#f87171',
            weight: 1.2,
            dashArray: '3, 6',
            opacity: 0.5
          }).addTo(mapLayers.bearings);
        }
      });
    }
  }

  // 3. Render Alert Queue (Left Column)
  function renderAlertQueue() {
    const filtered = state.alerts.filter(a => {
      if (state.activeFilter === 'all') return true;
      return a.band === state.activeFilter;
    });

    const activeCount = state.alerts.filter(a => (a.band === 'high' || a.band === 'review') && a.status !== 'dismissed').length;
    if (el.activeCount) el.activeCount.textContent = `${activeCount} active`;

    if (!el.queueList) return;

    el.queueList.innerHTML = filtered.map(a => {
      const isSelected = a.alert_id === state.selectedAlertId;
      const targetText = a.detected_class || 'Person ×3';
      const nodeCamText = a.primary_node || 'N3 · CAM 07';
      const etaText = a.eta_minutes > 0 ? `ETA ${Math.round(a.eta_minutes)} min` : 'ETA 6 min';
      const statusLabel = a.status ? a.status.toUpperCase() : 'PENDING';
      const statusColor = a.status === 'confirmed' ? '#4ade80' : (a.status === 'dismissed' ? '#94a3b8' : '#fbbf24');

      return `
        <div class="queue-card ${isSelected ? 'selected' : ''}" data-id="${a.alert_id}">
          <div class="queue-card-row1">
            <span class="queue-card-id">${a.alert_id}</span>
            <span class="badge-tag ${a.band}">${a.band.toUpperCase()} · ${a.score}</span>
          </div>
          <div class="queue-card-row2">
            <span>${targetText}</span>
            <span>${nodeCamText}</span>
          </div>
          <div class="queue-card-row3">
            <span>${a.created_at || 'Just now'}</span>
            <span>${etaText}</span>
          </div>
          <div class="queue-card-status-row">
            <span class="amber-dot" style="background:${statusColor};"></span> Status: <span style="color:${statusColor}; font-weight:600;">${statusLabel}</span>
          </div>
        </div>
      `;
    }).join('');

    el.queueList.querySelectorAll('.queue-card').forEach(card => {
      card.addEventListener('click', () => {
        selectAlert(card.getAttribute('data-id'));
      });
    });

    updateHighAlertBanner();
  }

  function updateHighAlertBanner() {
    if (!el.mapAlertBanner) return;
    const topHigh = state.alerts.find(a => a.band === 'high' && a.status !== 'dismissed');
    if (topHigh) {
      el.mapAlertBanner.style.display = 'flex';
      el.mapAlertBanner.querySelector('.alert-banner-tag').textContent = `${topHigh.alert_id} · ${topHigh.score}`;
      el.mapAlertBanner.onclick = () => selectAlert(topHigh.alert_id);
    } else {
      el.mapAlertBanner.style.display = 'none';
    }
  }

  function selectAlert(alertId) {
    state.selectedAlertId = alertId;
    renderAlertQueue();
    renderThreatOnMap();

    const target = state.alerts.find(a => a.alert_id === alertId);
    if (target) {
      renderAlertDetail(target);
      if (map && target.lat && target.lon) {
        map.panTo([target.lat, target.lon], { animate: true, duration: 0.6 });
      }
    }
  }

  // 4. Render Active Threat Detail (Right Column)
  function renderAlertDetail(alert) {
    const idEl = document.getElementById('detail-id');
    if (idEl) idEl.textContent = alert.alert_id;

    const badgeEl = document.getElementById('detail-badge');
    if (badgeEl) {
      badgeEl.textContent = `${alert.band.toUpperCase()} · ${alert.score}`;
      badgeEl.className = `threat-badge ${alert.band}`;
    }

    const targetEl = document.getElementById('detail-target');
    if (targetEl) targetEl.textContent = alert.detected_class || 'Person ×3';

    const seenEl = document.getElementById('detail-seen');
    if (seenEl) seenEl.innerHTML = `${alert.created_at || 'Just now'} <span class="meta-time-sub">IST</span>`;

    const headingEl = document.getElementById('detail-heading');
    if (headingEl) {
      const hdg = Math.round(alert.heading_deg || 45);
      headingEl.textContent = `${String(hdg).padStart(3, '0')}° · ${getCardinal(hdg)}`;
    }

    const nodeEl = document.getElementById('detail-node');
    if (nodeEl) nodeEl.textContent = alert.primary_node || 'N3 · CAM 07';

    const distEl = document.getElementById('detail-dist');
    if (distEl) distEl.textContent = `${alert.distance_km || 2.4} km`;

    const etaEl = document.getElementById('detail-eta');
    if (etaEl) etaEl.textContent = alert.eta_minutes > 0 ? `${Math.round(alert.eta_minutes)} min` : '6 min';

    const camFeedTitle = document.getElementById('cam-feed-title');
    if (camFeedTitle) {
      camFeedTitle.textContent = alert.primary_node.includes('CAM') ? alert.primary_node.split('·')[1].trim() + ' · Thermal' : 'CAM 07 · Thermal';
    }

    const liveImg = document.getElementById('live-thermal-feed');
    if (liveImg && alert.snapshot) {
      liveImg.src = alert.snapshot;
    }

    // Render Bounding Boxes Overlay
    renderBoundingBoxes(alert.bounding_boxes, alert.detected_class);

    // Why this score breakdown
    const rowsBox = document.getElementById('why-score-rows');
    if (rowsBox) {
      rowsBox.innerHTML = (alert.reasons || []).map(r => `
        <div class="score-row">
          <span>${r.factor}</span>
          <span class="score-val" style="color:${r.weight < 0 ? '#4ade80' : '#38bdf8'};">${r.weight > 0 ? '+' : ''}${r.weight}</span>
        </div>
      `).join('');
    }

    const totalScoreEl = document.getElementById('detail-total-score');
    if (totalScoreEl) totalScoreEl.textContent = alert.score;

    // Multimodal confidence line
    const confLine = document.getElementById('detail-confidence-line');
    if (confLine) {
      if (alert.confidence_breakdown) {
        confLine.textContent = Object.entries(alert.confidence_breakdown)
          .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
          .join(' · ');
      } else {
        confLine.textContent = alert.band === 'high' ? 'Thermal 94% · PIR 88% · Seismic 81%' : 'Seismic 85% · PIR 78%';
      }
    }

    // ML Isolation Forest Anomaly Score
    const mlScoreEl = document.getElementById('detail-ml-score');
    const mlTagEl = document.getElementById('detail-ml-tag');
    if (mlScoreEl) {
      const mlScore = alert.ml_score || (alert.score >= 70 ? 88 : 42);
      mlScoreEl.textContent = `${mlScore} / 100`;
      if (mlTagEl) {
        mlTagEl.textContent = mlScore >= 65 ? 'OUTLIER' : 'NORMAL';
        mlTagEl.style.borderColor = mlScore >= 65 ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)';
        mlTagEl.style.color = mlScore >= 65 ? '#f87171' : '#4ade80';
      }
    }

    // Update Waveform Visualizer
    currentWaveformSamples = alert.waveform_samples || [];
  }

  function getCardinal(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8];
  }

  // Bounding Boxes Rendering
  function renderBoundingBoxes(boxes, label) {
    if (!el.camBoxesOverlay) return;
    el.camBoxesOverlay.innerHTML = '';
    if (!boxes || boxes.length === 0) return;

    boxes.forEach(box => {
      // box is [x1, y1, x2, y2] normalized (0 to 1)
      const [x1, y1, x2, y2] = box;
      const left = (x1 * 100).toFixed(1) + '%';
      const top = (y1 * 100).toFixed(1) + '%';
      const width = ((x2 - x1) * 100).toFixed(1) + '%';
      const height = ((y2 - y1) * 100).toFixed(1) + '%';

      const bboxDiv = document.createElement('div');
      bboxDiv.className = 'cam-bbox';
      bboxDiv.style.left = left;
      bboxDiv.style.top = top;
      bboxDiv.style.width = width;
      bboxDiv.style.height = height;

      const tag = document.createElement('div');
      tag.className = 'cam-bbox-label';
      tag.textContent = label || 'Target';
      bboxDiv.appendChild(tag);

      el.camBoxesOverlay.appendChild(bboxDiv);
    });
  }

  // 5. Render Sensor Health Table
  function renderSensorHealth() {
    const nodes = [
      { id: 'N1', battery: '91%', signal: '−71 dBm', seen: '1 s', offline: false },
      { id: 'N2', battery: '84%', signal: '−76 dBm', seen: '1 s', offline: false },
      { id: 'N3', battery: '67%', signal: '−82 dBm', seen: '2 s', offline: false },
      { id: 'N4', battery: '23%', signal: '−88 dBm', seen: '4 s', offline: true }
    ];

    Object.keys(state.nodes).forEach(k => {
      const cleanK = k.replace('Z1-', '');
      const found = nodes.find(n => n.id === cleanK);
      if (found) {
        if (state.nodes[k].battery !== undefined) found.battery = `${state.nodes[k].battery}%`;
        if (state.nodes[k].status === 'offline') {
          found.seen = 'OFFLINE';
          found.offline = true;
        } else {
          found.seen = '1 s';
          found.offline = false;
        }
      }
    });

    if (el.healthTableBody) {
      el.healthTableBody.innerHTML = nodes.map(n => `
        <tr>
          <td>${n.id}</td>
          <td style="${n.offline ? 'color:var(--amber);' : ''}">${n.battery}</td>
          <td>${n.signal}</td>
          <td style="text-align:right;">
            ${n.offline ? '<span class="badge-offline">OFFLINE</span>' : n.seen}
          </td>
        </tr>
      `).join('');
    }
  }

  // 6. Render Sensor Event Logs (Bottom Center)
  function renderSensorLogs() {
    if (!el.sensorLogBox) return;

    el.sensorLogBox.innerHTML = state.sensorLogs.map(log => `
      <div class="log-row ${log.type}">
        <span class="log-time">${log.time}</span>
        <span class="log-source ${log.type}">${log.source}</span>
        <span class="log-text">${log.text}</span>
      </div>
    `).join('');

    el.sensorLogBox.scrollTop = el.sensorLogBox.scrollHeight;
  }

  // 7. Oscilloscope Waveform Canvas Visualizer
  let currentWaveformSamples = [0.05, 0.08, 0.75, 0.92, 0.65, 0.12, 0.04, 0.06, 0.71, 0.88, 0.60, 0.10];
  let wavePhase = 0;

  function initWaveformVisualizer() {
    const canvas = el.seismicCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw() {
      requestAnimationFrame(draw);
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gridlines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Waveform line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 4;
      ctx.beginPath();

      const samples = currentWaveformSamples.length > 0 ? currentWaveformSamples : [0.1, 0.1];
      const step = canvas.width / (samples.length - 1);
      wavePhase += 0.05;

      for (let i = 0; i < samples.length; i++) {
        const val = samples[i];
        // Apply sinusoidal pulse motion
        const amp = (val * 0.75 + Math.sin(i * 0.8 + wavePhase) * 0.15 * val);
        const y = (canvas.height / 2) - (amp * (canvas.height / 2 - 4));
        const x = i * step;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    draw();
  }

  // 8. WebSocket Live Connection
  let ws = null;
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    if (el.linkStatusText) el.linkStatusText.textContent = 'Connecting...';
    if (el.headerLinkStatus) el.headerLinkStatus.className = 'meta-val link-status reconnecting';

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
      state.wsConnected = true;
      if (el.linkStatusText) el.linkStatusText.textContent = 'Online · synced live';
      if (el.headerLinkStatus) el.headerLinkStatus.className = 'meta-val link-status';
    };

    ws.onmessage = function (event) {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (err) {
        console.error('WS Parse error', err);
      }
    };

    ws.onclose = function () {
      state.wsConnected = false;
      if (el.linkStatusText) el.linkStatusText.textContent = 'Offline · reconnecting';
      if (el.headerLinkStatus) el.headerLinkStatus.className = 'meta-val link-status offline';
      setTimeout(connectWebSocket, 2500);
    };
  }

  function handleWsMessage(msg) {
    switch (msg.type) {
      case 'init':
        renderZoneOnMap(msg.zone);
        state.nodes = msg.nodes || {};
        state.alerts = msg.alerts || [];
        state.auditLogs = msg.audit || [];
        if (msg.sensor_logs && msg.sensor_logs.length > 0) {
          state.sensorLogs = msg.sensor_logs;
        }
        renderAlertQueue();
        renderSensorHealth();
        renderSensorLogs();
        selectAlert(state.selectedAlertId || 'ALT-5408');
        break;

      case 'alert':
        const alert = msg.data;
        const idx = state.alerts.findIndex(a => a.alert_id === alert.alert_id);
        if (idx >= 0) {
          state.alerts[idx] = alert;
        } else {
          state.alerts.unshift(alert);
        }
        renderAlertQueue();
        selectAlert(alert.alert_id);
        if (msg.audio_cue) {
          playTacticalAlarm();
        }
        break;

      case 'alert_action':
        const updatedAlert = msg.data;
        const aidx = state.alerts.findIndex(a => a.alert_id === updatedAlert.alert_id);
        if (aidx >= 0) {
          state.alerts[aidx] = updatedAlert;
        }
        renderAlertQueue();
        if (state.selectedAlertId === updatedAlert.alert_id) {
          renderAlertDetail(updatedAlert);
        }
        break;

      case 'drone_dispatch':
        animateDroneRecon(msg);
        break;

      case 'sensor_logs':
        state.sensorLogs = msg.data;
        renderSensorLogs();
        break;

      case 'node_update':
        state.nodes = msg.data;
        renderSensorHealth();
        if (state.zone) renderZoneOnMap(state.zone);
        break;

      case 'reset':
        location.reload();
        break;
    }
  }

  // 9. Drone Flight Animation on Leaflet Map
  function animateDroneRecon(data) {
    mapLayers.drone.clearLayers();

    const startLat = data.bop_lat || 26.8440;
    const startLon = data.bop_lon || 84.2335;
    const endLat = data.target_lat;
    const endLon = data.target_lon;

    if (!endLat || !endLon) return;

    // Draw dashed UAV flight corridor
    L.polyline([[startLat, startLon], [endLat, endLon]], {
      color: '#ef4444',
      weight: 2,
      dashArray: '4, 8',
      opacity: 0.8
    }).addTo(mapLayers.drone);

    const droneIcon = L.divIcon({
      className: 'leaflet-drone-marker',
      html: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
          <path d="M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"></path>
        </svg>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker([startLat, startLon], { icon: droneIcon }).addTo(mapLayers.drone);

    const startTime = performance.now();
    const duration = 5500; // 5.5 seconds flight

    function stepFlight(time) {
      const elapsed = time - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const currLat = startLat + (endLat - startLat) * progress;
      const currLon = startLon + (endLon - startLon) * progress;
      marker.setLatLng([currLat, currLon]);

      if (progress < 1.0) {
        requestAnimationFrame(stepFlight);
      } else {
        // UAV Arrived at target coordinates: open recon feed modal
        playTacticalAlarm();
        setTimeout(() => {
          el.modalDrone?.classList.add('active');
        }, 300);
      }
    }

    requestAnimationFrame(stepFlight);
  }

  // 10. Operator Actions & Modal Handlers
  function setupHandlers() {
    // Filter buttons
    el.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.getAttribute('data-filter');
        renderAlertQueue();
      });
    });

    // Camera Modals
    const openCamModal = () => {
      const alert = state.alerts.find(a => a.alert_id === state.selectedAlertId);
      if (alert && alert.snapshot && el.modalFeedImg) {
        el.modalFeedImg.src = alert.snapshot;
      }
      el.modalCam?.classList.add('active');
    };

    el.btnOpenCameras?.addEventListener('click', openCamModal);
    el.camViewportBox?.addEventListener('click', openCamModal);
    el.btnCloseCam?.addEventListener('click', () => el.modalCam?.classList.remove('active'));
    el.btnCloseDrone?.addEventListener('click', () => el.modalDrone?.classList.remove('active'));

    // Audit Trail Modal
    el.btnAuditTrail?.addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/audit');
        const data = await resp.json();
        if (el.auditTbody) {
          el.auditTbody.innerHTML = data.slice().reverse().map(item => `
            <tr>
              <td style="font-family:var(--font-mono); font-size:10.5px;">${item.timestamp.split('T')[1].split('.')[0]}</td>
              <td style="color:#93c5fd;">${item.category}</td>
              <td>${item.actor}</td>
              <td>${item.summary}</td>
            </tr>
          `).join('');
        }
        el.modalAudit?.classList.add('active');
      } catch (err) {
        console.error(err);
      }
    });

    el.btnCloseAudit?.addEventListener('click', () => el.modalAudit?.classList.remove('active'));

    // Operator Decision Handlers
    el.btnActionPending?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pending', note: 'Marked as pending operator decision' })
      });
    });

    el.btnActionTrack?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', note: 'Continuous surveillance tracking engaged' })
      });
    });

    el.btnActionConfirm?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', note: 'Threat verified by duty operator per SOP' })
      });
    });

    // Dismiss with mandatory note modal
    el.btnActionDismiss?.addEventListener('click', () => {
      if (!state.selectedAlertId) return;
      state.dismissingAlertId = state.selectedAlertId;
      if (el.dismissInput) el.dismissInput.value = '';
      el.modalDismiss?.classList.add('active');
    });

    el.btnCloseDismiss?.addEventListener('click', () => el.modalDismiss?.classList.remove('active'));
    el.btnCancelDismiss?.addEventListener('click', () => el.modalDismiss?.classList.remove('active'));

    el.btnConfirmDismiss?.addEventListener('click', async () => {
      if (!state.dismissingAlertId) return;
      const note = el.dismissInput?.value.trim() || 'Dismissed as non-hostile false alarm';
      await fetch(`/api/alerts/${state.dismissingAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', note: note })
      });
      el.modalDismiss?.classList.remove('active');
    });

    el.btnActionEscalate?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'escalate', note: 'Priority escalation notified to Sector Commander' })
      });
    });

    // Primary Dispatch Button (UAV + QRT)
    el.btnActionDispatch?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/drone`, { method: 'POST' });
      const origText = el.btnActionDispatch.querySelector('.dispatch-headline').textContent;
      el.btnActionDispatch.querySelector('.dispatch-headline').textContent = 'DISPATCHED ✓';
      setTimeout(() => {
        el.btnActionDispatch.querySelector('.dispatch-headline').textContent = origText;
      }, 3500);
    });

    // Demo Scenario Matrix (Footer Buttons)
    document.querySelectorAll('.demo-btn[data-scenario]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scName = btn.getAttribute('data-scenario');
        const speed = parseFloat(el.selSpeed?.value || '2.0');
        await fetch(`/api/scenarios/${scName}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: speed })
        });
      });
    });

    // Reset Sandbox Baseline
    el.btnResetSandbox?.addEventListener('click', async () => {
      await fetch('/api/demo/reset', { method: 'POST' });
    });

    // IST Master Clock
    setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + ' IST';
      if (el.clockIst) el.clockIst.textContent = timeStr;
      if (el.modalCamTime) el.modalCamTime.textContent = timeStr;
    }, 1000);
  }

  // Bootstrap Application
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    initWaveformVisualizer();
    setupHandlers();
    connectWebSocket();
  });

})();
