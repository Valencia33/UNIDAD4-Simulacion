import * as THREE from 'three';
import './styles.css';
import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createSyncMonitor } from './ui/syncMonitor.js';

async function main() {
  const mount = document.querySelector('#app');
  if (!mount) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0a0a'); 

  const rect = mount.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 100);
  camera.position.set(0, 0, 12); 

  const renderer = new THREE.WebGLRenderer({ antialias: false }); 
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  mount.appendChild(renderer.domElement);

  // --- SHADER CRT ---
  const rtWidth = 400; const rtHeight = 300; 
  const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  renderTarget.texture.minFilter = THREE.NearestFilter; renderTarget.texture.magFilter = THREE.NearestFilter;
  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  
  const shaderVert = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;
  const shaderFrag = `
    uniform sampler2D tDiffuse; uniform float time; uniform float u_panic; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
        vec2 uv = vUv * 2.0 - 1.0; uv += uv * dot(uv, uv) * 0.04; uv = uv * 0.5 + 0.5;
        if (u_panic > 0.5) {
            uv.x += sin(uv.y * 50.0 + time * 20.0) * 0.05 * rand(vec2(time));
            if (fract(time * 15.0) > 0.5) uv.y = 1.0 - uv.y;
        }
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec4 tex = texture2D(tDiffuse, uv);
        if (u_panic > 0.5) {
            tex.r = texture2D(tDiffuse, uv + vec2(0.03, 0.0)).r; tex.b = texture2D(tDiffuse, uv - vec2(0.03, 0.0)).b;
            if (rand(uv + time) > 0.8) tex.rgb = 1.0 - tex.rgb; 
        }
        float scanline = sin(uv.y * 300.0 * 3.1415) * 0.08; tex.rgb -= scanline;
        float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y); vignette = clamp(pow(16.0 * vignette, 0.25), 0.0, 1.0);
        tex.rgb *= vignette; gl_FragColor = tex;
    }`;

  const postMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: renderTarget.texture }, time: { value: 0 }, u_panic: { value: 0.0 } },
    vertexShader: shaderVert, fragmentShader: shaderFrag
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

  const params = createParameters();
  const simulation = createSimulation({ scene, params });
  const syncMonitor = createSyncMonitor();
  const trackListFills = new Map();
  let activeFXTrackId = null; 

  // --- SISTEMA DE VENTANAS ARRASTRABLES ---
  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (handle) { handle.onmousedown = dragMouseDown; } else { element.onmousedown = dragMouseDown; }
    function dragMouseDown(e) { e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; }
    function elementDrag(e) { e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY; element.style.top = (element.offsetTop - pos2) + "px"; element.style.left = (element.offsetLeft - pos1) + "px"; }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; }
  }

  makeDraggable(document.querySelector('#main-window'), document.querySelector('#main-window-titlebar'));
  makeDraggable(syncMonitor.panel, syncMonitor.panel.querySelector('.sync-monitor-titlebar'));
  makeDraggable(document.getElementById('fx-window'), document.getElementById('fx-window-titlebar'));
  makeDraggable(document.getElementById('vis-window'), document.getElementById('vis-window-titlebar'));
  
  const globalWindow = document.getElementById('global-window');
  makeDraggable(globalWindow, document.getElementById('global-window-titlebar'));
  document.getElementById('toggle-global-btn').addEventListener('click', () => { globalWindow.classList.toggle('is-open'); });
  document.getElementById('close-global-btn').onclick = () => { globalWindow.classList.remove('is-open'); };

  // --- LÓGICA DEL FX RACK ---
  const fxWindow = document.getElementById('fx-window');
  document.getElementById('close-fx-btn').onclick = () => { fxWindow.classList.remove('is-open'); };
  document.getElementById('add-fx-btn').onclick = () => {
    if (!activeFXTrackId) return;
    const type = document.getElementById('fx-type-select').value;
    simulation.addFX(activeFXTrackId, type);
    renderFXList();
  };

  function openFXMenu(trackId) {
    activeFXTrackId = trackId; const track = simulation.tracks.find(t => t.id === trackId);
    if (!track) return; document.getElementById('fx-window-title').innerText = `FX Rack - [${track.type}]`;
    fxWindow.classList.add('is-open'); renderFXList();
  }

  function renderFXList() {
    const list = document.getElementById('fx-list'); list.innerHTML = '';
    const track = simulation.tracks.find(t => t.id === activeFXTrackId);
    if (!track || track.fxChain.length === 0) { list.innerHTML = '<div style="padding:10px; color:#666;">No effects chained.</div>'; return; }
    track.fxChain.forEach(fx => {
      const fxDiv = document.createElement('div'); fxDiv.className = 'fx-item';
      const header = document.createElement('div'); header.className = 'fx-item-header'; header.innerHTML = `<span>${fx.type}</span>`;
      const delBtn = document.createElement('button'); delBtn.innerText = 'X'; delBtn.onclick = () => { simulation.removeFX(track.id, fx.id); renderFXList(); };
      header.appendChild(delBtn); fxDiv.appendChild(header);
      fx.uiParams.forEach(p => {
        const pRow = document.createElement('div'); pRow.className = 'fx-param-row';
        const label = document.createElement('label'); label.innerText = p.name;
        const valSpan = document.createElement('span'); valSpan.className = 'fx-param-val'; valSpan.innerText = Number.isInteger(p.val) ? p.val : p.val.toFixed(2);
        const slider = document.createElement('input'); slider.type = 'range'; slider.min = p.min; slider.max = p.max; slider.step = p.step; slider.value = p.val;
        slider.oninput = (e) => { const val = parseFloat(e.target.value); simulation.setFXParam(track.id, fx.id, p.param, val); valSpan.innerText = Number.isInteger(p.val) ? val : val.toFixed(2); };
        pRow.append(label, slider, valSpan); fxDiv.appendChild(pRow);
      });
      list.appendChild(fxDiv);
    });
  }

  // --- MOTOR DEL VISUALIZADOR 3D (LANDSCAPE) ---
  const visWindow = document.getElementById('vis-window');
  document.getElementById('toggle-vis-btn').addEventListener('click', () => { visWindow.classList.toggle('is-open'); });
  document.getElementById('close-vis-btn').onclick = () => { visWindow.classList.remove('is-open'); };

  const visMount = document.getElementById('vis-app');
  const visScene = new THREE.Scene(); visScene.background = new THREE.Color('#030303');
  const visCamera = new THREE.PerspectiveCamera(45, 640 / 450, 0.1, 100); visCamera.position.set(0, 4, 12); visCamera.lookAt(0, -2, 0);

  const visRenderer = new THREE.WebGLRenderer({ antialias: false }); visRenderer.setSize(640, 450); visMount.appendChild(visRenderer.domElement);
  const visRT = new THREE.WebGLRenderTarget(320, 240); visRT.texture.minFilter = THREE.NearestFilter; visRT.texture.magFilter = THREE.NearestFilter;
  
  const visPostScene = new THREE.Scene();
  const visPostMaterial = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: visRT.texture }, time: { value: 0 }, u_panic: { value: 0.0 } }, vertexShader: shaderVert, fragmentShader: shaderFrag });
  visPostScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), visPostMaterial));

  const instrumentOrder = ['Kick', 'Snare', 'HiHat', 'Bass', 'Chord', 'Lead', 'Pluck', 'Glitch'];
  const instrumentColors = [0xff3366, 0xff8800, 0xffff00, 0x3366ff, 0x00ffcc, 0x9933ff, 0xff33cc, 0xffffff];
  const visParticleSystems = [];
  const planeWidth = 26; const planeDepth = 2.5;

  instrumentOrder.forEach((name, i) => {
    const particlesCount = 1500; 
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particlesCount * 3);
    for(let j = 0; j < particlesCount; j++) {
      positions[j*3] = (Math.random() - 0.5) * planeWidth; positions[j*3+1] = 0; positions[j*3+2] = (Math.random() - 0.5) * planeDepth;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: instrumentColors[i], size: 0.12, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.position.z = (i - 3.5) * planeDepth; points.userData = { type: name };
    visScene.add(points); visParticleSystems.push(points);
  });

  const interactionPlane = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({visible: false}));
  interactionPlane.rotation.x = -Math.PI/2; visScene.add(interactionPlane);

  let visMouseRipple = { active: false, x: 0, z: 0 };
  const visRaycaster = new THREE.Raycaster(); const visMouseNdc = new THREE.Vector2();

  visRenderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons > 0) {
      const rect = visRenderer.domElement.getBoundingClientRect();
      visMouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; visMouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      visRaycaster.setFromCamera(visMouseNdc, visCamera);
      const intersects = visRaycaster.intersectObject(interactionPlane);
      if (intersects.length > 0) { visMouseRipple.active = true; visMouseRipple.x = intersects[0].point.x; visMouseRipple.z = intersects[0].point.z; }
    } else { visMouseRipple.active = false; }
  });

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => { mouseX = (e.clientX / innerWidth) * 2 - 1; mouseY = -(e.clientY / innerHeight) * 2 + 1; });

  // --- MACROS PERFORMATIVOS (Chaos Pad y Panic Button) ---
  const pad = document.getElementById('chaos-pad');
  const cursor = document.getElementById('chaos-cursor');
  const kSlider = document.getElementById('k-slider');
  const wSlider = document.getElementById('omega-slider');

  function updateFromPad(e) {
    if (e.buttons === 0) return;
    const rect = pad.getBoundingClientRect();
    let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    cursor.style.left = `${x * 100}%`; cursor.style.top = `${y * 100}%`;
    params.omegaSpread = x * 2.5; params.couplingK = (1 - y) * 5.0;

    wSlider.value = params.omegaSpread; document.getElementById('omega-val').innerText = params.omegaSpread.toFixed(2);
    kSlider.value = params.couplingK; document.getElementById('k-val').innerText = params.couplingK.toFixed(1);
  }

  pad.addEventListener('pointerdown', updateFromPad); pad.addEventListener('pointermove', updateFromPad);

  kSlider.addEventListener('input', (e) => { params.couplingK = parseFloat(e.target.value); document.getElementById('k-val').innerText = params.couplingK.toFixed(1); cursor.style.top = `${(1 - (params.couplingK / 5.0)) * 100}%`; });
  wSlider.addEventListener('input', (e) => { params.omegaSpread = parseFloat(e.target.value); document.getElementById('omega-val').innerText = params.omegaSpread.toFixed(2); cursor.style.left = `${(params.omegaSpread / 2.5) * 100}%`; });

  // --- LÓGICA DE VENTANAS DE ERROR (MEMORY LEAK) ---
  let panicInterval;
  const errorMessages = [ "FATAL EXCEPTION 0E: KURAMOTO_SYNC_OVERFLOW", "BUFFER UNDERRUN: TONE.JS AUDIO CONTEXT", "MEMORY LEAK DETECTED IN LANDSCAPE.EXE", "DIVISION BY ZERO IN PHASE EVALUATION", "STACK OVERFLOW: UNWRAPPED_PHASE LIMIT" ];

  function spawnErrorWindow() {
    const popup = document.createElement('div');
    popup.className = 'error-popup';
    // Distribuir agresivamente por toda la pantalla
    popup.style.left = `${Math.random() * 80 + 5}vw`;
    popup.style.top = `${Math.random() * 80 + 5}vh`;
    const msg = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    popup.innerHTML = `
      <div class="title-bar">Error Crítico</div>
      <div class="content">
        <div class="error-icon">❌</div>
        <div class="error-text">${msg}</div>
      </div>
      <button>OK</button>
    `;
    document.body.appendChild(popup);
  }

  const panicBtn = document.getElementById('panic-btn');
  
  panicBtn.addEventListener('pointerdown', () => {
    postMaterial.uniforms.u_panic.value = 1.0; visPostMaterial.uniforms.u_panic.value = 1.0;
    params.couplingK = 0; params.omegaSpread = 5.0;
    simulation.triggerPanic(true);
    
    // Dispara las ventanas agresivamente
    panicInterval = setInterval(spawnErrorWindow, 90);
  });

  window.addEventListener('pointerup', (e) => {
    if (postMaterial.uniforms.u_panic.value > 0.0) {
      postMaterial.uniforms.u_panic.value = 0.0; visPostMaterial.uniforms.u_panic.value = 0.0;
      simulation.triggerPanic(false);
      renderTrackListUI(); 
      
      // Limpia la pantalla de errores
      clearInterval(panicInterval);
      document.querySelectorAll('.error-popup').forEach(el => el.remove());
    }
  });


  simulation.addTrack('Kick'); simulation.addTrack('Bass'); simulation.addTrack('HiHat');
  renderTrackListUI();

  let lastScrollTime = 0;
  mount.addEventListener('wheel', (e) => {
    e.preventDefault(); 
    if (Date.now() - lastScrollTime < 200) return; 
    if (simulation.tracks.length <= 1) return;
    lastScrollTime = Date.now();
    const currentId = simulation.getSelectedTrack();
    let idx = simulation.tracks.findIndex(t => t.id === currentId);
    if (e.deltaY > 0) { idx = (idx + 1) % simulation.tracks.length; } else { idx = (idx - 1 + simulation.tracks.length) % simulation.tracks.length; }
    simulation.setSelectedTrack(simulation.tracks[idx].id);
    renderTrackListUI();
  }, { passive: false });

  document.getElementById('bpm-slider').addEventListener('input', (e) => { params.bpm = parseFloat(e.target.value); document.getElementById('bpm-val').innerText = params.bpm; });
  document.getElementById('reset-btn').addEventListener('click', () => { simulation.reset(); });

  const startAudioBtn = document.getElementById('start-audio-btn');
  startAudioBtn.addEventListener('click', async () => {
    await Tone.start();
    document.getElementById('audio-status').innerText = 'Audio: Running'; document.getElementById('audio-status').style.color = 'green';
    startAudioBtn.innerText = '■ Audio Active'; startAudioBtn.style.color = 'black';
  });

  document.getElementById('toggle-monitor-btn').addEventListener('click', () => { syncMonitor.toggle(); });
  document.getElementById('add-track-btn').addEventListener('click', () => {
    if (simulation.tracks.length >= 8) return alert('Límite alcanzado.'); simulation.addTrack(document.getElementById('new-track-type').value); renderTrackListUI();
  });

  function renderTrackListUI() {
    const list = document.getElementById('track-list');
    list.innerHTML = '';
    trackListFills.clear();
    const selectedId = simulation.getSelectedTrack();

    simulation.tracks.forEach(track => {
      const hex = '#' + track.config.color.toString(16).padStart(6, '0');
      const div = document.createElement('div'); div.className = `track-item ${selectedId === track.id ? 'is-selected' : ''}`;
      div.onclick = (e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') { simulation.setSelectedTrack(track.id); renderTrackListUI(); } };

      const row1 = document.createElement('div'); row1.className = 'track-item-row-1';
      const name = document.createElement('span'); name.innerText = `[${track.type}]`; name.style.color = hex; name.className = 'track-item-name';
      
      const actionsDiv = document.createElement('div'); actionsDiv.className = 'track-item-actions';
      const fxBtn = document.createElement('button'); fxBtn.innerText = 'FX'; fxBtn.onclick = () => { openFXMenu(track.id); };
      const muteBtn = document.createElement('button'); muteBtn.innerText = 'M'; muteBtn.className = track.muted ? 'mute-btn is-active' : 'mute-btn';
      muteBtn.onclick = () => { track.muted = !track.muted; simulation.setTrackMuted(track.id, track.muted); muteBtn.classList.toggle('is-active', track.muted); };
      const delBtn = document.createElement('button'); delBtn.innerText = 'X';
      delBtn.onclick = () => { simulation.removeTrack(track.id); if (activeFXTrackId === track.id) fxWindow.classList.remove('is-open'); renderTrackListUI(); };
      
      actionsDiv.append(fxBtn, muteBtn, delBtn); row1.append(name, actionsDiv);
      const row2 = document.createElement('div'); row2.className = 'track-item-row-2';
      const modeSelect = document.createElement('select'); modeSelect.innerHTML = `<option value="kuramoto" ${track.mode === 'kuramoto' ? 'selected':''}>Kuramoto</option><option value="beat" ${track.mode === 'beat' ? 'selected':''}>Beat</option>`;
      const speedSelect = document.createElement('select'); speedSelect.innerHTML = `<option value="0.5" ${track.beatMultiplier === 0.5 ? 'selected':''}>x0.5</option><option value="1" ${track.beatMultiplier === 1 ? 'selected':''}>x1</option><option value="2" ${track.beatMultiplier === 2 ? 'selected':''}>x2</option><option value="4" ${track.beatMultiplier === 4 ? 'selected':''}>x4</option><option value="8" ${track.beatMultiplier === 8 ? 'selected':''}>x8</option><option value="16" ${track.beatMultiplier === 16 ? 'selected':''}>x16</option><option value="32" ${track.beatMultiplier === 32 ? 'selected':''}>x32</option>`;
      speedSelect.style.display = track.mode === 'beat' ? 'inline-block' : 'none';
      modeSelect.onchange = (e) => { simulation.setTrackMode(track.id, e.target.value); speedSelect.style.display = e.target.value === 'beat' ? 'inline-block' : 'none'; };
      speedSelect.onchange = (e) => { simulation.setTrackMultiplier(track.id, parseFloat(e.target.value)); };

      const volDiv = document.createElement('div'); volDiv.className = 'track-vol-container';
      const volLabel = document.createElement('span'); volLabel.innerText = 'Vol:';
      const volSlider = document.createElement('input'); volSlider.type = 'range'; volSlider.min = -40; volSlider.max = 10; volSlider.value = Math.round(track.synth.volume.value); volSlider.className = 'vol-slider';
      volSlider.addEventListener('input', (e) => { simulation.setTrackVolume(track.id, parseFloat(e.target.value)); });
      volDiv.append(volLabel, volSlider); row2.append(modeSelect, speedSelect, volDiv);

      const bar = document.createElement('div'); bar.className = 'mini-order-bar';
      const fill = document.createElement('div'); fill.className = 'mini-order-fill'; fill.style.background = hex;
      bar.appendChild(fill); div.append(row1, row2, bar); list.appendChild(div); trackListFills.set(track.id, fill);
    });
  }

  function updateTrackListBars() { simulation.tracks.forEach(track => { const fill = trackListFills.get(track.id); if (fill) fill.style.width = `${Math.round((track.orderParam || 0) * 100)}%`; }); }

  const globalStateEl = document.getElementById('global-state');
  function updateGlobalStateReadout() {
    if (!globalStateEl) return;
    const { r, label } = simulation.getGlobalOrder();
    globalStateEl.innerText = `Estado: ${label} (${Math.round(r * 100)}%)`;
    globalStateEl.className = 'state-readout ' + (label.includes('estable') ? 'state-stable' : label.includes('parcial') ? 'state-partial' : 'state-disorder');
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  
  mount.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1; pointerNdc.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const intersects = raycaster.intersectObjects(simulation.tracks.flatMap(t => t.particles.map(p => p.mesh)));
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      for (const track of simulation.tracks) {
        const hitParticle = track.particles.find(p => p.mesh === hitMesh);
        if (hitParticle) {
          simulation.setSelectedTrack(track.id); 
          simulation.perturbAgent(track.id, hitParticle.id);
          renderTrackListUI();
          break;
        }
      }
    }
  });

  window.addEventListener('resize', () => {
    const newRect = mount.getBoundingClientRect();
    if (newRect.width === 0 || newRect.height === 0) return;
    camera.aspect = newRect.width / newRect.height; camera.updateProjectionMatrix();
    renderer.setSize(newRect.width, newRect.height);
  });

  let lastTime = performance.now();
  
  renderer.setAnimationLoop(() => {
    const currentTime = performance.now();
    const dt = (currentTime - lastTime) / 1000;
    const time = currentTime / 1000;
    lastTime = currentTime;

    camera.position.x += (mouseX * params.parallaxStrength * 2 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * params.parallaxStrength * 2 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    simulation.stepSimulation(dt, time);
    renderer.setRenderTarget(renderTarget); renderer.render(scene, camera);
    
    renderer.setRenderTarget(null); 
    postMaterial.uniforms.time.value = time; 
    renderer.render(postScene, postCamera);

    updateTrackListBars();
    updateGlobalStateReadout();
    syncMonitor.update(simulation);

    if (visWindow.classList.contains('is-open')) {
      visParticleSystems.forEach((points) => {
        const type = points.userData.type;
        const track = simulation.tracks.find(t => t.type === type);
        const positions = points.geometry.attributes.position.array;
        
        const chaos = track && track.mode === 'kuramoto' ? (1.0 - track.orderParam) : 0.0;
        let maxTrackDisplacement = 0.0;

        for (let j = 0; j < positions.length / 3; j++) {
          const x = positions[j*3];
          const localZ = positions[j*3+2];
          const globalZ = localZ + points.position.z; 
          
          let h = Math.sin(x * 0.25 + time * 0.3) * Math.cos(localZ * 0.25 - time * 0.2) * 2.5;
          h += Math.sin(x * 0.6 - time * 0.5) * Math.cos(localZ * 0.7 + time * 0.4) * 1.2;
          
          if (h < 0.0) h = h * 0.15; 
          else h = Math.pow(Math.abs(h), 1.3); 
          
          h *= (1.0 + chaos * 2.0); 

          if (visMouseRipple.active) {
            const dx = x - visMouseRipple.x;
            const dz = globalZ - visMouseRipple.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 5.0) { 
                const push = Math.sin((5.0 - dist) * Math.PI / 5.0) * 3.5;
                h += push; 
                maxTrackDisplacement = Math.max(maxTrackDisplacement, push);
            }
          }
          if (!track) h *= 0.1; 
          positions[j*3+1] = h;
        }
        points.geometry.attributes.position.needsUpdate = true;

        if(track) {
            const audioIntensity = Math.min(1.0, maxTrackDisplacement / 3.5);
            simulation.modulateFromLandscape(type, audioIntensity);
        }
      });

      visRenderer.setRenderTarget(visRT);
      visRenderer.render(visScene, visCamera);
      visRenderer.setRenderTarget(null);
      visPostMaterial.uniforms.time.value = time;
      visRenderer.render(visPostScene, postCamera);
    }
  });
}
main().catch(console.error);