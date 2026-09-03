import * as THREE from 'three';

export function createSimulation({ scene, params }) {
  const tracks = [];
  
  let globalUnwrappedPhase = 0;
  let selectedTrackId = null; 
  let panicActive = false;

  const PENTA_BASS  = ['B1', 'D2', 'E2', 'F#2', 'A2', 'B2', 'D3', 'E3'];
  const PENTA_LEAD  = ['B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6'];
  const PENTA_PLUCK = ['F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6'];
  const PENTA_FULL  = ['B2', 'D3', 'E3', 'F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5'];
  const PENTA_CHORDS = [ ['B3', 'D4', 'F#4'], ['D4', 'F#4', 'A4'], ['F#3', 'A3', 'D4'], ['E3', 'A3', 'B3'] ];

  const InstrumentPresets = {
    'Kick':  { color: 0xff3366, geo: new THREE.BoxGeometry(0.5, 0.5, 0.5), baseOmega: 0.125, baseVolume: 0,  createSynth: () => new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 4 }), notes: ['B1'] },
    'Snare': { color: 0xff8800, geo: new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), baseOmega: 0.125, baseVolume: -4,  createSynth: () => new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { decay: 0.15 } }), notes: null },
    'HiHat': { color: 0xffff00, geo: new THREE.TetrahedronGeometry(0.3), baseOmega: 0.5,   baseVolume: -10, createSynth: () => new Tone.MetalSynth({ envelope: { decay: 0.05 }, resonance: 6000 }), notes: null },
    'Bass':  { color: 0x3366ff, geo: new THREE.SphereGeometry(0.4, 16, 16), baseOmega: 0.25,  baseVolume: -2,  createSynth: () => new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.2 } }), notes: PENTA_BASS },
    'Chord': { color: 0x00ffcc, geo: new THREE.OctahedronGeometry(0.4), baseOmega: 0.0625,baseVolume: -12, createSynth: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square8' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.4 } }), notes: PENTA_CHORDS },
    'Lead':  { color: 0x9933ff, geo: new THREE.TorusGeometry(0.2, 0.1, 8, 16), baseOmega: 0.25,  baseVolume: -10, createSynth: () => new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0 } }), notes: PENTA_LEAD },
    'Pluck': { color: 0xff33cc, geo: new THREE.IcosahedronGeometry(0.3), baseOmega: 0.5,   baseVolume: -10, createSynth: () => new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0 } }), notes: PENTA_PLUCK },
    'Glitch':{ color: 0xffffff, geo: new THREE.DodecahedronGeometry(0.2), baseOmega: 0.5,   baseVolume: -14, createSynth: () => new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.05 } }), notes: PENTA_FULL }
  };

  Tone.Destination.volume.value = params.masterVolume;
  const bitCrusher = new Tone.BitCrusher(8); 
  const masterLimiter = new Tone.Limiter(-1).toDestination();
  bitCrusher.connect(masterLimiter);
  const masterComp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.003, release: 0.25 }).connect(bitCrusher);
  const sharedReverb = new Tone.Freeverb({ roomSize: 0.4, dampening: 4000 }).connect(masterComp);
  sharedReverb.wet.value = 1;

  function layoutTracks() {
    const radius = 7.0; 
    const angleStep = 0.5; 
    let sIdx = tracks.findIndex(t => t.id === selectedTrackId);
    if (sIdx === -1 && tracks.length > 0) { sIdx = 0; selectedTrackId = tracks[0].id; }

    tracks.forEach((track, index) => {
      const angle = (index - sIdx) * angleStep;
      track.targetY = -Math.sin(angle) * radius;
      track.targetZ = Math.cos(angle) * radius - radius; 
      track.targetRotX = angle; 
    });
  }

  function setSelectedTrack(trackId) { selectedTrackId = trackId; layoutTracks(); }
  function getSelectedTrack() { return selectedTrackId; }

  function rebuildTrackAudioChain(track) {
    track.synth.disconnect();
    track.fxChain.forEach(fx => fx.node.disconnect());
    if (track.filter) track.filter.disconnect();
    
    let current = track.synth;
    track.fxChain.forEach(fx => {
      current.connect(fx.node);
      current = fx.node;
    });
    
    current.connect(track.filter);
    track.filter.connect(track.dryGain);
    track.filter.connect(track.sendGain);
  }

  function addTrack(typeId) {
    const preset = InstrumentPresets[typeId];
    if (!preset) return null;

    const id = `track_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const group = new THREE.Group();
    scene.add(group);

    const railGeo = new THREE.BoxGeometry(params.trackWidth, 0.05, 0.05);
    const railMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const rail = new THREE.Mesh(railGeo, railMat);
    group.add(rail); 

    const wallGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
    const wallMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.x = params.trackWidth / 2; 
    group.add(wall);

    const auraGeo = new THREE.RingGeometry(0.5, 1.5, 32);
    const auraMat = new THREE.MeshBasicMaterial({ color: preset.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.z = -100;
    scene.add(aura);

    const dryGain = new Tone.Gain(1);
    const sendGain = new Tone.Gain(params.reverbWet);
    dryGain.connect(masterComp);
    sendGain.connect(sharedReverb);

    const filter = new Tone.Filter(10000, "lowpass");
    const synth = preset.createSynth();
    if (preset.baseVolume !== undefined) synth.volume.value = preset.baseVolume;

    const particles = [];
    for (let i = 0; i < params.particlesPerTrack; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: preset.color });
      const mesh = new THREE.Mesh(preset.geo.clone(), mat);
      group.add(mesh);
      particles.push({ id: i, mesh: mesh, phase: Math.random() * Math.PI * 2, omegaRandUnit: (Math.random() * 2 - 1), lastPhase: 0, baseColor: preset.color, flash: 0 });
    }

    const newTrack = {
      id, type: typeId, config: preset, group, rail, wall, aura, particles, synth, filter, dryGain, sendGain,
      fxChain: [], targetY: 0, targetZ: 0, targetRotX: 0, currentY: 0, currentZ: 0, currentRotX: 0, 
      fadeFactor: 1.0, wallFlash: 0, auraFlash: 0, orderParam: 0, baseWallOpacity: 0.2, muted: false,
      mode: 'kuramoto', beatMultiplier: 1.0, justChangedMode: false 
    };

    rebuildTrackAudioChain(newTrack);
    tracks.push(newTrack);
    selectedTrackId = id; 
    layoutTracks();
    return newTrack;
  }

  function removeTrack(trackId) {
    const index = tracks.findIndex(t => t.id === trackId);
    if (index === -1) return;
    const track = tracks[index];
    scene.remove(track.group); scene.remove(track.aura); 
    track.rail.geometry.dispose(); track.rail.material.dispose();
    track.wall.geometry.dispose(); track.wall.material.dispose();
    track.aura.geometry.dispose(); track.aura.material.dispose();
    track.particles.forEach(p => { p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    track.fxChain.forEach(fx => fx.node.dispose());
    track.synth.dispose(); track.filter.dispose(); track.dryGain.dispose(); track.sendGain.dispose();
    tracks.splice(index, 1);
    if (selectedTrackId === trackId && tracks.length > 0) { selectedTrackId = tracks[0].id; }
    layoutTracks();
  }

  function addFX(trackId, fxType) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const fxId = 'fx_' + Date.now();
    let node, uiParams;

    if (fxType === 'Delay') {
      node = new Tone.PingPongDelay("8n", 0.4);
      uiParams = [{ name: 'Wet', param: 'wet', min: 0, max: 1, step: 0.05, val: 0.5 }, { name: 'Fback', param: 'feedback', min: 0, max: 0.9, step: 0.05, val: 0.4 }];
    } else if (fxType === 'Distortion') {
      node = new Tone.Distortion(0.8);
      uiParams = [{ name: 'Amt', param: 'distortion', min: 0, max: 1, step: 0.05, val: 0.8 }, { name: 'Wet', param: 'wet', min: 0, max: 1, step: 0.05, val: 0.5 }];
    } else if (fxType === 'Chorus') {
      node = new Tone.Chorus(4, 2.5, 0.5).start(); 
      uiParams = [{ name: 'Wet', param: 'wet', min: 0, max: 1, step: 0.05, val: 0.5 }, { name: 'Depth', param: 'depth', min: 0, max: 1, step: 0.05, val: 0.5 }];
    } else if (fxType === 'PitchShift') {
      node = new Tone.PitchShift(7); 
      uiParams = [{ name: 'Shift', param: 'pitch', min: -12, max: 12, step: 1, val: 7 }, { name: 'Wet', param: 'wet', min: 0, max: 1, step: 0.05, val: 0.5 }];
    }
    node.wet.value = 0.5;
    track.fxChain.push({ id: fxId, type: fxType, node, uiParams });
    rebuildTrackAudioChain(track);
  }

  function removeFX(trackId, fxId) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const fxIndex = track.fxChain.findIndex(f => f.id === fxId);
    if (fxIndex === -1) return;
    track.fxChain[fxIndex].node.dispose();
    track.fxChain.splice(fxIndex, 1);
    rebuildTrackAudioChain(track);
  }

  function setFXParam(trackId, fxId, paramName, value) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const fx = track.fxChain.find(f => f.id === fxId);
    if (!fx) return;
    if (fx.node[paramName] !== undefined) {
      if (fx.node[paramName].value !== undefined) fx.node[paramName].value = value;
      else fx.node[paramName] = value;
    }
    const uiP = fx.uiParams.find(p => p.param === paramName);
    if (uiP) uiP.val = value;
  }

  function modulateFromLandscape(typeId, intensity) {
    const track = tracks.find(t => t.type === typeId);
    if (track) {
      const filterFreq = 10000 - (intensity * 9500); 
      track.filter.frequency.rampTo(Math.max(200, filterFreq), 0.1);
      track.sendGain.gain.rampTo(Math.min(1, params.reverbWet + (intensity * 0.8)), 0.1);
      if (track.synth && track.synth.detune) {
        track.synth.detune.rampTo(intensity * 600, 0.1); 
      }
    }
  }

  function triggerPanic(isActive) {
    panicActive = isActive;
    if (isActive) {
      bitCrusher.bits.value = 1;
      sharedReverb.roomSize.value = 0.9;
      sharedReverb.wet.value = 1.0;
    } else {
      bitCrusher.bits.value = 8;
      sharedReverb.roomSize.value = 0.4;
      sharedReverb.wet.value = 1.0;
      
      tracks.forEach(t => {
        t.mode = 'beat';
        t.justChangedMode = true;
      });
    }
  }

  function reset() {
    tracks.forEach(track => {
      track.particles.forEach(p => { p.phase = Math.random() * Math.PI * 2; p.omegaRandUnit = (Math.random() * 2 - 1); });
      track.orderParam = 0;
    });
    globalUnwrappedPhase = 0;
  }

  const _black = new THREE.Color(0x000000); const _white = new THREE.Color(0xffffff);
  const _tempColor = new THREE.Color(); const _baseColor = new THREE.Color();
  const _lowColor = new THREE.Color(0x222222); const _highColor = new THREE.Color();

  function stepSimulation(deltaTime, elapsedTime) {
    const dt = Math.min(deltaTime, 0.05);
    const K = params.couplingK;
    const baseFreqHz = params.bpm / 60;
    
    globalUnwrappedPhase += (baseFreqHz * Math.PI * 2) * dt;

    tracks.forEach(track => {
      track.currentY += (track.targetY - track.currentY) * 0.08;
      track.currentZ += (track.targetZ - track.currentZ) * 0.08;
      track.currentRotX += (track.targetRotX - track.currentRotX) * 0.08;
      track.group.position.set(0, track.currentY, track.currentZ);
      track.group.rotation.x = track.currentRotX;
      track.fadeFactor = Math.max(0.05, 1.0 - (Math.abs(track.currentRotX) * 0.6));

      const N = track.particles.length;
      const newPhases = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        const p = track.particles[i];
        if (track.mode === 'kuramoto') {
          const effectiveSpread = params.omegaSpread * Math.max(0, 1 - (K / 5.0));
          const omega = track.config.baseOmega + p.omegaRandUnit * effectiveSpread;
          let sumSin = 0;
          for (let j = 0; j < N; j++) { if (i !== j) sumSin += Math.sin(track.particles[j].phase - p.phase); }
          newPhases[i] = p.phase + ((omega * baseFreqHz * Math.PI * 2) + ((K / N) * sumSin)) * dt;
        } else {
          const offset = (i / N) * Math.PI * 2;
          newPhases[i] = ((globalUnwrappedPhase * track.config.baseOmega * track.beatMultiplier) + offset) % (Math.PI * 2);
        }
      }

      let sumCos = 0; let sumSin2 = 0;

      for (let i = 0; i < N; i++) {
        const p = track.particles[i];
        p.lastPhase = track.justChangedMode ? (newPhases[i] % (Math.PI * 2)) : p.phase;
        p.phase = (newPhases[i] % (Math.PI * 2));
        if (p.phase < 0) p.phase += Math.PI * 2;

        sumCos += Math.cos(p.phase); sumSin2 += Math.sin(p.phase);
        
        if (p.phase < p.lastPhase - 1.0) triggerAudio(p, track);

        const xPos = (p.phase / (Math.PI * 2) * params.trackWidth) - (params.trackWidth / 2);
        p.mesh.position.x = xPos; p.mesh.position.z = 0; 
        
        if (track.type === 'Kick') { p.mesh.position.y = 0; p.mesh.rotation.set(0,0,0);
        } else if (track.type === 'Snare') { p.mesh.position.y = Math.max(0, 1 - (p.phase / 0.5)) * 0.4; p.mesh.rotation.x = p.phase * 2;
        } else if (track.type === 'HiHat') { p.mesh.position.y = Math.sin(p.phase * 8) * 0.15; p.mesh.rotation.z += 0.2;
        } else if (track.type === 'Bass') { p.mesh.position.y = 0; const scale = 1.0 + Math.sin(elapsedTime * 4 + p.phase) * 0.5; p.mesh.scale.set(scale, scale, scale);
        } else if (track.type === 'Chord') { p.mesh.position.y = Math.sin(p.phase) * 0.4; p.mesh.rotation.x = p.phase;
        } else if (track.type === 'Lead') { p.mesh.position.y = Math.sin(p.phase) * 0.3; p.mesh.position.z = Math.cos(p.phase) * 0.3; p.mesh.lookAt(xPos, 0, 0); 
        } else if (track.type === 'Pluck') { p.mesh.position.y = Math.abs(Math.sin(p.phase * 4)) * 0.2; p.mesh.rotation.y = p.phase * 4;
        } else if (track.type === 'Glitch') { const chaos = 0.4 + 0.6 * (1 - track.orderParam); p.mesh.position.y = (Math.random() * 0.5 - 0.25) * chaos; p.mesh.scale.set(chaos + 0.5, chaos + 0.5, chaos + 0.5); }

        if (track.mode === 'kuramoto' && track.type !== 'Bass' && track.type !== 'Glitch') {
          const syncScale = 1.0 + (track.orderParam * 0.4); p.mesh.scale.set(syncScale, syncScale, syncScale);
        } else if (track.mode === 'beat' && track.type !== 'Bass' && track.type !== 'Glitch') {
          p.mesh.scale.set(1, 1, 1);
        }

        p.flash = Math.max(0, p.flash - dt * 8); 
        _baseColor.setHex(p.baseColor);
        _tempColor.copy(_black).lerp(_baseColor, track.fadeFactor);
        _tempColor.lerp(_white, p.flash);
        p.mesh.material.color.copy(_tempColor);
      }

      track.justChangedMode = false;
      track.orderParam = track.mode === 'kuramoto' ? Math.sqrt(sumCos * sumCos + sumSin2 * sumSin2) / N : 1.0; 
      updateTrackFeedback(track, dt);
    });
  }

  function updateTrackFeedback(track, dt) {
    const r = track.orderParam;
    _highColor.setHex(track.config.color);
    const railC = _lowColor.clone().lerp(_highColor, r).multiplyScalar(track.fadeFactor);
    track.rail.material.color.copy(railC);
    track.rail.scale.y = 1 + (r * 1.5); 
    
    track.wallFlash = Math.max(0, track.wallFlash - dt * 8);
    track.baseWallOpacity = (0.12 + r * 0.45) * track.fadeFactor;
    track.wall.material.opacity = track.baseWallOpacity + (track.wallFlash * 0.6);
    
    track.auraFlash = Math.max(0, track.auraFlash - dt * 2.5); 
    track.aura.material.opacity = track.auraFlash * 0.5;
    const auraScale = 1.0 + (1.0 - track.auraFlash) * 8.0; 
    track.aura.scale.set(auraScale, auraScale, auraScale);

    if(track.filter.frequency.value > 9000) {
        track.sendGain.gain.rampTo(Math.min(1, params.reverbWet + r * params.syncReverbBoost), 0.15);
    }
  }

  function triggerAudio(particle, track) {
    particle.flash = 1.0; track.wallFlash = 1.0; track.auraFlash = 1.0; 
    track.aura.position.x = (Math.random() - 0.5) * 40; track.aura.position.y = (Math.random() - 0.5) * 30;
    track.aura.position.z = -15 - Math.random() * 20; track.aura.rotation.z = Math.random() * Math.PI;

    if (track.muted || panicActive) return;
    if (Tone.context.state === 'running') {
      try {
        if (track.type === 'Snare') { track.synth.triggerAttackRelease('16n');
        } else if (track.type === 'HiHat') { track.synth.triggerAttackRelease('B5', '16n');
        } else if (track.type === 'Glitch') { 
          const randomScaleNote = PENTA_FULL[Math.floor(Math.random() * PENTA_FULL.length)];
          const baseFreq = Tone.Frequency(randomScaleNote).transpose(12);
          track.synth.triggerAttackRelease(baseFreq.toFrequency(), '32n');
        } else if (track.type === 'Chord') { 
          const chordToPlay = track.config.notes[particle.id % track.config.notes.length];
          const notesFreq = chordToPlay.map(n => Tone.Frequency(n).toFrequency());
          track.synth.triggerAttackRelease(notesFreq, '8n');
        } else { 
          const noteToPlay = track.config.notes[particle.id % track.config.notes.length];
          track.synth.triggerAttackRelease(Tone.Frequency(noteToPlay).toFrequency(), '16n'); 
        }
      } catch (e) {
        console.error(`Tone.js Error on track type [${track.type}]:`, e);
      }
    }
  }

  function perturbAgent(trackId, particleId) {
    const track = tracks.find(t => t.id === trackId);
    if (track && track.mode === 'kuramoto') {
      const particle = track.particles.find(p => p.id === particleId);
      if (particle) { particle.phase += params.perturbationStrength + 1.0; particle.flash = 1.0; particle.mesh.scale.set(2, 2, 2); }
    }
  }

  function perturbAgentByType(typeId, particleIndex) {
    const track = tracks.find(t => t.type === typeId);
    if (track && track.mode === 'kuramoto') {
      const particle = track.particles[particleIndex];
      if (particle) { particle.phase += params.perturbationStrength + 1.0; particle.flash = 1.0; particle.mesh.scale.set(2, 2, 2); }
    }
  }

  function setTrackMuted(trackId, muted) { const t = tracks.find(x => x.id === trackId); if (t) t.muted = muted; }
  function setTrackMode(trackId, mode) { const t = tracks.find(x => x.id === trackId); if (t && t.mode !== mode) { t.mode = mode; t.justChangedMode = true; } }
  function setTrackMultiplier(trackId, mult) { const t = tracks.find(x => x.id === trackId); if (t) t.beatMultiplier = mult; }
  function setTrackVolume(trackId, volDb) { const t = tracks.find(x => x.id === trackId); if (t && t.synth) { t.synth.volume.rampTo(volDb, 0.1); } }

  function getGlobalOrder() {
    if (tracks.length === 0) return { r: 0, label: 'Sin pistas activas' };
    const avg = tracks.reduce((sum, t) => sum + (t.orderParam || 0), 0) / tracks.length;
    let label = 'Desorden';
    if (avg > params.orderThresholdStable) label = 'Organización estable';
    else if (avg > params.orderThresholdPartial) label = 'Organización parcial';
    return { r: avg, label };
  }

  return { tracks, addTrack, removeTrack, reset, stepSimulation, triggerPanic, perturbAgent, modulateFromLandscape, perturbAgentByType, setTrackMuted, setTrackMode, setTrackMultiplier, setTrackVolume, getGlobalOrder, setSelectedTrack, getSelectedTrack, addFX, removeFX, setFXParam };
}