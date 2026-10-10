// TRINETRA // OSINT-C2 SENTINEL JAVASCRIPT CORE
// Tactical Command & Control Client for Software-First Demo v1.0

(function() {
  'use strict';

  // State Management
  const state = {
    zone: null,
    nodes: {},
    alerts: [],
    selectedAlertId: null,
    events: [],
    auditLogs: [],
    currentBaseLayer: 'map', // 'map' or 'satellite'
    activeFilter: 'all',
    audioAlertEnabled: true,
    droneFlightAnim: null
  };

  // Map and Layers Reference
  let map = null;
  let darkMapLayer = null;
  let satelliteLayer = null;
  let geofenceLayerGroup = null;
  let nodeLayerGroup = null;
  let bopLayerGroup = null;
  let droneLayerGroup = null;
  let alertMarkerGroup = null;

  // Waveform Canvas State
  let waveformCanvas = null;
  let waveformCtx = null;
  let waveformActive = false;
  let waveformEnergy = 0.15;
  let waveformPhase = 0;

  // DOM Elements
  const el = {
    alertList: document.getElementById('alert-list-container'),
    alertCount: document.getElementById('alert-count-total'),
    inspectorBody: document.getElementById('inspector-body'),
    inspectorAlertId: document.getElementById('inspector-alert-id'),
    tickerBox: document.getElementById('ticker-log-box'),
    mouseCoords: document.getElementById('mouse-coords'),
    btnMapView: document.getElementById('btn-map-view'),
    btnSatelliteView: document.getElementById('btn-satellite-view'),
    btnResetDemo: document.getElementById('btn-reset-demo'),
    btnOpenAudit: document.getElementById('btn-open-audit'),
    btnCloseAuditModal: document.getElementById('btn-close-audit-modal'),
    modalAudit: document.getElementById('modal-audit'),
    auditTableBody: document.getElementById('audit-table-body'),
    modalDrone: document.getElementById('modal-drone'),
    btnCloseDroneModal: document.getElementById('btn-close-drone-modal'),
    wsIndicator: document.getElementById('ws-indicator'),
    c2Status: document.getElementById('c2-status-text'),
    chkAudioAlert: document.getElementById('chk-audio-alert'),
    selSpeed: document.getElementById('sel-scenario-speed')
  };

  // 1. Initialize Tactical Leaflet Map
  function initMap() {
    // Sector Z1 Target Area Center Coordinates
    const targetCenter = [26.8512, 84.2321];
    
    map = L.map('leaflet-map', {
      center: targetCenter,
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    // Custom tactical zoom control on bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark Tactical Vector Map (CartoDB Dark Matter)
    darkMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    });

    // High-Resolution Satellite View (Esri World Imagery)
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18
    });

    // Default to dark tactical map
    darkMapLayer.addTo(map);

    // Layer groups for toggle control
    geofenceLayerGroup = L.layerGroup().addTo(map);
    nodeLayerGroup = L.layerGroup().addTo(map);
    bopLayerGroup = L.layerGroup().addTo(map);
    droneLayerGroup = L.layerGroup().addTo(map);
    alertMarkerGroup = L.layerGroup().addTo(map);

    // Track mouse coordinates for C2 HUD readout
    map.on('mousemove', function(e) {
      if (el.mouseCoords) {
        el.mouseCoords.textContent = `${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`;
      }
    });

    // Setup base view switcher handlers
    setupBaseMapSwitcher();
  }

  // Base Map / Satellite View Toggle Logic
  function setupBaseMapSwitcher() {
    el.btnMapView.addEventListener('click', () => setBaseLayer('map'));
    el.btnSatelliteView.addEventListener('click', () => setBaseLayer('satellite'));

    // Keyboard shortcuts [M] for Map, [S] for Satellite
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'm' || e.key === 'M') setBaseLayer('map');
      if (e.key === 's' || e.key === 'S') setBaseLayer('satellite');
    });

    // Layer toggles checkboxes
    document.getElementById('layer-chk-geofences').addEventListener('change', (e) => {
      e.target.checked ? map.addLayer(geofenceLayerGroup) : map.removeLayer(geofenceLayerGroup);
    });
    document.getElementById('layer-chk-nodes').addEventListener('change', (e) => {
      e.target.checked ? map.addLayer(nodeLayerGroup) : map.removeLayer(nodeLayerGroup);
    });
    document.getElementById('layer-chk-bop').addEventListener('change', (e) => {
      e.target.checked ? map.addLayer(bopLayerGroup) : map.removeLayer(bopLayerGroup);
    });
  }

  function setBaseLayer(layerType) {
    if (state.currentBaseLayer === layerType) return;

    if (layerType === 'satellite') {
      map.removeLayer(darkMapLayer);
      map.addLayer(satelliteLayer);
      el.btnSatelliteView.classList.add('active');
      el.btnMapView.classList.remove('active');
      state.currentBaseLayer = 'satellite';
      addTickerLog('MAP', 'Switched to Esri High-Resolution Satellite View');
    } else {
      map.removeLayer(satelliteLayer);
      map.addLayer(darkMapLayer);
      el.btnMapView.classList.add('active');
      el.btnSatelliteView.classList.remove('active');
      state.currentBaseLayer = 'map';
      addTickerLog('MAP', 'Switched to Tactical Vector Dark Matter View');
    }
  }

  // 2. Render Zone Geofences, Nodes, and Outpost on Map
  function renderZoneOnMap(zoneData) {
    state.zone = zoneData;
    geofenceLayerGroup.clearLayers();
    nodeLayerGroup.clearLayers();
    bopLayerGroup.clearLayers();

    // 2a. Target Area Sector Bounding Box
    if (zoneData.bounds) {
      const b = zoneData.bounds;
      const boundsBox = [
        [b.min_lat, b.min_lon],
        [b.max_lat, b.max_lon]
      ];
      L.rectangle(boundsBox, {
        color: '#00f0ff',
        weight: 1,
        fill: false,
        dashArray: '4, 8',
        opacity: 0.35
      }).addTo(geofenceLayerGroup);
    }

    // 2b. Tactical Geofence Polygons
    (zoneData.geofences || []).forEach(gf => {
      const isRestricted = gf.kind === 'restricted';
      const isCrossing = gf.kind === 'crossing_route';
      
      const poly = L.polygon(gf.polygon, {
        color: gf.color,
        weight: 2,
        dashArray: isCrossing ? '6, 6' : null,
        fillColor: gf.color,
        fillOpacity: isRestricted ? 0.22 : 0.12
      }).addTo(geofenceLayerGroup);

      poly.bindTooltip(`<b>${gf.name}</b><br><span style="font-size:10px; color:${gf.color};">${gf.active_hours}</span>`, {
        sticky: true,
        className: 'tactical-tooltip'
      });
    });

    // 2c. Outpost (BOP-1) Marker & Perimeter Concentric Rings
    (zoneData.bops || []).forEach(bop => {
      const bopIcon = L.divIcon({
        className: 'bop-marker-wrapper',
        html: `
          <div class="bop-marker-icon">
            <div class="bop-shield">HQ</div>
            <div class="node-label-pill" style="border-color:var(--emerald-tactical); color:var(--emerald-tactical);">${bop.name}</div>
          </div>
        `,
        iconSize: [60, 40],
        iconAnchor: [30, 20]
      });

      L.marker([bop.lat, bop.lon], { icon: bopIcon }).addTo(bopLayerGroup);

      // 500m & 1000m security radial perimeter
      L.circle([bop.lat, bop.lon], {
        radius: 500,
        color: '#10b981',
        weight: 1,
        dashArray: '2, 6',
        fill: false,
        opacity: 0.4
      }).addTo(bopLayerGroup);

      L.circle([bop.lat, bop.lon], {
        radius: 1200,
        color: '#10b981',
        weight: 1,
        dashArray: '3, 9',
        fill: false,
        opacity: 0.25
      }).addTo(bopLayerGroup);
    });

    // 2d. Sensor Nodes (Z1-N1 through Z1-N4)
    updateNodeMarkers();
  }

  function updateNodeMarkers() {
    if (!state.zone) return;
    nodeLayerGroup.clearLayers();

    (state.zone.nodes || []).forEach(node => {
      const nodeStatus = state.nodes[node.id] ? state.nodes[node.id].status : (node.status || 'online');
      const isOffline = nodeStatus === 'offline';

      const nodeIcon = L.divIcon({
        className: 'tactical-node-wrapper',
        html: `
          <div class="tactical-node-icon" id="marker-node-${node.id}">
            <div class="node-pulse-ring" style="${isOffline ? 'display:none;' : ''}"></div>
            <div class="node-core ${isOffline ? 'offline' : ''}"></div>
            <div class="node-label-pill">${node.id}</div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const m = L.marker([node.lat, node.lon], { icon: nodeIcon }).addTo(nodeLayerGroup);
      m.on('click', () => {
        addTickerLog(node.id, `Inspecting telemetry: Status=${nodeStatus.toUpperCase()}, Sensors=[${node.sensors.join(', ')}]`);
      });
      m.bindTooltip(`<b>${node.name}</b><br>Status: <span style="color:${isOffline ? '#ef4444' : '#10b981'}">${nodeStatus.toUpperCase()}</span><br>Sensors: ${node.sensors.join(', ')}`, {
        sticky: true
      });
    });
  }

  // Trigger optical visual ping on sensor node marker
  function pulseNode(nodeId, type) {
    const elMarker = document.getElementById(`marker-node-${nodeId}`);
    if (elMarker) {
      const ring = elMarker.querySelector('.node-pulse-ring');
      if (ring) {
        ring.style.animation = 'none';
        ring.offsetHeight; /* trigger reflow */
        ring.style.animation = 'radar-ping 0.8s ease-out';
      }
    }
  }

  // 3. WebSocket Connection & Live Push
  let ws = null;
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      el.wsIndicator.textContent = "SYNCED";
      el.wsIndicator.style.color = "var(--cyan-tactical)";
      el.c2Status.textContent = "ONLINE (ACTIVE)";
      addTickerLog("NET", "C2 Telemetry WebSocket linked to backend");
    };

    ws.onclose = function() {
      el.wsIndicator.textContent = "RECONNECTING";
      el.wsIndicator.style.color = "var(--amber-tactical)";
      el.c2Status.textContent = "LINK DOWN (RETRYING)";
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = function() {
      el.wsIndicator.textContent = "OFFLINE";
      el.wsIndicator.style.color = "var(--crimson-tactical)";
    };

    ws.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (err) {
        console.error("WS Parse error", err);
      }
    };
  }

  function handleWsMessage(msg) {
    switch (msg.type) {
      case 'init':
        renderZoneOnMap(msg.zone);
        state.nodes = msg.nodes || {};
        state.alerts = msg.alerts || [];
        state.events = msg.events || [];
        state.auditLogs = msg.audit || [];
        updateNodeMarkers();
        renderAlertList();
        if (state.alerts.length > 0) {
          selectAlert(state.alerts[0].alert_id);
        }
        break;

      case 'event':
        handleIncomingEvent(msg.data);
        break;

      case 'alert':
        handleIncomingAlert(msg.data);
        break;

      case 'node_update':
        state.nodes = msg.data;
        updateNodeMarkers();
        break;

      case 'alert_action':
        updateAlertRecord(msg.data);
        break;

      case 'drone_dispatch':
        executeDroneFlight(msg);
        break;

      case 'reset':
        state.alerts = [];
        state.selectedAlertId = null;
        alertMarkerGroup.clearLayers();
        droneLayerGroup.clearLayers();
        renderAlertList();
        renderInspectorEmpty();
        addTickerLog("SYS", "Demo sandbox reset complete");
        break;
    }
  }

  function handleIncomingEvent(event) {
    state.events.push(event);
    pulseNode(event.node_id, event.type);
    triggerWaveformSpike();

    const label = event.label || event.type;
    addTickerLog(event.node_id, `Trigger [${event.type.toUpperCase()}]: ${label} (Conf: ${(event.confidence * 100).toFixed(0)}%)`);
  }

  function handleIncomingAlert(alert) {
    const existingIndex = state.alerts.findIndex(a => a.alert_id === alert.alert_id);
    if (existingIndex >= 0) {
      state.alerts[existingIndex] = alert;
    } else {
      state.alerts.unshift(alert);
      if (alert.band === 'high' && el.chkAudioAlert.checked) {
        playTacticalAlertSound();
      }
    }

    renderAlertList();

    // Auto-select the newly arrived high threat alert or currently selected alert
    if (!state.selectedAlertId || alert.band === 'high' || state.selectedAlertId === alert.alert_id) {
      selectAlert(alert.alert_id);
    }

    // Render alert marker on map
    renderAlertPinOnMap(alert);
  }

  function updateAlertRecord(updatedAlert) {
    const idx = state.alerts.findIndex(a => a.alert_id === updatedAlert.alert_id);
    if (idx >= 0) {
      state.alerts[idx] = updatedAlert;
      renderAlertList();
      if (state.selectedAlertId === updatedAlert.alert_id) {
        renderInspector(updatedAlert);
      }
    }
  }

  // 4. Alert Queue Rendering
  function renderAlertList() {
    el.alertCount.textContent = state.alerts.length;

    const filtered = state.alerts.filter(a => {
      if (state.activeFilter === 'all') return true;
      return a.band === state.activeFilter;
    });

    if (filtered.length === 0) {
      el.alertList.innerHTML = `
        <div class="empty-state">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          <div>NO INCIDENTS IN FILTER</div>
          <div style="font-size:11px;">Current queue holds ${state.alerts.length} total events.</div>
        </div>
      `;
      return;
    }

    el.alertList.innerHTML = filtered.map(a => {
      const isSelected = a.alert_id === state.selectedAlertId;
      const barColor = a.band === 'high' ? 'var(--crimson-tactical)' : (a.band === 'review' ? 'var(--amber-tactical)' : 'var(--emerald-tactical)');
      const label = a.detected_class ? `${a.detected_class.toUpperCase()} (x${a.detected_count})` : 'UNCLASSIFIED';

      return `
        <div class="alert-item-card band-${a.band} ${isSelected ? 'selected' : ''}" data-id="${a.alert_id}">
          <div class="alert-item-top">
            <span class="alert-item-id">${a.alert_id}</span>
            <span class="badge-band ${a.band}">${a.band} (${a.score})</span>
          </div>
          <div class="alert-item-meta">
            <span>NODE: <strong style="color:#fff;">${a.primary_node}</strong></span>
            <span>TARGET: <strong>${label}</strong></span>
          </div>
          <div class="alert-score-bar-wrapper">
            <div class="alert-score-bar-fill" style="width:${a.score}%; background:${barColor};"></div>
          </div>
          <div class="alert-item-footer">
            <span>ETA: ${a.eta_minutes} min to ${a.bop_name.split(' ')[0]}</span>
            <span style="text-transform:uppercase; color:${a.status === 'confirmed' ? 'var(--emerald-tactical)' : (a.status === 'dismissed' ? 'var(--text-dim)' : 'var(--cyan-tactical)')}">
              ${a.status}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    el.alertList.querySelectorAll('.alert-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        selectAlert(id);
      });
    });
  }

  function selectAlert(alertId) {
    state.selectedAlertId = alertId;
    renderAlertList();

    const targetAlert = state.alerts.find(a => a.alert_id === alertId);
    if (targetAlert) {
      renderInspector(targetAlert);
      // Pan map smoothly to the alert location
      if (map && targetAlert.lat && targetAlert.lon) {
        map.panTo([targetAlert.lat, targetAlert.lon], { animate: true, duration: 0.8 });
      }
    } else {
      renderInspectorEmpty();
    }
  }

  // 5. Tactical Alert Marker on Map
  function renderAlertPinOnMap(alert) {
    alertMarkerGroup.clearLayers();

    const pinColor = alert.band === 'high' ? '#ef4444' : (alert.band === 'review' ? '#f59e0b' : '#94a3b8');

    const pinIcon = L.divIcon({
      className: 'alert-pin-wrapper',
      html: `
        <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
          <div style="width:24px; height:24px; border-radius:50%; background:${pinColor}; opacity:0.3; animation:radar-ping 1.5s infinite;"></div>
          <div style="width:12px; height:12px; border-radius:50%; background:${pinColor}; border:2px solid #fff; position:absolute; top:6px;"></div>
          <div class="node-label-pill" style="margin-top:14px; border-color:${pinColor}; color:${pinColor};">${alert.alert_id} [${alert.score}]</div>
        </div>
      `,
      iconSize: [60, 40],
      iconAnchor: [30, 12]
    });

    const marker = L.marker([alert.lat, alert.lon], { icon: pinIcon }).addTo(alertMarkerGroup);
    marker.on('click', () => selectAlert(alert.alert_id));

    // Draw vector line from nearest BOP to the alert location
    if (state.zone && state.zone.bops) {
      const bop = state.zone.bops[0];
      if (bop) {
        L.polyline([[bop.lat, bop.lon], [alert.lat, alert.lon]], {
          color: pinColor,
          weight: 2,
          dashArray: '4, 8',
          opacity: 0.6
        }).addTo(alertMarkerGroup);
      }
    }
  }

  // 6. Right Inspector: Explainable Threat AI Card
  function renderInspector(alert) {
    el.inspectorAlertId.textContent = alert.alert_id;

    const reasonsHtml = (alert.reasons || []).map(r => {
      const isPositive = r.weight > 0;
      return `
        <div class="reason-row">
          <span class="reason-name">${r.factor}</span>
          <span class="reason-weight ${isPositive ? 'pos' : 'neg'}">${isPositive ? '+' : ''}${r.weight}</span>
        </div>
      `;
    }).join('');

    const targetLabel = alert.detected_class 
      ? `<span class="yolo-target-tag">${alert.detected_class.toUpperCase()} x${alert.detected_count}</span>` 
      : `<span class="yolo-target-tag">GEOPHONE SENSOR</span>`;

    // Snapshot image url fallback
    let snapshotSrc = '/static/assets/thermal_intrusion_group.jpg';
    if (alert.detected_class === 'cow' || alert.detected_class === 'livestock') {
      snapshotSrc = '/static/assets/thermal_livestock.jpg';
    } else if (alert.snapshot && alert.snapshot.includes('market')) {
      snapshotSrc = '/static/assets/thermal_intrusion_group.jpg';
    }

    el.inspectorBody.innerHTML = `
      <!-- THREAT GAUGE CARD -->
      <div class="threat-score-card">
        <div class="threat-score-gauge ${alert.band}">
          <div class="gauge-score-num">${alert.score}</div>
          <div class="gauge-score-label">/ 100</div>
        </div>
        <div class="threat-score-info">
          <div class="threat-band-title ${alert.band}">${alert.band.toUpperCase()} PRIORITY ALERT</div>
          <div class="threat-band-desc">
            ${alert.band === 'high' 
              ? 'Multi-sensor convergence off authorized tracks. High threat level.' 
              : (alert.band === 'review' 
                ? 'Elevated movement detected. Single sensor or ambiguous pattern under review.' 
                : 'Routine pattern consistent with civilian market hours or benign animal.')}
          </div>
        </div>
      </div>

      <!-- EXPLAINABILITY BREAKDOWN (FR-10 / NFR-4) -->
      <div class="explainability-section">
        <div class="section-label">
          <span>EXPLAINABLE AI FACTORS</span>
          <span>SCORE: ${alert.score}</span>
        </div>
        <div class="reasons-list">
          ${reasonsHtml || '<div class="reason-row">No active contributing weights</div>'}
        </div>
      </div>

      <!-- OPTICAL / THERMAL RECON SNAPSHOT & SEISMIC WAVEFORM -->
      <div class="recon-media-section">
        <div class="section-label" style="padding:10px 12px 0 12px; margin-bottom:4px;">
          <span>OPTICAL / THERMAL RECON (YOLOv8)</span>
          <span>LAT: ${alert.lat.toFixed(4)}° N</span>
        </div>
        <div class="snapshot-container">
          <img src="${snapshotSrc}" alt="Surveillance Snapshot" class="snapshot-img">
          <div class="snapshot-hud-overlay">
            <div class="snapshot-hud-top">
              <span>NODE: ${alert.primary_node}</span>
              <span>FLIR THERMAL WHITE-HOT</span>
            </div>
            <div class="snapshot-hud-bottom">
              ${targetLabel}
              <span style="font-family:var(--font-mono); font-size:9px; color:#fff; background:rgba(0,0,0,0.6); padding:2px 4px;">HDG: ${alert.heading_deg || 190}°</span>
            </div>
          </div>
        </div>

        <!-- Real-Time Seismic Waveform Canvas -->
        <div class="waveform-container">
          <div class="waveform-label">
            <span>GROUND SEISMIC TELEMETRY</span>
            <span style="color:var(--cyan-tactical);">GEOPHONE ACTIVE</span>
          </div>
          <canvas id="waveform-canvas"></canvas>
        </div>
      </div>

      <!-- TACTICAL ROUTING & INTERCEPT METRICS -->
      <div class="routing-card">
        <div class="section-label">NEAREST BORDER OUTPOST ROUTING</div>
        <div style="font-size:12px; font-weight:600; color:#fff; margin-bottom:4px;">${alert.bop_name}</div>
        <div class="routing-metrics">
          <div class="routing-stat">
            <div class="routing-stat-label">DISTANCE</div>
            <div class="routing-stat-val">${alert.distance_km} KM</div>
          </div>
          <div class="routing-stat">
            <div class="routing-stat-label">INTERCEPT ETA</div>
            <div class="routing-stat-val" style="color:var(--amber-tactical);">${alert.eta_minutes} MIN</div>
          </div>
        </div>
      </div>

      <!-- OPERATOR ACTION STATION (FR-18) -->
      <div class="actions-console">
        <div class="section-label">OPERATOR TRIAGE DECISION</div>
        
        <div class="note-input-wrapper">
          <input type="text" id="input-op-note" class="operator-note-input" placeholder="Operator remarks (mandatory on dismiss/escalate)..." value="Visual & ground confirmation verified">
        </div>

        <div class="actions-btn-grid">
          <button class="tactical-btn success" id="btn-action-confirm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            CONFIRM & DISPATCH
          </button>
          <button class="tactical-btn warning" id="btn-action-dismiss">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            DISMISS ALERT
          </button>
          <button class="tactical-btn danger" id="btn-action-escalate">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
            ESCALATE COMMAND
          </button>
          <button class="tactical-btn primary" id="btn-action-drone" style="border-color:var(--purple-tactical); color:var(--purple-tactical);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>
            DRONE RECON
          </button>
        </div>
      </div>
    `;

    // Hook up operator action buttons
    setupOperatorActionHandlers(alert.alert_id);

    // Re-init canvas waveform for the new card
    initWaveformCanvas();
  }

  function renderInspectorEmpty() {
    el.inspectorAlertId.textContent = 'NO TARGET';
    el.inspectorBody.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        <div>STANDBY MODE</div>
        <div style="font-size:11px;">Select an alert from the queue or launch a demo scenario to inspect explainable AI reasoning.</div>
      </div>
    `;
  }

  function setupOperatorActionHandlers(alertId) {
    const inputNote = document.getElementById('input-op-note');

    const handleAction = async (actionType) => {
      const note = (inputNote && inputNote.value) ? inputNote.value.trim() : `Decision: ${actionType}`;
      try {
        const resp = await fetch(`/api/alerts/${alertId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionType, note: note })
        });
        const data = await resp.json();
        if (data.ok) {
          addTickerLog('OPERATOR', `Recorded '${actionType.toUpperCase()}' on ${alertId}: ${note}`);
        }
      } catch (err) {
        console.error('Action error', err);
      }
    };

    document.getElementById('btn-action-confirm')?.addEventListener('click', () => handleAction('confirm'));
    document.getElementById('btn-action-dismiss')?.addEventListener('click', () => handleAction('dismiss'));
    document.getElementById('btn-action-escalate')?.addEventListener('click', () => handleAction('escalate'));
    document.getElementById('btn-action-drone')?.addEventListener('click', async () => {
      try {
        await fetch(`/api/alerts/${alertId}/drone`, { method: 'POST' });
        openDroneModal();
      } catch (err) {
        console.error('Drone error', err);
      }
    });
  }

  // 7. Ground Seismic Waveform Animation
  function initWaveformCanvas() {
    waveformCanvas = document.getElementById('waveform-canvas');
    if (!waveformCanvas) return;

    waveformCanvas.width = waveformCanvas.offsetWidth * window.devicePixelRatio || 300;
    waveformCanvas.height = 38 * window.devicePixelRatio;
    waveformCtx = waveformCanvas.getContext('2d');
    waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function triggerWaveformSpike() {
    waveformEnergy = 1.0;
  }

  function animateWaveform() {
    requestAnimationFrame(animateWaveform);
    if (!waveformCanvas || !waveformCtx) return;

    const w = waveformCanvas.offsetWidth || 300;
    const h = 38;

    waveformCtx.clearRect(0, 0, w, h);

    // Draw baseline center line
    waveformCtx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    waveformCtx.lineWidth = 1;
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, h / 2);
    waveformCtx.lineTo(w, h / 2);
    waveformCtx.stroke();

    // Oscillate seismic sine wave
    waveformPhase += 0.12;
    waveformEnergy = Math.max(0.12, waveformEnergy * 0.96); // decay back to ambient noise

    waveformCtx.strokeStyle = waveformEnergy > 0.4 ? 'var(--crimson-tactical)' : 'var(--cyan-tactical)';
    waveformCtx.lineWidth = 1.5;
    waveformCtx.beginPath();

    const points = 60;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * w;
      const angle = (i * 0.4) + waveformPhase;
      const amp = Math.sin(angle) * (14 * waveformEnergy) + (Math.sin(angle * 2.3) * (5 * waveformEnergy));
      const y = (h / 2) + amp;

      if (i === 0) waveformCtx.moveTo(x, y);
      else waveformCtx.lineTo(x, y);
    }
    waveformCtx.stroke();
  }

  // 8. Autonomous Drone Recon Flight Animation
  function executeDroneFlight(droneMsg) {
    if (!map || !state.zone || !state.zone.bops) return;

    droneLayerGroup.clearLayers();
    const bop = state.zone.bops[0];
    const targetLat = droneMsg.target_lat;
    const targetLon = droneMsg.target_lon;

    const droneIcon = L.divIcon({
      className: 'drone-icon-wrap',
      html: `
        <div class="drone-marker-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const droneMarker = L.marker([bop.lat, bop.lon], { icon: droneIcon }).addTo(droneLayerGroup);

    // Flight path line
    const flightPath = L.polyline([[bop.lat, bop.lon], [bop.lat, bop.lon]], {
      color: '#a855f7',
      weight: 2,
      dashArray: '3, 6'
    }).addTo(droneLayerGroup);

    // Animate interpolation over 4 seconds
    const startTime = performance.now();
    const duration = 4000;

    function stepFlight(time) {
      const progress = Math.min(1.0, (time - startTime) / duration);
      const currentLat = bop.lat + (targetLat - bop.lat) * progress;
      const currentLon = bop.lon + (targetLon - bop.lon) * progress;

      droneMarker.setLatLng([currentLat, currentLon]);
      flightPath.setLatLngs([[bop.lat, bop.lon], [currentLat, currentLon]]);

      if (progress < 1.0) {
        requestAnimationFrame(stepFlight);
      } else {
        addTickerLog('UAV', `Drone reached geofence coordinates [${targetLat.toFixed(4)}, ${targetLon.toFixed(4)}]`);
      }
    }

    requestAnimationFrame(stepFlight);
  }

  function openDroneModal() {
    el.modalDrone.classList.add('active');
  }

  function closeDroneModal() {
    el.modalDrone.classList.remove('active');
  }

  // 9. Append-Only Audit Log Viewer
  async function openAuditModal() {
    try {
      const resp = await fetch('/api/audit');
      const data = await resp.json();
      state.auditLogs = data;

      el.auditTableBody.innerHTML = (state.auditLogs || []).slice().reverse().map(item => `
        <tr>
          <td style="font-family:var(--font-mono); color:var(--text-dim);">${item.timestamp.split('T')[1].split('.')[0]}</td>
          <td><span style="font-family:var(--font-mono); color:var(--cyan-tactical); font-size:10px;">${item.category}</span></td>
          <td><span style="color:var(--text-muted); font-size:11px;">${item.actor}</span></td>
          <td>${item.summary}</td>
        </tr>
      `).join('');

      el.modalAudit.classList.add('active');
    } catch (err) {
      console.error('Audit fetch error', err);
    }
  }

  function closeAuditModal() {
    el.modalAudit.classList.remove('active');
  }

  // 10. Scenario Runner Handlers
  function setupScenarioButtons() {
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scenarioName = btn.getAttribute('data-scenario');
        const speed = parseFloat(el.selSpeed.value || '1.0');

        addTickerLog('CMD', `Initiating scenario '${scenarioName}' at ${speed}x speed`);

        try {
          const resp = await fetch(`/api/scenarios/${scenarioName}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speed: speed })
          });
          const result = await resp.json();
          if (result.ok) {
            btn.style.borderColor = 'var(--cyan-tactical)';
            setTimeout(() => { btn.style.borderColor = ''; }, 1200);
          }
        } catch (err) {
          console.error('Scenario run error', err);
        }
      });
    });

    // Reset Demo Button
    el.btnResetDemo.addEventListener('click', async () => {
      try {
        await fetch('/api/demo/reset', { method: 'POST' });
      } catch (err) {
        console.error('Reset error', err);
      }
    });

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activeFilter = chip.getAttribute('data-filter');
        renderAlertList();
      });
    });

    // Modal Triggers
    el.btnOpenAudit.addEventListener('click', openAuditModal);
    el.btnCloseAuditModal.addEventListener('click', closeAuditModal);
    el.btnCloseDroneModal.addEventListener('click', closeDroneModal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAuditModal();
        closeDroneModal();
      }
    });
  }

  // Helper: Live Ticker Log Stream
  function addTickerLog(source, msg) {
    if (!el.tickerBox) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const line = document.createElement('div');
    line.className = 'ticker-line';
    line.innerHTML = `<span class="ticker-time">${timeStr}</span> <span class="ticker-node">${source}</span> ${msg}`;

    el.tickerBox.appendChild(line);
    el.tickerBox.scrollTop = el.tickerBox.scrollHeight;

    while (el.tickerBox.children.length > 40) {
      el.tickerBox.removeChild(el.tickerBox.firstChild);
    }
  }

  // Web Audio Tactical Siren Ping (No external files needed)
  function playTacticalAlertSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  // Bootstrap Application
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupScenarioButtons();
    connectWebSocket();
    animateWaveform();
  });

})();
