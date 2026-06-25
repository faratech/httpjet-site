(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) setTimeout(() => document.documentElement.classList.add('settled'), 1800);

  /* ---- rotating tagline ---- */
  const tags = [...document.querySelectorAll('#tag span')];
  let ti = 0; tags[0].classList.add('on');

  /* ---- metric chips ---- */
  document.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || '';
    const fmt = n => (end >= 1000 ? Math.round(n/1000)+'K' : Math.round(n)) + suf;
    el.textContent = fmt(end);
  });

  /* ---- epic-mode synth: 10 procedural songs, shuffled like a tiny OST ---- */
  const audioBtn = document.getElementById('audio');
  const prevBtn = document.getElementById('audioPrev');
  const nextBtn = document.getElementById('audioNext');
  const player = document.getElementById('epicPlayer');
  const trackEl = document.getElementById('audioTrack');
  const timeEl = document.getElementById('audioTime');
  const toast = document.getElementById('toast');
  const volumeSlider = document.getElementById('audioVolume');
  const AudioAPI = window.AudioContext || window.webkitAudioContext;
  const VOL = { track: 1, master: 6, limiterDrive: 3.2 };
  const MIX = { delay: .24, feedback: .32, reverb: .18, width: .72 };
  const VOICE = {
    pad: { attack:.09, decay:.22, sustain:.78, release:.32, vibrato:.7, vibratoRate:4.2, detuneJitter:.7, filterPeak:1.16 },
    bass: { attack:.008, decay:.08, sustain:.82, release:.045, detuneJitter:.35, filterPeak:1.12 },
    pluck: { attack:.006, decay:.08, sustain:.5, release:.05, detuneJitter:.45, filterPeak:1.35 },
    lead: { attack:.018, decay:.1, sustain:.86, release:.08, vibrato:2.4, vibratoRate:5.4, detuneJitter:.55, filterPeak:1.22 },
    air: { attack:.012, decay:.09, sustain:.62, release:.06, vibrato:1.1, vibratoRate:6.2, detuneJitter:.4, filterPeak:1.2 }
  };
  const R = null;
  const makeRng = seed => () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const SONGS = [
    { title:'Photon Runway', bpm:136, bars:96, root:50, volume:1, chordBars:2, chords:[[0,'min'],[8,'maj'],[3,'maj'],[10,'maj']],
      kick:[0,4,8,12], snare:[4,12], hats:2, bass:[0,R,0,7,0,R,10,R,0,R,0,7,10,R,7,R], arp:[0,2,1,2,0,2,1,3],
      melody:[12,R,15,17,19,R,17,15,12,R,10,12,15,R,12,R,19,R,22,24,22,R,19,17,15,R,17,19,17,R,15,R], lead:'square', bassWave:'sawtooth' },
    { title:'Rust Afterburner', bpm:124, bars:96, root:45, volume:1, chordBars:2, chords:[[0,'min'],[10,'maj'],[7,'min'],[8,'maj']],
      kick:[0,4,8,11,12], snare:[4,12], hats:2, bass:[0,0,R,7,0,R,10,R,7,R,7,12,10,R,7,R], arp:[0,1,2,1,0,2,3,2],
      melody:[15,R,15,17,19,17,15,R,22,R,20,19,17,R,15,R,15,R,17,19,22,R,24,22,20,R,19,17,15,R,12,R], lead:'sawtooth', bassWave:'square' },
    { title:'Neon Hyperdrive', bpm:150, bars:96, root:49, volume:1, chordBars:1, chords:[[0,'min'],[3,'maj'],[8,'maj'],[10,'maj']],
      kick:[0,3,4,8,12,14], snare:[4,12], hats:1, bass:[0,R,7,R,0,10,7,R,0,R,7,R,10,R,7,R], arp:[0,1,2,3,2,1,0,2],
      melody:[24,22,19,R,17,19,22,R,24,27,24,22,19,R,17,R,19,R,22,24,27,R,24,22,19,17,15,R,17,19,22,R], lead:'triangle', bassWave:'sawtooth' },
    { title:'Quasar Parade', bpm:118, bars:128, root:52, volume:1, chordBars:2, chords:[[0,'min'],[8,'maj'],[10,'maj'],[7,'min'],[3,'maj'],[10,'maj']],
      kick:[0,4,8,12], snare:[4,12], hats:2, bass:[0,R,R,7,0,R,12,R,10,R,7,R,0,R,7,R], arp:[0,2,1,2,3,2,1,2],
      melody:[12,R,15,R,19,20,19,R,17,R,15,17,19,R,15,R,20,R,22,24,22,R,20,19,17,R,15,R,17,19,20,R], lead:'sawtooth', bassWave:'sawtooth' },
    { title:'Skyline Boss Rush', bpm:142, bars:112, root:47, volume:1, chordBars:1, chords:[[0,'min'],[7,'min'],[8,'maj'],[10,'maj']],
      kick:[0,4,7,8,12], snare:[4,12], hats:2, bass:[0,R,0,7,0,7,10,R,0,R,12,10,7,R,10,R], arp:[0,1,2,1,0,2,1,3],
      melody:[19,R,19,22,24,R,22,19,17,R,19,22,19,R,17,R,24,R,27,29,27,R,24,22,19,R,22,24,22,R,19,R], lead:'square', bassWave:'square' },
    { title:'Cacheline Carnival', bpm:132, bars:80, root:48, volume:1, chordBars:2, chords:[[0,'maj'],[7,'min'],[9,'min'],[5,'maj']],
      kick:[0,4,8,10,12], snare:[4,12], hats:2, bass:[0,R,7,R,12,R,7,R,0,R,4,7,12,R,7,R], arp:[0,1,2,1,3,2,1,2],
      melody:[12,16,19,R,21,19,16,R,12,16,19,21,23,R,21,R,19,R,21,23,24,R,23,21,19,16,19,R,16,R,12,R], lead:'triangle', bassWave:'sawtooth' },
    { title:'Thunder Cache', bpm:126, bars:112, root:43, volume:1, chordBars:2, chords:[[0,'min'],[8,'maj'],[5,'min'],[10,'maj']],
      kick:[0,4,8,12,15], snare:[4,12], hats:2, bass:[0,R,0,R,7,R,10,R,0,R,7,0,12,R,10,R], arp:[0,2,1,2,0,1,2,3],
      melody:[12,R,12,15,19,R,22,R,20,R,19,15,17,R,15,R,12,R,15,19,24,R,22,20,19,R,17,15,12,R,10,R], lead:'sawtooth', bassWave:'sawtooth' },
    { title:'Orbit Pop Engine', bpm:160, bars:80, root:53, volume:1, chordBars:1, chords:[[0,'maj'],[5,'maj'],[9,'min'],[7,'maj']],
      kick:[0,4,8,12], snare:[4,12], hats:1, bass:[0,R,4,R,7,R,12,R,7,R,4,R,0,R,7,R], arp:[0,1,2,1,0,2,3,2],
      melody:[12,16,19,16,21,R,19,R,24,23,21,19,16,R,19,R,21,R,19,16,14,R,16,R,19,21,23,24,23,R,21,R], lead:'square', bassWave:'square' },
    { title:'Midnight Launch Loop', bpm:110, bars:96, root:46, volume:1, chordBars:2, chords:[[0,'min'],[3,'maj'],[10,'maj'],[8,'maj']],
      kick:[0,6,8,12], snare:[4,12], hats:2, bass:[0,R,R,7,0,R,10,R,7,R,R,12,10,R,7,R], arp:[0,1,2,1,3,2,1,0],
      melody:[12,R,15,R,17,R,19,R,22,R,20,19,17,R,15,R,12,R,15,17,19,R,22,24,22,R,19,17,15,R,12,R], lead:'triangle', bassWave:'sawtooth' },
    { title:'Victory Overclock', bpm:138, bars:128, root:51, volume:1, chordBars:2, chords:[[0,'min'],[8,'maj'],[10,'maj'],[3,'maj'],[5,'min'],[10,'maj']],
      kick:[0,4,8,12,14], snare:[4,12], hats:2, bass:[0,R,7,R,0,R,10,R,12,R,10,R,7,R,10,R], arp:[0,2,1,2,3,2,1,2],
      melody:[19,R,22,24,27,R,24,22,19,R,17,19,22,R,19,R,24,R,27,31,29,R,27,24,22,R,24,27,24,R,22,R], lead:'sawtooth', bassWave:'square' }
  ];
  const QUAL = { min:[0,3,7], maj:[0,4,7], sus:[0,5,7], min7:[0,3,7,10], maj7:[0,4,7,11] };
  let audioCtx, master, compressor, limiter, fxBus, fxDelay, fxFeedback, fxTone, fxEcho, fxVerb, fxVerbGain, songBus, noiseBuffer, scheduler, uiTimer;
  let musicOn = false, audioBusy = false, currentTrack = -1, currentStep = 0, nextNoteTime = 0, trackStart = 0;
  const history = [], recent = [];
  const playOrder = [0, 3, 6, 1, 8, 4, 9, 2, 5, 7];
  let orderPos = 0;
  const controlButtons = [audioBtn, prevBtn, nextBtn].filter(Boolean);
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => toast.classList.remove('show'), 1800);
  }
  const songDuration = song => song.bars * 4 * 60 / song.bpm;
  const fmtTime = sec => {
    const whole = Math.max(0, Math.round(sec));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };
  const midiToHz = n => 440 * Math.pow(2, (n - 69) / 12);
  const masterTarget = () => Math.max(0.0001, VOL.master);
  function limiterCurve(drive) {
    const curve = new Float32Array(4096);
    const scale = Math.tanh(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = i / (curve.length - 1) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / scale;
    }
    return curve;
  }
  const hash01 = (n, salt) => {
    const x = Math.sin((n + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const humanTime = (step, lane, amount) => (hash01(step, lane) - .5) * amount;
  const liftGain = (step, lane, amount) => 1 + hash01(step, lane) * amount;
  function reverbImpulse(seconds, decay) {
    const len = Math.floor(audioCtx.sampleRate * seconds);
    const impulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    const rnd = makeRng(0xA11D10);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        data[i] = (rnd() * 2 - 1) * env * (ch ? .86 : 1);
      }
    }
    return impulse;
  }
  const pickTrack = except => {
    for (let tries = 0; tries < playOrder.length; tries++) {
      const idx = playOrder[orderPos % playOrder.length];
      orderPos++;
      if (idx !== except) {
        recent.push(idx);
        while (recent.length > Math.max(4, SONGS.length - 2)) recent.shift();
        return idx;
      }
    }
    return playOrder[orderPos++ % playOrder.length] || 0;
  };
  function setPlayingUi(on) {
    if (!audioBtn) return;
    audioBtn.classList.toggle('playing', on);
    audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    audioBtn.setAttribute('aria-label', on ? 'Stop epic music' : 'Play epic music');
  }
  function updateTrackUi() {
    if (currentTrack < 0) return;
    const song = SONGS[currentTrack];
    const dur = songDuration(song);
    if (trackEl) trackEl.textContent = song.title;
    if (timeEl) timeEl.textContent = musicOn && audioCtx ? `${fmtTime(Math.max(0, audioCtx.currentTime - trackStart))} / ${fmtTime(dur)}` : fmtTime(dur);
    if (player) {
      const pct = musicOn && audioCtx ? Math.min(100, Math.max(0, (audioCtx.currentTime - trackStart) / dur * 100)) : 0;
      player.style.setProperty('--track-progress', `${pct}%`);
    }
  }
  function initAudio() {
    audioCtx = audioCtx || new AudioAPI();
    if (!master) {
      master = audioCtx.createGain();
      master.gain.value = 0.0001;
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 8;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      limiter = audioCtx.createWaveShaper();
      limiter.curve = limiterCurve(VOL.limiterDrive);
      limiter.oversample = '4x';
      fxBus = audioCtx.createGain();
      fxBus.gain.value = .72;
      fxDelay = audioCtx.createDelay(1);
      fxDelay.delayTime.value = MIX.delay;
      fxFeedback = audioCtx.createGain();
      fxFeedback.gain.value = MIX.feedback;
      fxTone = audioCtx.createBiquadFilter();
      fxTone.type = 'lowpass';
      fxTone.frequency.value = 3600;
      fxEcho = audioCtx.createGain();
      fxEcho.gain.value = .2;
      fxVerb = audioCtx.createConvolver();
      fxVerb.buffer = reverbImpulse(1.35, 2.4);
      fxVerbGain = audioCtx.createGain();
      fxVerbGain.gain.value = MIX.reverb;
      fxBus.connect(fxDelay);
      fxDelay.connect(fxTone);
      fxTone.connect(fxEcho).connect(master);
      fxTone.connect(fxFeedback).connect(fxDelay);
      fxBus.connect(fxVerb).connect(fxVerbGain).connect(master);
      master.connect(compressor).connect(limiter).connect(audioCtx.destination);
    }
    return audioCtx.resume();
  }
  function syncVolume() {
    if (!volumeSlider) return;
    const next = Number(volumeSlider.value);
    if (!Number.isFinite(next)) return;
    VOL.master = Math.max(0, next);
    if (musicOn && master && audioCtx) {
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + .06);
    }
  }
  if (volumeSlider) {
    syncVolume();
    volumeSlider.addEventListener('input', syncVolume);
  }
  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const len = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    const noiseRnd = makeRng(0x51A7E);
    for (let i = 0; i < len; i++) data[i] = noiseRnd() * 2 - 1;
    return noiseBuffer;
  }
  function out(node, pan, fx) {
    let dry = node;
    if (audioCtx.createStereoPanner && pan) {
      const p = audioCtx.createStereoPanner();
      p.pan.setValueAtTime(pan, audioCtx.currentTime);
      node.connect(p);
      dry = p;
    }
    dry.connect(songBus || master);
    if (fxBus && fx) {
      const send = audioCtx.createGain();
      send.gain.value = fx;
      dry.connect(send).connect(fxBus);
    }
  }
  function oscNote(note, when, dur, type, gain, detune, filterFreq, pan, fx, voice) {
    const amp = audioCtx.createGain();
    const filter = filterFreq ? audioCtx.createBiquadFilter() : null;
    const dest = filter || amp;
    const voices = detune ? [-detune, detune] : [0];
    const freq = midiToHz(note);
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.max(80, filterFreq * .72), when);
      filter.frequency.exponentialRampToValueAtTime(filterFreq, when + Math.min(.12, dur * .4));
      if (voice && voice.filterPeak) {
        filter.frequency.exponentialRampToValueAtTime(Math.min(12000, filterFreq * voice.filterPeak), when + Math.max(.04, dur * .42));
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * .92), when + dur);
      }
      filter.Q.setValueAtTime(1.8, when);
      filter.connect(amp);
    }
    const attack = Math.min(dur * .55, voice && voice.attack !== undefined ? voice.attack : Math.min(.04, dur * .25));
    const decay = Math.min(dur * .4, voice && voice.decay !== undefined ? voice.decay : .05);
    const release = Math.min(dur * .7, voice && voice.release !== undefined ? voice.release : .025);
    const sustain = voice && voice.sustain !== undefined ? voice.sustain : 1;
    const peakAt = when + Math.max(.001, attack);
    const releaseAt = Math.max(peakAt + .001, when + dur - release);
    const sustainAt = Math.min(releaseAt - .001, peakAt + decay);
    const sustainGain = Math.max(0.0001, gain * sustain);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, peakAt);
    if (sustain < .999 && sustainAt > peakAt) {
      amp.gain.exponentialRampToValueAtTime(sustainGain, sustainAt);
      amp.gain.setValueAtTime(sustainGain, releaseAt);
    } else {
      amp.gain.setValueAtTime(gain, releaseAt);
    }
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    out(amp, pan || 0, fx || 0);
    voices.forEach((d, i) => {
      const osc = audioCtx.createOscillator();
      const jitter = voice && voice.detuneJitter ? (hash01(note + Math.round(when * 100), i + 11) - .5) * voice.detuneJitter : 0;
      osc.type = type || 'sawtooth';
      osc.frequency.setValueAtTime(freq, when);
      osc.detune.setValueAtTime(d + jitter, when);
      if (voice && voice.vibrato) {
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.setValueAtTime(voice.vibratoRate || 5, when);
        lfoGain.gain.setValueAtTime(0.0001, when);
        lfoGain.gain.linearRampToValueAtTime(voice.vibrato, when + Math.min(.22, dur * .4));
        lfo.connect(lfoGain).connect(osc.detune);
        lfo.start(when);
        lfo.stop(when + dur + .08);
      }
      osc.connect(dest);
      osc.start(when);
      osc.stop(when + dur + 0.08);
    });
  }
  function noiseHit(when, dur, gain, freq, pan, fx) {
    const src = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const amp = audioCtx.createGain();
    src.buffer = getNoise();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(freq, when);
    filter.Q.setValueAtTime(.8, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, when + Math.min(.012, dur * .3));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(amp);
    out(amp, pan || 0, fx || 0);
    src.start(when);
    src.stop(when + dur + 0.03);
  }
  function kick(when, gain) {
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    const body = audioCtx.createOscillator();
    const bodyAmp = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, when);
    osc.frequency.exponentialRampToValueAtTime(44, when + .14);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, when + .008);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + .28);
    body.type = 'triangle';
    body.frequency.setValueAtTime(72, when);
    body.frequency.exponentialRampToValueAtTime(48, when + .18);
    bodyAmp.gain.setValueAtTime(0.0001, when);
    bodyAmp.gain.linearRampToValueAtTime(gain * .18, when + .012);
    bodyAmp.gain.exponentialRampToValueAtTime(0.0001, when + .22);
    osc.connect(amp).connect(songBus || master);
    body.connect(bodyAmp).connect(songBus || master);
    osc.start(when);
    body.start(when);
    osc.stop(when + .34);
    body.stop(when + .26);
    noiseHit(when, .028, gain * .09, 3200, 0, 0);
  }
  function snare(when, gain) {
    noiseHit(when, .16, gain, 1600, -.1, .035);
    noiseHit(when, .055, gain * .22, 5200, .18, 0);
    noiseHit(when + .014, .08, gain * .16, 2400, -.22, .018);
    noiseHit(when + .027, .07, gain * .11, 2800, .24, .018);
    oscNote(57, when, .09, 'triangle', gain * .28, 0, 900, .1, .025);
  }
  function hatTone(when, dur, gain, pan) {
    [7200, 9250].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq * (i ? 1.015 : 1), when);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.linearRampToValueAtTime(gain * (i ? .06 : .08), when + .006);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(amp);
      out(amp, pan, 0);
      osc.start(when);
      osc.stop(when + dur + .02);
    });
  }
  function hat(when, gain, open) {
    const dur = open ? .18 : .055;
    noiseHit(when, dur, gain, 6200, .25, open ? .045 : .015);
    hatTone(when, open ? .12 : .035, gain, .25);
  }
  function sweep(when, dur, gain, pan) {
    const src = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const amp = audioCtx.createGain();
    src.buffer = getNoise();
    src.loop = true;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(460, when);
    filter.frequency.exponentialRampToValueAtTime(5400, when + dur * .88);
    filter.Q.setValueAtTime(1.7, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, when + dur * .72);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(amp);
    out(amp, pan || 0, .3);
    src.start(when);
    src.stop(when + dur + .04);
  }
  function chordAt(song, bar) {
    const raw = song.chords[Math.floor(bar / (song.chordBars || 1)) % song.chords.length];
    const root = song.root + raw[0];
    return { root, notes:(QUAL[raw[1]] || QUAL.min).map(n => root + n) };
  }
  function schedulePad(chord, when, dur, intensity) {
    chord.notes.forEach((n, i) => {
      oscNote(n + 12, when + i * .018, dur, 'triangle', .012 * intensity, 6, 760 + intensity * 420, (i - 1) * .16 * MIX.width, .32, VOICE.pad);
      oscNote(n + 24, when + i * .018, dur * .72, 'sine', .006 * intensity, 0, 1200, (1 - i) * .11 * MIX.width, .24, VOICE.pad);
    });
  }
  function bassNote(note, when, dur, wave, gain, filterFreq, pan, fx, step) {
    oscNote(note, when, dur, wave, gain, 0, filterFreq, pan, fx, VOICE.bass);
    oscNote(note + 12, when + .004, Math.min(dur * .65, .18), 'triangle', gain * .16, 0, 780, pan * .45, fx, VOICE.pluck);
    noiseHit(when, .018, gain * .028, 1800, pan, 0);
    if (step % 8 === 0) oscNote(note + 19, when + .012, Math.min(dur * .42, .12), 'sine', gain * .045, 0, 1400, pan * .35, .01, VOICE.air);
  }
  function arpNote(note, when, dur, gain, filterFreq, pan, fx, step) {
    const t = when + humanTime(step, 3, Math.min(.007, dur * .07));
    const g = gain * liftGain(step, 7, .1);
    oscNote(note, t, dur, 'triangle', g, 2, filterFreq, pan, fx, VOICE.pluck);
    oscNote(note + 12, t + .01, Math.min(dur * .55, .11), 'sine', g * .12, 0, filterFreq * 1.18, -pan * .55, fx * .8, VOICE.air);
  }
  function leadNote(note, when, dur, type, gain, detune, filterFreq, pan, fx, step, lift) {
    const t = when + humanTime(step, 13, Math.min(.009, dur * .04));
    oscNote(note, t, dur, type, gain, detune, filterFreq, pan, fx, VOICE.lead);
    if (lift) oscNote(note, t + .018, dur * .9, type === 'triangle' ? 'sine' : 'triangle', gain * .25, 4, filterFreq * 1.08, -pan * 1.2, fx * 1.25, VOICE.air);
  }
  function scheduleStep(step, when) {
    const song = SONGS[currentTrack];
    if (!song || !songBus) return;
    const stepDur = 60 / song.bpm / 4;
    const bar = (step / 16) | 0;
    const pos = step % 16;
    const phase = bar / song.bars;
    const cycle = bar % 32;
    const intro = bar < 8;
    const outro = phase > .92;
    const breakBar = cycle >= 24 && cycle < 28;
    const lift = cycle >= 28;
    const chorus = (cycle >= 8 && cycle < 24) || phase > .66;
    const chord = chordAt(song, bar);
    const intensity = outro ? .42 : intro ? .5 + bar * .055 : lift ? 1.08 : chorus ? 1 : .78;
    if (!outro) {
      if (song.kick.includes(pos) && (!breakBar || pos === 0)) kick(when, .22 * intensity);
      if (song.snare.includes(pos) && !intro) snare(when, .1 * intensity);
      if (!breakBar && pos % song.hats === 0) hat(when, .022 * intensity, lift && pos % 4 === 2);
      if (lift && pos % 2 === 1) hat(when, .015 * intensity, true);
    }
    if (pos === 0 && bar % (song.chordBars || 2) === 0) schedulePad(chord, when, stepDur * 16 * (song.chordBars || 2) * .94, intensity);
    if (lift && pos === 0 && cycle % 8 === 4) sweep(when, stepDur * 8, .014 * intensity, .12);
    if (bar >= 4 && !breakBar && !outro) {
      const b = song.bass[pos % song.bass.length];
      if (b !== R) {
        bassNote(chord.root - 12 + b, when, stepDur * 1.35, song.bassWave, .045 * intensity, 320, -.08, .018, step);
        oscNote(chord.root - 24 + b, when, stepDur * 1.2, 'sine', .032 * intensity, 0, 0, 0);
      }
    }
    if (bar >= 8 && !breakBar && !outro && pos % 2 === 0) {
      const a = song.arp[(step >> 1) % song.arp.length];
      const note = chord.notes[a % chord.notes.length] + 12 + Math.floor(a / chord.notes.length) * 12;
      arpNote(note, when, stepDur * 1.4, .025 * intensity, 1600 + intensity * 900, .18 * MIX.width, .18, step);
    }
    if ((chorus || lift) && !outro) {
      const m = song.melody[step % song.melody.length];
      if (m !== R) {
        leadNote(song.root + m, when, stepDur * (lift ? 1.15 : 1.7), song.lead, .036 * intensity, song.lead === 'triangle' ? 0 : 5, 2100 + intensity * 1200, -.22 * MIX.width, .2, step, lift);
        if (chorus && pos % 4 === 0) oscNote(song.root + m + 12, when + .015, stepDur * .9, 'sine', .014 * intensity, 0, 0, .2 * MIX.width, .16, VOICE.air);
      }
    }
    if (lift && pos === 15) noiseHit(when, stepDur * 2.2, .035, 3400, 0, .22);
  }
  function startTrack(idx, push, at) {
    const now = audioCtx.currentTime;
    const startAt = Math.max(now + .035, at || now + .05);
    if (currentTrack >= 0 && push) {
      history.push(currentTrack);
      if (history.length > 20) history.shift();
    }
    if (songBus) {
      const old = songBus;
      const fadeAt = Math.max(now, startAt - .2);
      old.gain.cancelScheduledValues(now);
      old.gain.setTargetAtTime(0.0001, fadeAt, .09);
      setTimeout(() => { try { old.disconnect(); } catch (_) {} }, 2200);
    }
    currentTrack = idx;
    currentStep = 0;
    nextNoteTime = startAt;
    trackStart = startAt;
    songBus = audioCtx.createGain();
    songBus.gain.setValueAtTime(0.0001, startAt);
    songBus.gain.linearRampToValueAtTime(SONGS[idx].volume * VOL.track, startAt + .28);
    songBus.connect(master);
    updateTrackUi();
    showToast(`Epic mode: ${SONGS[idx].title}`);
    if (window.__surge) window.__surge();
  }
  function scheduleAhead() {
    if (!musicOn || !audioCtx || currentTrack < 0) return;
    const horizon = audioCtx.currentTime + .72;
    while (nextNoteTime < horizon) {
      const song = SONGS[currentTrack];
      if (currentStep >= song.bars * 16) {
        startTrack(pickTrack(currentTrack), true, nextNoteTime + .04);
        break;
      }
      scheduleStep(currentStep, nextNoteTime);
      currentStep++;
      nextNoteTime += 60 / song.bpm / 4;
    }
  }
  function startScheduler() {
    clearInterval(scheduler);
    scheduler = setInterval(scheduleAhead, 90);
    clearInterval(uiTimer);
    uiTimer = setInterval(updateTrackUi, 450);
    scheduleAhead();
    updateTrackUi();
  }
  async function startMusic(idx) {
    await initAudio();
    musicOn = true;
    setPlayingUi(true);
    master.gain.cancelScheduledValues(audioCtx.currentTime);
    master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + .16);
    startTrack(idx === undefined ? pickTrack(currentTrack) : idx, false);
    startScheduler();
  }
  function stopMusic() {
    musicOn = false;
    clearInterval(scheduler);
    clearInterval(uiTimer);
    if (songBus && audioCtx) songBus.gain.setTargetAtTime(0.0001, audioCtx.currentTime, .08);
    if (master && audioCtx) {
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + .2);
    }
    setPlayingUi(false);
    if (player) player.style.setProperty('--track-progress', '0%');
    updateTrackUi();
    showToast('Epic mode offline');
  }
  async function toggleMusic() {
    if (!audioBtn) return;
    if (audioBusy) return;
    audioBusy = true;
    try {
      if (!musicOn) await startMusic();
      else stopMusic();
    } finally {
      audioBusy = false;
    }
  }
  async function skipTrack(dir) {
    if (audioBusy) return;
    audioBusy = true;
    try {
      await initAudio();
      if (!musicOn) {
        musicOn = true;
        setPlayingUi(true);
        master.gain.cancelScheduledValues(audioCtx.currentTime);
        master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + .16);
      }
      const idx = dir < 0 && history.length ? history.pop() : pickTrack(currentTrack);
      startTrack(idx, dir > 0);
      startScheduler();
    } finally {
      audioBusy = false;
    }
  }
  if (audioBtn && AudioAPI) {
    audioBtn.addEventListener('click', () => { toggleMusic().catch(() => showToast('Audio unavailable')); });
    if (prevBtn) prevBtn.addEventListener('click', () => { skipTrack(-1).catch(() => showToast('Audio unavailable')); });
    if (nextBtn) nextBtn.addEventListener('click', () => { skipTrack(1).catch(() => showToast('Audio unavailable')); });
  } else if (audioBtn) {
    controlButtons.forEach(btn => {
      btn.disabled = true;
      btn.title = 'Web Audio is not available in this browser';
    });
  }

  /* ---- canvas: a procedural flight past stars, planets, galaxies, quasars & quarks ---- */
  const cv = document.getElementById('fx'), ctx = cv.getContext('2d'), wrapEl = document.getElementById('wrap');
  let W, H, DPR, stars = [], feats = [], drops = [], mx = 0, my = 0, tx = 0, ty = 0, raf, last = 0, dt = 1, running = false;
  const LP = (navigator.hardwareConcurrency||8) <= 4 || (navigator.deviceMemory||8) <= 4 || (navigator.connection && navigator.connection.saveData) || innerWidth < 700;
  const fps = LP ? 30 : 45;            // cap the canvas — smooth, far less battery on phones
  let activeUntil = 0;
  const TAU = Math.PI * 2;
  const PAL = ['34,211,238', '129,140,248', '232,121,249', '180,210,255', '255,184,120'];
  let visualRnd = makeRng(0x48A7C0DE);
  const rnd = (a, b) => a + visualRnd() * (b - a);
  const pick = a => a[(visualRnd() * a.length) | 0];

  /* ── the real laws of the universe — they fall as a Matrix decode: chaos resolving into order ── */
  const LAWS = [
    'E = mc²', 'iℏ ∂Ψ/∂t = ĤΨ', 'Rμν − ½R gμν + Λgμν = (8πG/c⁴) Tμν',
    '∇·E = ρ/ε₀', '∇×B = μ₀J + μ₀ε₀ ∂E/∂t', '∇×E = −∂B/∂t', '∇·B = 0',
    'Δx·Δp ≥ ℏ/2', '(iγ^μ ∂_μ − m)ψ = 0', 'S = k_B ln Ω',
    'ds² = −c²dt² + dx² + dy² + dz²', 'F = G m₁m₂/r²', 'Ψ = Σ cₙ φₙ e^{−iEₙt/ℏ}',
    'L = ½mẋ² − V(x)', '∮ p dq = n h', 'e^{iπ} + 1 = 0', 'PV = N k T',
    'Eₙ = −13.6 eV / n²', 'ζ(s) = Σ n^{−s}', '∂²φ/∂t² = c²∇²φ',
    'V_pyramid = ⅓ A h', 'tan θ = h/(b/2)', 'φ = (1 + √5)/2',
    'N = R* fₚ nₑ fₗ fᵢ f꜀ L', 'τ_signal ≫ τ_civilization?', 'P(contact) = 1 − e^{−λt}',
    'ΔG = ΔH − TΔS', 'k = A e^{−Eₐ/RT}', 'q^L > 1/σ',
    'x* ∈ Δ : uᵢ(x*) ≥ uᵢ(xᵢ,x*₋ᵢ)', 'argmax ∏ᵢ(uᵢ − dᵢ)', '(M,g) ↪ ℝᴺ',
  ];
  const GLY = '∂∇∫∮∑∏√πℏΨφλμνρσΩ∞±×≈≥≤→01234567=+−';
  let booted = false, flash = 0;
  function drop(spread){ const z = rnd(.34, 1), txt = pick(LAWS), n = txt.length;
    return { txt, n, x: rnd(.02, .9)*W, y: spread ? rnd(0,H) : -rnd(30,140)*DPR,
      s: z*rnd(13,21)*DPR, v:(.4+z*1.2)*DPR, a:.10+z*.16, hue: pick([186,200,224,266]),
      res: spread ? n : 0, rspeed: rnd(.3,.8), glyphSeed: (visualRnd() * GLY.length) | 0 }; }
  function drawLaw(d){
    const dec = d.res < d.n, ri = d.res|0; let str = '';
    for(let i=0;i<d.n;i++) str += i<ri ? d.txt[i] : (d.txt[i]===' ' ? ' ' : GLY[(d.glyphSeed + i * 13 + ((performance.now() / 160) | 0)) % GLY.length]);
    ctx.font = `italic ${d.s}px "Cambria Math","STIX Two Math",Georgia,serif`;
    ctx.fillStyle = `hsla(${d.hue},78%,${dec?84:72}%,${dec?Math.min(.5,d.a*2.4):d.a})`;  // decoding rows glow
    ctx.fillText(str, d.x + tx*.02, d.y);
  }

  function star(){ const z = visualRnd();
    return { x: visualRnd()*W, y: visualRnd()*H, z, v:(.5+z*4)*DPR, len:(6+z*60)*DPR, a:.07+z*.5, c:pick(PAL) }; }
  function feat(spread){
    const z = rnd(.14, 1), r = z * rnd(26, 72) * DPR;          // depth → size + speed
    return { t: pick(['planet','galaxy','quasar','nebula','quark']), r, z,
      x: spread ? visualRnd()*W : W + r*6 + 60*DPR, y: rnd(.08,.92)*H,
      v:(.25+z*1.3)*DPR, rot: visualRnd()*TAU, spin: rnd(-.004,.004),
      hue: rnd(0,360), c: pick(PAL), a:.25+z*.6, seed: visualRnd()*99 };
  }
  /* ── feature painters (each draws one cosmic object centred at f.x,f.y) ── */
  function planet(f){ const {x,y,r,a,hue}=f;
    const g=ctx.createRadialGradient(x-r*.35,y-r*.35,r*.1, x,y,r);          // lit sphere
    g.addColorStop(0,`hsla(${hue},70%,72%,${a})`); g.addColorStop(.55,`hsla(${hue},58%,46%,${a})`); g.addColorStop(1,`hsla(${hue},60%,9%,${a})`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    if(f.seed%3<1){ ctx.save(); ctx.translate(x,y); ctx.rotate(f.rot); ctx.scale(1,.32);   // ring on some
      ctx.strokeStyle=`hsla(${hue},65%,78%,${a*.6})`; ctx.lineWidth=r*.13; ctx.beginPath(); ctx.arc(0,0,r*1.7,0,TAU); ctx.stroke(); ctx.restore(); }
  }
  function galaxy(f){ const {x,y,r,a,c}=f; ctx.save(); ctx.translate(x,y); ctx.rotate(f.rot);
    ctx.save(); ctx.scale(1,.45);
    const core=ctx.createRadialGradient(0,0,0,0,0,r*1.7);
    core.addColorStop(0,`rgba(255,246,232,${a})`); core.addColorStop(.32,`rgba(${c},${a*.55})`); core.addColorStop(1,`rgba(${c},0)`);
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(0,0,r*1.7,0,TAU); ctx.fill(); ctx.restore();
    for(let arm=0; arm<2; arm++){ ctx.beginPath();                          // two spiral arms
      for(let t=0;t<3.4;t+=.12){ const rr=t*r*.5, an=t+arm*Math.PI, px=Math.cos(an)*rr, py=Math.sin(an)*rr*.45; t?ctx.lineTo(px,py):ctx.moveTo(px,py); }
      ctx.strokeStyle=`rgba(${c},${a*.5})`; ctx.lineWidth=r*.09; ctx.stroke(); }
    ctx.restore();
  }
  function quasar(f){ const {x,y,r,a,c}=f;
    ctx.save(); ctx.translate(x,y); ctx.rotate(f.rot);
    const jl=r*5, jg=ctx.createLinearGradient(0,-jl,0,jl);                  // relativistic jets
    jg.addColorStop(0,'rgba(150,200,255,0)'); jg.addColorStop(.5,`rgba(190,225,255,${a})`); jg.addColorStop(1,'rgba(150,200,255,0)');
    ctx.strokeStyle=jg; ctx.lineWidth=r*.22; ctx.beginPath(); ctx.moveTo(0,-jl); ctx.lineTo(0,jl); ctx.stroke();
    ctx.scale(1,.3); ctx.strokeStyle=`rgba(255,242,255,${a})`; ctx.lineWidth=r*.18; ctx.beginPath(); ctx.arc(0,0,r*1.35,0,TAU); ctx.stroke();
    ctx.restore();
    const core=ctx.createRadialGradient(x,y,0,x,y,r*1.7);                   // blazing core
    core.addColorStop(0,`rgba(255,255,255,${a})`); core.addColorStop(.4,`rgba(${c},${a*.8})`); core.addColorStop(1,`rgba(${c},0)`);
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(x,y,r*1.7,0,TAU); ctx.fill();
  }
  function nebula(f){ const {x,y,r,a,hue}=f;
    for(let i=0;i<4;i++){ const ox=Math.cos(f.seed+i*1.6)*r, oy=Math.sin(f.seed*1.7+i)*r, rr=r*rnd(1.4,2.6), hu=(hue+i*38)%360;
      const g=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rr);
      g.addColorStop(0,`hsla(${hu},82%,66%,${a*.16})`); g.addColorStop(1,`hsla(${hu},82%,66%,0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x+ox,y+oy,rr,0,TAU); ctx.fill(); }
  }
  function quark(f){ const {x,y,r,a}=f, cols=['255,80,90','90,230,120','110,150,255'], pr=r*.75,   // a bound RGB trio (baryon)
    j=Math.sin(f.seed+performance.now()*.002)*.35;
    const p=cols.map((c,i)=>{ const an=f.rot+i*2.094+j; return [x+Math.cos(an)*pr, y+Math.sin(an)*pr, c]; });
    ctx.strokeStyle=`rgba(255,255,255,${a*.4})`; ctx.lineWidth=r*.07;                                // gluon bonds
    for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(p[i][0],p[i][1]); ctx.lineTo(p[(i+1)%3][0],p[(i+1)%3][1]); ctx.stroke(); }
    for(const [px,py,c] of p){ const g=ctx.createRadialGradient(px,py,0,px,py,r*.55);
      g.addColorStop(0,`rgba(${c},${a})`); g.addColorStop(1,`rgba(${c},0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,r*.55,0,TAU); ctx.fill(); }
  }
  const PAINT = { planet, galaxy, quasar, nebula, quark };

  function resize(){
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = innerWidth*DPR; H = cv.height = innerHeight*DPR;
    visualRnd = makeRng(0x48A7C0DE ^ ((innerWidth | 0) << 8) ^ (innerHeight | 0));
    cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
    if(innerWidth <= 560 && wrapEl){ mx = my = tx = ty = 0; wrapEl.style.transform = ''; }
    const k = LP ? .5 : 1;                                  // low-power: fewer objects
    stars = Array.from({length: Math.max(24, (Math.min(200,(innerWidth*innerHeight/8000)|0)*k)|0)}, star);
    feats = Array.from({length: Math.max(2, (Math.min(9, Math.max(3,(innerWidth/200)|0))*k)|0)}, () => feat(true));
    drops = Array.from({length: Math.max(4, (Math.min(30, Math.max(7,(innerWidth/64)|0))*k)|0)}, () => drop(true));
    if(!booted){ booted = true; flash = 1;                  // first paint = the revelation: all decode at once
      for(const d of drops){ d.res = 0; d.y = rnd(0,H); d.rspeed = rnd(.5,1.1); } }
  }
  function frame(t){
    t = t || performance.now();
    if ((!musicOn && t > activeUntil) || document.hidden) { running = false; return; }
    raf = requestAnimationFrame(frame);
    if(t - last < 1000/fps) return;                         // FPS cap
    dt = Math.min(2.5, (t - last) / 16.67); last = t;       // dt-scaled motion: same speed at any fps
    ctx.clearRect(0,0,W,H);
    tx += (mx-tx)*.05*dt; ty += (my-ty)*.05*dt;
    ctx.globalCompositeOperation='source-over'; ctx.lineCap='round'; ctx.textBaseline='alphabetic';
    if(flash > .01){ ctx.fillStyle=`rgba(150,210,255,${flash*.12})`; ctx.fillRect(0,0,W,H); flash*=Math.pow(.93,dt); } else flash=0;
    for(const d of drops){ d.y += d.v*dt; if(d.res < d.n) d.res += d.rspeed*dt;   // law rain (decode + fall)
      if(d.y - d.s > H) Object.assign(d, drop(false));
      drawLaw(d); }
    for(const s of stars){ s.x -= (s.v + tx*s.z*.04)*dt; s.y += ty*s.z*.02*dt;
      if(s.x+s.len<0){ Object.assign(s, star()); s.x = W+s.len; }
      ctx.strokeStyle=`rgba(${s.c},${s.a})`; ctx.lineWidth=(s.z*1.6+.4)*DPR;   // solid streak (no per-star gradient)
      ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x+s.len,s.y); ctx.stroke(); }
    feats.sort((a,b)=>a.z-b.z);                              // far → near
    for(const f of feats){ f.x -= (f.v + tx*f.z*.05)*dt; f.y += ty*f.z*.03*dt; f.rot += f.spin*dt;
      if(f.x + f.r*6 < 0) Object.assign(f, feat(false));
      ctx.globalCompositeOperation = f.t==='planet' ? 'source-over' : 'lighter';   // glow for the luminous ones
      PAINT[f.t](f); }
  }
  function startLoop(ms){
    activeUntil = performance.now() + ms;
    if (!running && !reduce && !document.hidden) {
      running = true; last = 0; raf = requestAnimationFrame(frame);
    }
  }
  function drawStill(){
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation='source-over'; ctx.textBaseline='alphabetic';
    for(const d of drops){ d.res=d.n; drawLaw(d); }
    for(const s of stars){ ctx.strokeStyle=`rgba(${s.c},${s.a})`; ctx.lineWidth=DPR; ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x+s.len,s.y); ctx.stroke(); }
    feats.sort((a,b)=>a.z-b.z);
    for(const f of feats){ ctx.globalCompositeOperation=f.t==='planet'?'source-over':'lighter'; PAINT[f.t](f); }
  }
  addEventListener('resize', resize, {passive:true});
  addEventListener('pointermove', e => {
    mx=(e.clientX/innerWidth-.5)*60; my=(e.clientY/innerHeight-.5)*60;
    if(!reduce) {
      if(wrapEl && innerWidth > 560) wrapEl.style.transform=`translate(${mx*.12}px,${my*.12}px)`;
      else if(wrapEl) wrapEl.style.transform='';
      startLoop(60000);
    }
  }, {passive:true});
  document.addEventListener('visibilitychange', () => { if(document.hidden) { cancelAnimationFrame(raf); running = false; } else startLoop(2200); });

  // The first interaction (the "unlock") re-cascades a wave of laws + a flash — god-mode reveal.
  window.__surge = () => { flash = Math.max(flash, .85); drops.forEach((d, i) => { if(i % 2 === 0) d.res = 0; }); startLoop(60000); };

  resize();
  drawStill();
})();
