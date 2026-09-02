// src/ui/syncMonitor.js
//
// Panel flotante de SOLO LECTURA. No controla ningún parámetro (eso ya vive
// en la barra de herramientas / kuramoto-controls de index.html); su único
// trabajo es comunicar el estado colectivo del sistema en todo momento:
// el parámetro de orden global y el de cada pista. Es la respuesta directa
// al requisito de "al menos 1 forma perceptible de comunicar el estado
// colectivo" del enunciado.

export function createSyncMonitor() {
  const panel = document.createElement('aside');
  panel.className = 'sync-monitor';
  panel.innerHTML = `
    <div class="sync-monitor-titlebar">
      <span>Sync_Monitor.exe</span>
      <button id="sync-monitor-close" title="Ocultar panel">X</button>
    </div>
    <div class="sync-monitor-body">
      <div class="global-readout">
        <div class="global-label" id="sm-global-label">Desorden</div>
        <div class="global-bar-track"><div class="global-bar-fill" id="sm-global-fill"></div></div>
        <div class="global-pct" id="sm-global-pct">0%</div>
      </div>
      <div class="track-rows" id="sm-track-rows"></div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelector('#sync-monitor-close').onclick = () => {
    panel.style.display = 'none';
  };

  function stateClass(label) {
    if (label.includes('estable')) return 'is-stable';
    if (label.includes('parcial')) return 'is-partial';
    return 'is-disorder';
  }

  function update(simulation) {
    const { r, label } = simulation.getGlobalOrder();
    const pct = Math.round(r * 100);

    const cls = stateClass(label);
    const labelEl = panel.querySelector('#sm-global-label');
    const fillEl = panel.querySelector('#sm-global-fill');

    labelEl.innerText = label;
    labelEl.className = `global-label ${cls}`;
    fillEl.style.width = `${pct}%`;
    fillEl.className = `global-bar-fill ${cls}`;
    panel.querySelector('#sm-global-pct').innerText = `${pct}%`;

    const rows = panel.querySelector('#sm-track-rows');
    // Reutilizamos filas existentes por id para no recrear el DOM cada frame
    const seen = new Set();
    simulation.tracks.forEach(track => {
      seen.add(track.id);
      let row = rows.querySelector(`[data-track-id="${track.id}"]`);
      const hex = '#' + track.config.color.toString(16).padStart(6, '0');
      const trackPct = Math.round((track.orderParam || 0) * 100);

      if (!row) {
        row = document.createElement('div');
        row.className = 'track-row';
        row.dataset.trackId = track.id;
        row.innerHTML = `
          <span class="led" style="background:${hex}"></span>
          <span class="track-row-label">${track.type}</span>
          <div class="track-row-bar"><div class="track-row-fill" style="background:${hex}"></div></div>
        `;
        rows.appendChild(row);
      }
      row.querySelector('.track-row-fill').style.width = `${trackPct}%`;
    });

    // Quitar filas de pistas eliminadas
    rows.querySelectorAll('[data-track-id]').forEach(row => {
      if (!seen.has(row.dataset.trackId)) row.remove();
    });
  }

  function show() {
    panel.style.display = 'block';
  }

  return { panel, update, show };
}