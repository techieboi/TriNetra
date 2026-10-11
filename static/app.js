// TRINETRA // BORDER SENSOR FUSION v1.4.2
// Exact Reference Dashboard Controller

(function() {
  'use strict';

  // Application State
  const state = {
    zone: null,
    nodes: {},
    alerts: [],
    selectedAlertId: 'ALT-5408',
    sensorLogs: [],
    auditLogs: [],
    currentBaseLayer: 'map',
    activeFilter: 'all',
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
    alertLine: null
  };

  // DOM Elements
  const el = {
    queueList: document.getElementById('queue-list-items'),
    activeCount: document.getElementById('active-alert-count'),
    filterBtns: document.querySelectorAll('.queue-filters .filter-btn'),
    healthTableBody: document.getElementById('health-table-body'),
    sensorLogBox: document.getElementById('sensor-log-box'),
    cursorCoords: document.getElementById('map-cursor-coords'),
    btnMapView: document.getElementById('btn-map-view'),
    btnSatelliteView: document.getElementById('btn-satellite-view'),
    btnAuditTrail: document.getElementById('btn-audit-trail'),
    modalAudit: document.getElementById('modal-audit-trail'),
    btnCloseAudit: document.getElementById('btn-close-audit-modal'),
    auditTbody: document.getElementById('audit-modal-tbody'),
    btnViewCam: document.getElementById('btn-view-cam'),
    modalCam: document.getElementById('modal-cam-view'),
    btnCloseCam: document.getElementById('btn-close-cam-modal'),
    modalFeedImg: document.getElementById('modal-feed-img'),
    btnAcknowledge: document.getElementById('btn-acknowledge'),
    btnEscalate: document.getElementById('btn-escalate'),
    btnToggleDemo: document.getElementById('btn-toggle-demo-drawer'),
    demoBar: document.getElementById('demo-controls-bar'),
    btnResetSandbox: document.getElementById('btn-reset-sandbox'),
    selSpeed: document.getElementById('sel-scenario-speed'),
    clockIst: document.getElementById('clock-ist')
  };

  // 1. Initialize Map
  function initMap() {
    const center = [26.8512, 84.2321];

    map = L.map('c2-leaflet-map', {
      center: center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    // Zoom controls on bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark vector layer
    darkMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    });

    // Satellite imagery layer
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18
    });

    darkMapLayer.addTo(map);

    mapLayers.border = L.layerGroup().addTo(map);
    mapLayers.zones = L.layerGroup().addTo(map);
    mapLayers.nodes = L.layerGroup().addTo(map);
    mapLayers.bop = L.layerGroup().addTo(map);
    mapLayers.alertLine = L.layerGroup().addTo(map);

    // Mouse coordinates readout
    map.on('mousemove', function(e) {
      if (el.cursorCoords) {
        el.cursorCoords.textContent = `${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`;
      }
    });

    setupMapSwitcher();
  }

  function setupMapSwitcher() {
    el.btnMapView.addEventListener('click', () => setBaseLayer('map'));
    el.btnSatelliteView.addEventListener('click', () => setBaseLayer('satellite'));

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'm' || e.key === 'M') setBaseLayer('map');
      if (e.key === 's' || e.key === 'S') setBaseLayer('satellite');
      if (e.key === 'Escape') {
        el.modalCam.classList.remove('active');
        el.modalAudit.classList.remove('active');
      }
    });
  }

  function setBaseLayer(type) {
    if (state.currentBaseLayer === type) return;

    if (type === 'satellite') {
      map.removeLayer(darkMapLayer);
      map.addLayer(satelliteLayer);
      el.btnSatelliteView.classList.add('active');
      el.btnMapView.classList.remove('active');
      state.currentBaseLayer = 'satellite';
    } else {
      map.removeLayer(satelliteLayer);
      map.addLayer(darkMapLayer);
      el.btnMapView.classList.add('active');
      el.btnSatelliteView.classList.remove('active');
      state.currentBaseLayer = 'map';
    }
  }

  // 2. Render Zone Elements on Map
  function renderZoneOnMap(zoneData) {
    state.zone = zoneData;
    mapLayers.border.clearLayers();
    mapLayers.zones.clearLayers();
    mapLayers.nodes.clearLayers();
    mapLayers.bop.clearLayers();

    // 2a. International Border Indicative Line
    if (zoneData.international_border) {
      const borderPoly = L.polyline(zoneData.international_border, {
        color: '#64748b',
        weight: 2,
        dashArray: '6, 6',
        opacity: 0.8
      }).addTo(mapLayers.border);

      // Label along border
      L.marker([26.8575, 84.2230], {
        icon: L.divIcon({
          className: 'border-line-label',
          html: 'International border (indicative)',
          iconSize: [200, 20],
          iconAnchor: [50, 10]
        })
      }).addTo(mapLayers.border);
    }

    // 2b. Geofence Zones (dashed colored polygons)
    (zoneData.geofences || []).forEach(gf => {
      L.polygon(gf.polygon, {
        color: gf.color,
        weight: 1.5,
        dashArray: '4, 6',
        fillColor: gf.color,
        fillOpacity: 0.12
      }).addTo(mapLayers.zones);
    });

    // 2c. Nodes (N1, N2, N3, N4)
    (zoneData.nodes || []).forEach(node => {
      const isWarn = node.status === 'warning' || (state.nodes[node.id] && state.nodes[node.id].status === 'warning');
      const isOffline = state.nodes[node.id] && state.nodes[node.id].status === 'offline';

      const icon = L.divIcon({
        className: 'node-marker-wrap',
        html: `
          <div class="node-circle-marker">
            <div class="node-circle-outer ${isWarn ? 'warning' : ''}" style="${isOffline ? 'border-color:#64748b; background:rgba(100,116,139,0.2);' : ''}">
              ${node.id}
            </div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const m = L.marker([node.lat, node.lon], { icon: icon }).addTo(mapLayers.nodes);
      m.on('click', () => {
        // Select related alert if exists
        const matched = state.alerts.find(a => a.primary_node.includes(node.id));
        if (matched) selectAlert(matched.alert_id);
      });
    });

    // 2d. Forward Outpost BOP-1
    (zoneData.bops || []).forEach(bop => {
      const bopIcon = L.divIcon({
        className: 'bop-marker-wrap',
        html: `<div class="bop-shield-marker">${bop.name}</div>`,
        iconSize: [110, 26],
        iconAnchor: [55, 13]
      });

      L.marker([bop.lat, bop.lon], { icon: bopIcon }).addTo(mapLayers.bop);
    });

    // Update alert vector line
    updateAlertVectorLine();
  }

  function updateAlertVectorLine() {
    mapLayers.alertLine.clearLayers();
    const curr = state.alerts.find(a => a.alert_id === state.selectedAlertId);
    if (!curr || !state.zone || !state.zone.bops) return;

    const bop = state.zone.bops[0];
    if (bop && curr.lat && curr.lon) {
      L.polyline([[bop.lat, bop.lon], [curr.lat, curr.lon]], {
        color: curr.band === 'high' ? '#ef4444' : '#f59e0b',
        weight: 1.5,
        dashArray: '3, 6',
        opacity: 0.7
      }).addTo(mapLayers.alertLine);
    }
  }

  // 3. Render Alert Queue (Left Column)
  function renderAlertQueue() {
    const filtered = state.alerts.filter(a => {
      if (state.activeFilter === 'all') return true;
      return a.band === state.activeFilter;
    });

    const activeCount = state.alerts.filter(a => a.band === 'high' || a.band === 'review').length;
    el.activeCount.textContent = `${activeCount} active`;

    el.queueList.innerHTML = filtered.map(a => {
      const isSelected = a.alert_id === state.selectedAlertId;
      const targetText = a.detected_class || 'Target activity';
      const nodeCamText = a.primary_node;
      const etaText = a.eta_minutes > 0 ? `ETA ${Math.round(a.eta_minutes)} min` : 'ETA —';

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
        </div>
      `;
    }).join('');

    // Attach click events
    el.queueList.querySelectorAll('.queue-card').forEach(card => {
      card.addEventListener('click', () => {
        selectAlert(card.getAttribute('data-id'));
      });
    });
  }

  function selectAlert(alertId) {
    state.selectedAlertId = alertId;
    renderAlertQueue();
    updateAlertVectorLine();

    const target = state.alerts.find(a => a.alert_id === alertId);
    if (target) {
      renderAlertDetail(target);
      if (map && target.lat && target.lon) {
        map.panTo([target.lat, target.lon], { animate: true, duration: 0.6 });
      }
    }
  }

  // 4. Render Active Alert Details (Right Column)
  function renderAlertDetail(alert) {
    document.getElementById('detail-id').textContent = alert.alert_id;
    const badgeEl = document.getElementById('detail-badge');
    badgeEl.textContent = `${alert.band.toUpperCase()} · ${alert.score}`;
    badgeEl.className = `detail-badge ${alert.band}`;

    document.getElementById('detail-target').textContent = alert.detected_class || 'Person ×3';
    document.getElementById('detail-seen').textContent = alert.created_at || '2 min ago';
    document.getElementById('detail-node').textContent = alert.primary_node || 'N3 · CAM 07';
    document.getElementById('detail-dist').textContent = `${alert.distance_km} km`;

    // Why this score list
    const rowsBox = document.getElementById('why-score-rows');
    rowsBox.innerHTML = (alert.reasons || []).map(r => `
      <div class="score-row">
        <span>${r.factor}</span>
        <span class="score-val">${r.weight > 0 ? '+' : ''}${r.weight}</span>
      </div>
    `).join('');

    document.getElementById('detail-total-score').textContent = alert.score;

    // Sub-line sensor confidences
    const confLine = document.getElementById('detail-confidence-line');
    if (alert.band === 'high') {
      confLine.textContent = 'Thermal 94% · PIR 88% · Seismic 81%';
    } else if (alert.band === 'review') {
      confLine.textContent = 'Seismic 85% · PIR 78% · Thermal N/A';
    } else {
      confLine.textContent = 'Thermal 89% · Seismic 62%';
    }

    // Intercept ETA
    const etaVal = document.getElementById('detail-eta-val');
    etaVal.textContent = alert.eta_minutes > 0 ? `${Math.round(alert.eta_minutes)} min` : '—';

    // Update CAM View button
    const btnCam = document.getElementById('btn-view-cam');
    if (alert.primary_node.includes('CAM 12')) {
      btnCam.textContent = 'View CAM 12';
    } else if (alert.primary_node.includes('CAM 13')) {
      btnCam.textContent = 'View CAM 13';
    } else {
      btnCam.textContent = 'View CAM 07';
    }
  }

  // 5. Render Sensor Health Table
  function renderSensorHealth() {
    const nodes = [
      { id: 'N1', battery: '91%', signal: '−71 dBm', seen: '1 s', warn: false },
      { id: 'N2', battery: '84%', signal: '−76 dBm', seen: '1 s', warn: false },
      { id: 'N3', battery: '67%', signal: '−82 dBm', seen: '2 s', warn: false },
      { id: 'N4', battery: '23%', signal: '−88 dBm', seen: '4 s', warn: true }
    ];

    // If dynamic node status exists
    Object.keys(state.nodes).forEach(k => {
      const cleanK = k.replace('Z1-', '');
      const found = nodes.find(n => n.id === cleanK);
      if (found) {
        if (state.nodes[k].battery !== undefined) found.battery = `${state.nodes[k].battery}%`;
        if (state.nodes[k].status === 'offline') {
          found.seen = 'OFFLINE';
          found.warn = true;
        }
      }
    });

    el.healthTableBody.innerHTML = nodes.map(n => `
      <tr>
        <td>${n.id}</td>
        <td style="${n.warn ? 'color:var(--amber);' : ''}">${n.battery}</td>
        <td>${n.signal}</td>
        <td style="text-align:right;">${n.seen}</td>
      </tr>
    `).join('');
  }

  // 6. Render Sensor Log Box
  function renderSensorLogs() {
    if (!el.sensorLogBox) return;

    el.sensorLogBox.innerHTML = state.sensorLogs.map(l => `
      <div class="log-row ${l.type === 'high' ? 'high' : ''}">
        <span class="log-time">${l.time}</span>
        <span class="log-source">${l.source}</span>
        <span class="log-text">${l.text}</span>
      </div>
    `).join('');

    el.sensorLogBox.scrollTop = el.sensorLogBox.scrollHeight;
  }

  // 7. WebSocket Synchronization
  let ws = null;
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (err) {
        console.error('WS Parse error', err);
      }
    };

    ws.onclose = function() {
      setTimeout(connectWebSocket, 2000);
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

  // 8. Event Handlers & Modals
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

    // Cam View Modal
    el.btnViewCam?.addEventListener('click', () => {
      const alert = state.alerts.find(a => a.alert_id === state.selectedAlertId);
      if (alert && alert.snapshot) {
        el.modalFeedImg.src = alert.snapshot;
      }
      el.modalCam.classList.add('active');
    });

    el.btnCloseCam?.addEventListener('click', () => {
      el.modalCam.classList.remove('active');
    });

    // Audit Modal
    el.btnAuditTrail?.addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/audit');
        const data = await resp.json();
        el.auditTbody.innerHTML = data.slice().reverse().map(item => `
          <tr>
            <td style="font-family:var(--font-mono); font-size:10.5px;">${item.timestamp.split('T')[1].split('.')[0]}</td>
            <td style="color:#93c5fd;">${item.category}</td>
            <td>${item.actor}</td>
            <td>${item.summary}</td>
          </tr>
        `).join('');
        el.modalAudit.classList.add('active');
      } catch (err) {
        console.error(err);
      }
    });

    el.btnCloseAudit?.addEventListener('click', () => {
      el.modalAudit.classList.remove('active');
    });

    // Acknowledge & Escalate Buttons
    el.btnAcknowledge?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', note: 'Acknowledged by operator' })
      });
      el.btnAcknowledge.textContent = 'Acknowledged ✓';
      setTimeout(() => { el.btnAcknowledge.textContent = 'Acknowledge'; }, 1500);
    });

    el.btnEscalate?.addEventListener('click', async () => {
      if (!state.selectedAlertId) return;
      await fetch(`/api/alerts/${state.selectedAlertId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'escalate', note: 'Escalated to sector command' })
      });
      el.btnEscalate.textContent = 'Escalated ↑';
      setTimeout(() => { el.btnEscalate.textContent = 'Escalate'; }, 1500);
    });

    // Demo Scenarios Runner
    document.querySelectorAll('.demo-btn[data-scenario]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scName = btn.getAttribute('data-scenario');
        const speed = parseFloat(el.selSpeed.value || '1.0');
        await fetch(`/api/scenarios/${scName}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: speed })
        });
      });
    });

    // Reset Sandbox
    el.btnResetSandbox?.addEventListener('click', async () => {
      await fetch('/api/demo/reset', { method: 'POST' });
    });

    // Clock IST
    setInterval(() => {
      const now = new Date();
      if (el.clockIst) {
        el.clockIst.textContent = now.toTimeString().split(' ')[0] + ' IST';
      }
    }, 1000);
  }

  // Bootstrap
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupHandlers();
    connectWebSocket();
  });

})();
