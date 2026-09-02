import * as THREE from 'three';
import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createSyncMonitor } from './ui/syncMonitor.js';

async function main() {
  const mount = document.querySelector('#app');
  if (!mount) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111111');

  const rect = mount.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 100);
  camera.position.set(0, 0, 16); 

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  mount.appendChild(renderer.domElement);

  const params = createParameters();
  const simulation = createSimulation({ scene, params });
  const syncMonitor = createSyncMonitor();
  const trackListFills = new Map();

  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (handle) { handle.onmousedown = dragMouseDown; } else { element.onmousedown = dragMouseDown; }
    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX; pos4 = e.clientY;
      document.onmouseup = closeDragElement; document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
      pos3 = e.clientX; pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
    }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; }
  }

  makeDraggable(document.querySelector('.ie-window'), document.querySelector('.title-bar'));
  makeDraggable(syncMonitor.panel, syncMonitor.panel.querySelector('.sync-monitor-titlebar'));

  simulation.addTrack('Kick');
  simulation.addTrack('Bass');
  renderTrackListUI();

  // --- CONTROLES GLOBALES UI ---
  document.getElementById('k-slider').addEventListener('input', (e) => {
    params.couplingK = parseFloat(e.target.value);
    document.getElementById('k-val').innerText = params.couplingK.toFixed(1);
  });
  
  document.getElementById('bpm-slider').addEventListener('input', (e) => {
    params.bpm = parseFloat(e.target.value);
    document.getElementById('bpm-val').innerText = params.bpm;
  });
  
  const omegaSlider = document.getElementById('omega-slider');
  if (omegaSlider) {
    omegaSlider.addEventListener('input', (e) => {
      params.omegaSpread = parseFloat(e.target.value);
      document.getElementById('omega-val').innerText = params.omegaSpread.toFixed(2);
    });
  }
  document.getElementById('reset-btn').addEventListener('click', () => { simulation.reset(); });

  const startAudioBtn = document.getElementById('start-audio-btn');
  startAudioBtn.addEventListener('click', async () => {
    await Tone.start();
    document.getElementById('audio-status').innerText = 'Audio: Running';
    document.getElementById('audio-status').style.color = 'green';
    startAudioBtn.innerText = '■ Audio Active';
    startAudioBtn.style.color = 'black';
  });

  const toggleMonitorBtn = document.getElementById('toggle-monitor-btn');
  if (toggleMonitorBtn) {
    toggleMonitorBtn.addEventListener('click', () => {
      syncMonitor.panel.style.display = syncMonitor.panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  document.getElementById('add-track-btn').addEventListener('click', () => {
    if (simulation.tracks.length >= 8) return alert('Límite de pistas alcanzado.');
    simulation.addTrack(document.getElementById('new-track-type').value);
    renderTrackListUI();
  });

  function renderTrackListUI() {
    const list = document.getElementById('track-list');
    list.innerHTML = '';
    trackListFills.clear();

    simulation.tracks.forEach(track => {
      const hex = '#' + track.config.color.toString(16).padStart(6, '0');
      const div = document.createElement('div');
      div.className = 'track-item';

      // FILA 1: Nombre, Botones Mute y Eliminar
      const row1 = document.createElement('div');
      row1.className = 'track-item-row-1';
      
      const name = document.createElement('span');
      name.innerText = `[${track.type}] ID:${track.id.substring(track.id.length - 4)}`;
      name.style.color = hex;
      name.className = 'track-item-name';
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'track-item-actions';

      const muteBtn = document.createElement('button');
      muteBtn.innerText = 'M';
      muteBtn.className = track.muted ? 'mute-btn is-active' : 'mute-btn';
      muteBtn.onclick = () => {
        track.muted = !track.muted;
        simulation.setTrackMuted(track.id, track.muted);
        muteBtn.classList.toggle('is-active', track.muted);
      };

      const delBtn = document.createElement('button');
      delBtn.innerText = 'X';
      delBtn.onclick = () => { simulation.removeTrack(track.id); renderTrackListUI(); };
      
      actionsDiv.append(muteBtn, delBtn);
      row1.append(name, actionsDiv);

      // FILA 2: Controles Musicales (Modo, Multiplicador, Volumen)
      const row2 = document.createElement('div');
      row2.className = 'track-item-row-2';

      const modeSelect = document.createElement('select');
      modeSelect.innerHTML = `<option value="kuramoto" ${track.mode === 'kuramoto' ? 'selected':''}>Kuramoto</option>
                              <option value="beat" ${track.mode === 'beat' ? 'selected':''}>Beat (Sync)</option>`;
      
      const speedSelect = document.createElement('select');
      speedSelect.innerHTML = `<option value="0.5" ${track.beatMultiplier === 0.5 ? 'selected':''}>x0.5</option>
                               <option value="1" ${track.beatMultiplier === 1 ? 'selected':''}>x1</option>
                               <option value="2" ${track.beatMultiplier === 2 ? 'selected':''}>x2</option>
                               <option value="4" ${track.beatMultiplier === 4 ? 'selected':''}>x4</option>
                               <option value="8" ${track.beatMultiplier === 8 ? 'selected':''}>x8</option>
                               <option value="16" ${track.beatMultiplier === 16 ? 'selected':''}>x16</option>
                               <option value="32" ${track.beatMultiplier === 32 ? 'selected':''}>x32</option>`;
      speedSelect.style.display = track.mode === 'beat' ? 'inline-block' : 'none';

      modeSelect.onchange = (e) => { 
        simulation.setTrackMode(track.id, e.target.value); 
        speedSelect.style.display = e.target.value === 'beat' ? 'inline-block' : 'none';
      };
      speedSelect.onchange = (e) => { simulation.setTrackMultiplier(track.id, parseFloat(e.target.value)); };

      // NUEVO: Control de Volumen por Pista
      const volDiv = document.createElement('div');
      volDiv.className = 'track-vol-container';
      
      const volLabel = document.createElement('span');
      volLabel.innerText = 'Vol:';
      
      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.min = -40; 
      volSlider.max = 10;
      volSlider.value = Math.round(track.synth.volume.value);
      volSlider.className = 'vol-slider';
      
      volSlider.addEventListener('input', (e) => {
        simulation.setTrackVolume(track.id, parseFloat(e.target.value));
      });

      volDiv.append(volLabel, volSlider);
      row2.append(modeSelect, speedSelect, volDiv);

      const bar = document.createElement('div');
      bar.className = 'mini-order-bar';
      const fill = document.createElement('div');
      fill.className = 'mini-order-fill';
      fill.style.background = hex;
      bar.appendChild(fill);

      div.append(row1, row2, bar);
      list.appendChild(div);
      trackListFills.set(track.id, fill);
    });
  }

  function updateTrackListBars() {
    simulation.tracks.forEach(track => {
      const fill = trackListFills.get(track.id);
      if (fill) fill.style.width = `${Math.round((track.orderParam || 0) * 100)}%`;
    });
  }

  const globalStateEl = document.getElementById('global-state');
  function updateGlobalStateReadout() {
    if (!globalStateEl) return;
    const { r, label } = simulation.getGlobalOrder();
    globalStateEl.innerText = `Estado: ${label} (${Math.round(r * 100)}%)`;
    globalStateEl.className = 'state-readout ' + (label.includes('estable') ? 'state-stable' : label.includes('parcial') ? 'state-partial' : 'state-disorder');
  }

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => { mouseX = (e.clientX / innerWidth) * 2 - 1; mouseY = -(e.clientY / innerHeight) * 2 + 1; });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  mount.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const intersects = raycaster.intersectObjects(simulation.tracks.flatMap(t => t.particles.map(p => p.mesh)));
    if (intersects.length > 0) {
      for (const track of simulation.tracks) {
        if (track.particles.some(p => p.mesh === intersects[0].object)) {
          simulation.perturbTrack(track.id);
          break;
        }
      }
    }
  });

  window.addEventListener('resize', () => {
    const newRect = mount.getBoundingClientRect();
    if (newRect.width === 0 || newRect.height === 0) return;
    camera.aspect = newRect.width / newRect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(newRect.width, newRect.height);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    camera.position.x += (mouseX * params.parallaxStrength * 2 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * params.parallaxStrength * 2 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    simulation.stepSimulation(dt, clock.getElapsedTime());
    renderer.render(scene, camera);
    updateTrackListBars();
    updateGlobalStateReadout();
    syncMonitor.update(simulation);
  });
}
main().catch(console.error);