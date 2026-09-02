import * as THREE from 'three';

export function createSimulation({ scene, params }) {
  const tracks = [];
  let globalBeatPhase = 0;

  const B_MINOR_SCALE = ['B2', 'C#3', 'D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'];

  const InstrumentPresets = {
    'Kick':  { color: 0xff3366, geo: new THREE.BoxGeometry(0.5, 0.5, 0.5), baseOmega: 1.0, baseVolume: -2,  createSynth: () => new Tone.MembraneSynth(), note: 'B1' },
    'Snare': { color: 0xff8800, geo: new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), baseOmega: 1.0, baseVolume: -6,  createSynth: () => new Tone.NoiseSynth({ noise: { type: 'white' } }), note: null },
    'HiHat': { color: 0xffff00, geo: new THREE.TetrahedronGeometry(0.3), baseOmega: 2.0, baseVolume: -12, createSynth: () => new Tone.MetalSynth({ envelope: { decay: 0.1 } }), note: 'B5' },
    'Bass':  { color: 0x3366ff, geo: new THREE.SphereGeometry(0.4, 16, 16), baseOmega: 0.5, baseVolume: -4,  createSynth: () => new Tone.FMSynth(), note: 'B2' },
    'Chord': { color: 0x00ffcc, geo: new THREE.OctahedronGeometry(0.4), baseOmega: 0.25, baseVolume: -10, createSynth: () => new Tone.PolySynth(Tone.Synth), note: ['B3', 'D4', 'F#4'] },
    'Lead':  { color: 0x9933ff, geo: new THREE.TorusGeometry(0.2, 0.1, 8, 16), baseOmega: 1.5, baseVolume: -7,  createSynth: () => new Tone.AMSynth(), note: 'F#4' },
    'Pluck': { color: 0xff33cc, geo: new THREE.IcosahedronGeometry(0.3), baseOmega: 3.0, baseVolume: -8,  createSynth: () => new Tone.Synth({ oscillator: { type: 'triangle' } }), note: 'D5' },
    'Glitch':{ color: 0xffffff, geo: new THREE.DodecahedronGeometry(0.2), baseOmega: 4.0, baseVolume: -14, createSynth: () => new Tone.MonoSynth(), note: 'RANDOM_BM' }
  };

  Tone.Destination.volume.value = params.masterVolume;
  const masterLimiter = new Tone.Limiter(-1).toDestination();
  const masterComp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.003, release: 0.25 }).connect(masterLimiter);
  const sharedReverb = new Tone.Freeverb({ roomSize: 0.6, dampening: 3000 }).connect(masterComp);
  sharedReverb.wet.value = 1;

  function layoutTracks() {
    const spacing = 1.5;
    const totalHeight = (tracks.length - 1) * spacing;
    const startY = totalHeight / 2;

    tracks.forEach((track, index) => {
      track.targetY = startY - (index * spacing);
      track.targetZ = 0; 
      
      track.rail.position.set(0, track.targetY, track.targetZ);
      track.wall.position.set(params.trackWidth / 2, track.targetY, track.targetZ);
    });
  }

  function addTrack(typeId) {
    const preset = InstrumentPresets[typeId];
    if (!preset) return null;

    const id = `track_${Date.now()}`;
    const railGeo = new THREE.BoxGeometry(params.trackWidth, 0.05, 0.05);
    const railMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const rail = new THREE.Mesh(railGeo, railMat);
    scene.add(rail);

    const wallGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
    const wallMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    scene.add(wall);

    const dryGain = new Tone.Gain(1);
    const sendGain = new Tone.Gain(params.reverbWet);
    dryGain.connect(masterComp);
    sendGain.connect(sharedReverb);

    const synth = preset.createSynth();
    synth.connect(dryGain);
    synth.connect(sendGain);
    if (preset.baseVolume !== undefined) synth.volume.value = preset.baseVolume;

    const particles = [];
    for (let i = 0; i < params.particlesPerTrack; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: preset.color });
      const mesh = new THREE.Mesh(preset.geo.clone(), mat);
      scene.add(mesh);
      particles.push({
        mesh: mesh,
        phase: Math.random() * Math.PI * 2,
        omegaRandUnit: (Math.random() * 2 - 1),
        lastPhase: 0,
        baseColor: preset.color
      });
    }

    const newTrack = {
      id, type: typeId, config: preset, rail, wall, particles, synth, dryGain, sendGain,
      targetY: 0, targetZ: 0, orderParam: 0, baseWallOpacity: 0.2, muted: false,
      mode: 'kuramoto', 
      beatMultiplier: 1.0,
      justChangedMode: false 
    };

    tracks.push(newTrack);
    layoutTracks();
    return newTrack;
  }

  function removeTrack(trackId) {
    const index = tracks.findIndex(t => t.id === trackId);
    if (index === -1) return;
    const track = tracks[index];
    scene.remove(track.rail);
    scene.remove(track.wall);
    track.rail.geometry.dispose(); track.rail.material.dispose();
    track.wall.geometry.dispose(); track.wall.material.dispose();
    track.particles.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    track.synth.dispose(); track.dryGain.dispose(); track.sendGain.dispose();
    tracks.splice(index, 1);
    layoutTracks();
  }

  function reset() {
    tracks.forEach(track => {
      track.particles.forEach(p => {
        p.phase = Math.random() * Math.PI * 2;
        p.omegaRandUnit = (Math.random() * 2 - 1);
      });
      track.orderParam = 0;
    });
    globalBeatPhase = 0;
  }

  function stepSimulation(deltaTime, elapsedTime) {
    const dt = Math.min(deltaTime, 0.05);
    const K = params.couplingK;
    
    const baseFreqHz = params.bpm / 60;
    globalBeatPhase = (globalBeatPhase + (baseFreqHz * Math.PI * 2) * dt) % (Math.PI * 2);

    tracks.forEach(track => {
      const N = track.particles.length;
      const newPhases = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        const p = track.particles[i];
        
        if (track.mode === 'kuramoto') {
          const kMax = 5.0;
          const dampeningFactor = Math.max(0, 1 - (K / kMax));
          const effectiveSpread = params.omegaSpread * dampeningFactor;
          
          const omega = track.config.baseOmega + p.omegaRandUnit * effectiveSpread;
          
          let sumSin = 0;
          for (let j = 0; j < N; j++) {
            if (i !== j) sumSin += Math.sin(track.particles[j].phase - p.phase);
          }
          
          const phaseDerivative = (omega * baseFreqHz * Math.PI * 2) + ((K / N) * sumSin);
          newPhases[i] = p.phase + (phaseDerivative * dt);
        } else {
          newPhases[i] = (globalBeatPhase * track.config.baseOmega * track.beatMultiplier) % (Math.PI * 2);
        }
      }

      let sumCos = 0;
      let sumSin2 = 0;

      for (let i = 0; i < N; i++) {
        const p = track.particles[i];
        
        if (track.justChangedMode) {
          p.lastPhase = newPhases[i];
        } else {
          p.lastPhase = p.phase;
        }
        
        p.phase = (newPhases[i] % (Math.PI * 2));
        if (p.phase < 0) p.phase += Math.PI * 2;

        sumCos += Math.cos(p.phase);
        sumSin2 += Math.sin(p.phase);

        if (p.phase < p.lastPhase - 1.0) triggerAudio(p, track);

        const normalizedPhase = p.phase / (Math.PI * 2);
        const xPos = (normalizedPhase * params.trackWidth) - (params.trackWidth / 2);

        p.mesh.position.x = xPos;
        p.mesh.position.z = track.targetZ;
        p.mesh.position.y = track.targetY;
        p.mesh.rotation.x += 0.05;
        p.mesh.rotation.y += 0.02;

        if (track.type === 'Bass') {
          const scale = 1.0 + Math.sin(elapsedTime * 4 + p.phase) * 0.3;
          p.mesh.scale.set(scale, scale, scale);
        } else if (track.type === 'Glitch') {
          const chaos = 0.3 + 0.7 * (1 - track.orderParam);
          p.mesh.position.y = track.targetY + (Math.random() * 0.5 - 0.25) * chaos;
        } else if (track.type === 'Chord') {
          p.mesh.position.y = track.targetY + Math.sin(p.phase * 4) * 0.3;
        }

        if (track.mode === 'kuramoto') {
          const syncScale = 1.0 + (track.orderParam * 0.8); 
          if(track.type !== 'Bass') p.mesh.scale.set(syncScale, syncScale, syncScale);
        } else {
          if(track.type !== 'Bass') p.mesh.scale.set(1, 1, 1);
        }
      }

      track.justChangedMode = false;
      track.orderParam = track.mode === 'kuramoto' ? Math.sqrt(sumCos * sumCos + sumSin2 * sumSin2) / N : 1.0; 
      updateTrackFeedback(track);
    });
  }

  const _lowColor = new THREE.Color(0x444444);
  const _highColor = new THREE.Color();
  
  function updateTrackFeedback(track) {
    const r = track.orderParam;
    _highColor.setHex(track.config.color);
    track.rail.material.color.copy(_lowColor).lerp(_highColor, r);
    
    track.rail.scale.y = 1 + (r * 2); 

    track.baseWallOpacity = 0.12 + r * 0.45;
    track.wall.material.opacity = track.baseWallOpacity;
    track.sendGain.gain.rampTo(Math.min(1, params.reverbWet + r * params.syncReverbBoost), 0.15);
  }

  function triggerAudio(particle, track) {
    particle.mesh.material.color.setHex(0xffffff);
    setTimeout(() => { particle.mesh.material.color.setHex(particle.baseColor); }, 100);
    track.wall.material.opacity = 0.85;
    setTimeout(() => { track.wall.material.opacity = track.baseWallOpacity; }, 100);

    if (track.muted) return;
    if (Tone.context.state === 'running') {
      try {
        const detuneSemitones = track.mode === 'kuramoto' 
          ? (particle.omegaRandUnit * params.detuneSpreadCents * Math.max(0, 1 - (params.couplingK / 5.0))) / 100 
          : 0;

        if (track.type === 'Snare') { 
          track.synth.triggerAttackRelease('16n');
        } else if (track.type === 'HiHat') { 
          track.synth.triggerAttackRelease(Tone.Frequency(track.config.note).transpose(detuneSemitones).toFrequency(), '16n');
        } else if (track.type === 'Glitch') { 
          const randomScaleNote = B_MINOR_SCALE[Math.floor(Math.random() * B_MINOR_SCALE.length)];
          const baseFreq = Tone.Frequency(randomScaleNote).transpose(12);
          track.synth.triggerAttackRelease(baseFreq.transpose(detuneSemitones).toFrequency(), '32n');
        } else if (track.type === 'Chord') { 
          const notes = track.config.note.map(n => Tone.Frequency(n).transpose(detuneSemitones).toFrequency());
          track.synth.triggerAttackRelease(notes, '8n');
        } else { 
          track.synth.triggerAttackRelease(Tone.Frequency(track.config.note).transpose(detuneSemitones).toFrequency(), '16n'); 
        }
      } catch (e) {}
    }
  }

  function perturbTrack(trackId) {
    const track = tracks.find(t => t.id === trackId);
    if (track && track.mode === 'kuramoto') {
      track.particles.forEach(p => { p.phase += params.perturbationStrength + (Math.random() * 2); });
    }
  }

  function setTrackMuted(trackId, muted) { const t = tracks.find(x => x.id === trackId); if (t) t.muted = muted; }
  
  function setTrackMode(trackId, mode) { 
    const t = tracks.find(x => x.id === trackId); 
    if (t && t.mode !== mode) { 
      t.mode = mode;
      t.justChangedMode = true;
    } 
  }
  
  function setTrackMultiplier(trackId, mult) { const t = tracks.find(x => x.id === trackId); if (t) t.beatMultiplier = mult; }

  // NUEVA FUNCIÓN: Ajustar Volumen
  function setTrackVolume(trackId, volDb) {
    const t = tracks.find(x => x.id === trackId); 
    if (t && t.synth) {
      // Usamos rampTo para evitar clicks de audio al deslizar rápido
      t.synth.volume.rampTo(volDb, 0.1); 
    }
  }

  function getGlobalOrder() {
    if (tracks.length === 0) return { r: 0, label: 'Sin pistas activas' };
    const avg = tracks.reduce((sum, t) => sum + (t.orderParam || 0), 0) / tracks.length;
    let label = 'Desorden';
    if (avg > params.orderThresholdStable) label = 'Organización estable';
    else if (avg > params.orderThresholdPartial) label = 'Organización parcial';
    return { r: avg, label };
  }

  return { tracks, addTrack, removeTrack, reset, stepSimulation, perturbTrack, setTrackMuted, setTrackMode, setTrackMultiplier, setTrackVolume, getGlobalOrder };
}