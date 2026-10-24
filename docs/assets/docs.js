/* httpjet docs — progressive enhancement only. The site is fully readable without this file.
   Adds: mobile drawer, on-page TOC + scroll-spy, copy-code, heading anchors, client-side search,
   persistent epic-mode Web Audio synth player, and zero-gap soft navigation. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var AUDIO_STORAGE_KEY = "hj_epic_audio_v1";
  var DOCS_ASSET_VER = "20261024j";

  var makeRng = function (seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  /* ---------- shared singleton epic-mode synth engine ---------- */
  if (!window.__hjAudio) {
    window.__hjAudio = (function () {
      var AudioAPI = window.AudioContext || window.webkitAudioContext;
      var VOL = { track: 1, master: 6, limiterDrive: 3.2 };
      var MIX = { delay: 0.24, feedback: 0.32, reverb: 0.18, width: 0.72 };
      var VOICE = {
        pad: { attack:0.09, decay:0.22, sustain:0.78, release:0.32, vibrato:0.7, vibratoRate:4.2, detuneJitter:0.7, filterPeak:1.16 },
        bass: { attack:0.008, decay:0.08, sustain:0.82, release:0.045, detuneJitter:0.35, filterPeak:1.12 },
        pluck: { attack:0.006, decay:0.08, sustain:0.5, release:0.05, detuneJitter:0.45, filterPeak:1.35 },
        lead: { attack:0.018, decay:0.1, sustain:0.86, release:0.08, vibrato:2.4, vibratoRate:5.4, detuneJitter:0.55, filterPeak:1.22 },
        air: { attack:0.012, decay:0.09, sustain:0.62, release:0.06, vibrato:1.1, vibratoRate:6.2, detuneJitter:0.4, filterPeak:1.2 }
      };
      var R = null;
      var SONGS = [
        { title:"Photon Runway", bpm:136, bars:96, root:50, volume:1, chordBars:2, chords:[[0,"min"],[8,"maj"],[3,"maj"],[10,"maj"]],
          kick:[0,4,8,12], snare:[4,12], hats:2, bass:[0,R,0,7,0,R,10,R,0,R,0,7,10,R,7,R], arp:[0,2,1,2,0,2,1,3],
          melody:[12,R,15,17,19,R,17,15,12,R,10,12,15,R,12,R,19,R,22,24,22,R,19,17,15,R,17,19,17,R,15,R], lead:"square", bassWave:"sawtooth" },
        { title:"Rust Afterburner", bpm:124, bars:96, root:45, volume:1, chordBars:2, chords:[[0,"min"],[10,"maj"],[7,"min"],[8,"maj"]],
          kick:[0,4,8,11,12], snare:[4,12], hats:2, bass:[0,0,R,7,0,R,10,R,7,R,7,12,10,R,7,R], arp:[0,1,2,1,0,2,3,2],
          melody:[15,R,15,17,19,17,15,R,22,R,20,19,17,R,15,R,15,R,17,19,22,R,24,22,20,R,19,17,15,R,12,R], lead:"sawtooth", bassWave:"square" },
        { title:"Neon Hyperdrive", bpm:150, bars:96, root:49, volume:1, chordBars:1, chords:[[0,"min"],[3,"maj"],[8,"maj"],[10,"maj"]],
          kick:[0,3,4,8,12,14], snare:[4,12], hats:1, bass:[0,R,7,R,0,10,7,R,0,R,7,R,10,R,7,R], arp:[0,1,2,3,2,1,0,2],
          melody:[24,22,19,R,17,19,22,R,24,27,24,22,19,R,17,R,19,R,22,24,27,R,24,22,19,17,15,R,17,19,22,R], lead:"triangle", bassWave:"sawtooth" },
        { title:"Quasar Parade", bpm:118, bars:128, root:52, volume:1, chordBars:2, chords:[[0,"min"],[8,"maj"],[10,"maj"],[7,"min"],[3,"maj"],[10,"maj"]],
          kick:[0,4,8,12], snare:[4,12], hats:2, bass:[0,R,R,7,0,R,12,R,10,R,7,R,0,R,7,R], arp:[0,2,1,2,3,2,1,2],
          melody:[12,R,15,R,19,20,19,R,17,R,15,17,19,R,15,R,20,R,22,24,22,R,20,19,17,R,15,R,17,19,20,R], lead:"sawtooth", bassWave:"sawtooth" },
        { title:"Skyline Boss Rush", bpm:142, bars:112, root:47, volume:1, chordBars:1, chords:[[0,"min"],[7,"min"],[8,"maj"],[10,"maj"]],
          kick:[0,4,7,8,12], snare:[4,12], hats:2, bass:[0,R,0,7,0,7,10,R,0,R,12,10,7,R,10,R], arp:[0,1,2,1,0,2,1,3],
          melody:[19,R,19,22,24,R,22,19,17,R,19,22,19,R,17,R,24,R,27,29,27,R,24,22,19,R,22,24,22,R,19,R], lead:"square", bassWave:"square" },
        { title:"Cacheline Carnival", bpm:132, bars:80, root:48, volume:1, chordBars:2, chords:[[0,"maj"],[7,"min"],[9,"min"],[5,"maj"]],
          kick:[0,4,8,10,12], snare:[4,12], hats:2, bass:[0,R,7,R,12,R,7,R,0,R,4,7,12,R,7,R], arp:[0,1,2,1,3,2,1,2],
          melody:[12,16,19,R,21,19,16,R,12,16,19,21,23,R,21,R,19,R,21,23,24,R,23,21,19,16,19,R,16,R,12,R], lead:"triangle", bassWave:"sawtooth" },
        { title:"Thunder Cache", bpm:126, bars:112, root:43, volume:1, chordBars:2, chords:[[0,"min"],[8,"maj"],[5,"min"],[10,"maj"]],
          kick:[0,4,8,12,15], snare:[4,12], hats:2, bass:[0,R,0,R,7,R,10,R,0,R,7,0,12,R,10,R], arp:[0,2,1,2,0,1,2,3],
          melody:[12,R,12,15,19,R,22,R,20,R,19,15,17,R,15,R,12,R,15,19,24,R,22,20,19,R,17,15,12,R,10,R], lead:"sawtooth", bassWave:"sawtooth" },
        { title:"Orbit Pop Engine", bpm:160, bars:80, root:53, volume:1, chordBars:1, chords:[[0,"maj"],[5,"maj"],[9,"min"],[7,"maj"]],
          kick:[0,4,8,12], snare:[4,12], hats:1, bass:[0,R,4,R,7,R,12,R,7,R,4,R,0,R,7,R], arp:[0,1,2,1,0,2,3,2],
          melody:[12,16,19,16,21,R,19,R,24,23,21,19,16,R,19,R,21,R,19,16,14,R,16,R,19,21,23,24,23,R,21,R], lead:"square", bassWave:"square" },
        { title:"Midnight Launch Loop", bpm:110, bars:96, root:46, volume:1, chordBars:2, chords:[[0,"min"],[3,"maj"],[10,"maj"],[8,"maj"]],
          kick:[0,6,8,12], snare:[4,12], hats:2, bass:[0,R,R,7,0,R,10,R,7,R,R,12,10,R,7,R], arp:[0,1,2,1,3,2,1,0],
          melody:[12,R,15,R,17,R,19,R,22,R,20,19,17,R,15,R,12,R,15,17,19,R,22,24,22,R,19,17,15,R,12,R], lead:"triangle", bassWave:"sawtooth" },
        { title:"Victory Overclock", bpm:138, bars:128, root:51, volume:1, chordBars:2, chords:[[0,"min"],[8,"maj"],[10,"maj"],[3,"maj"],[5,"min"],[10,"maj"]],
          kick:[0,4,8,12,14], snare:[4,12], hats:2, bass:[0,R,7,R,0,R,10,R,12,R,10,R,7,R,10,R], arp:[0,2,1,2,3,2,1,2],
          melody:[19,R,22,24,27,R,24,22,19,R,17,19,22,R,19,R,24,R,27,31,29,R,27,24,22,R,24,27,24,R,22,R], lead:"sawtooth", bassWave:"square" }
      ];
      var QUAL = { min:[0,3,7], maj:[0,4,7], sus:[0,5,7], min7:[0,3,7,10], maj7:[0,4,7,11] };
      var audioCtx, master, compressor, limiter, fxBus, fxDelay, fxFeedback, fxTone, fxEcho, fxVerb, fxVerbGain, songBus, noiseBuffer, scheduler, uiTimer;
      var musicOn = false, audioBusy = false, currentTrack = -1, currentStep = 0, nextNoteTime = 0, trackStart = 0;
      var audioBtn, prevBtn, nextBtn, player, trackEl, timeEl, toast, volumeSlider;
      var history = [], recent = [];
      var playOrder = [0, 3, 6, 1, 8, 4, 9, 2, 5, 7];
      var orderPos = 0;

      function saveState() {
        try {
          sessionStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
            on: musicOn,
            track: currentTrack,
            step: currentStep,
            vol: VOL.master,
            orderPos: orderPos,
            ts: Date.now()
          }));
        } catch (_) {}
      }

      function showToast(msg) {
        toast = doc.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add("show");
        clearTimeout(showToast.t);
        showToast.t = setTimeout(function () { if (toast) toast.classList.remove("show"); }, 1800);
      }
      var songDuration = function (song) { return song.bars * 4 * 60 / song.bpm; };
      var fmtTime = function (sec) {
        var whole = Math.max(0, Math.round(sec));
        return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
      };
      var midiToHz = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
      var masterTarget = function () { return Math.max(0.0001, VOL.master); };
      function limiterCurve(drive) {
        var curve = new Float32Array(4096);
        var scale = Math.tanh(drive);
        for (var i = 0; i < curve.length; i++) {
          var x = i / (curve.length - 1) * 2 - 1;
          curve[i] = Math.tanh(x * drive) / scale;
        }
        return curve;
      }
      var hash01 = function (n, salt) {
        var x = Math.sin((n + 1) * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      var humanTime = function (step, lane, amount) { return (hash01(step, lane) - 0.5) * amount; };
      var liftGain = function (step, lane, amount) { return 1 + hash01(step, lane) * amount; };
      function reverbImpulse(seconds, decay) {
        var len = Math.floor(audioCtx.sampleRate * seconds);
        var impulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
        var rnd = makeRng(0xA11D10);
        for (var ch = 0; ch < 2; ch++) {
          var data = impulse.getChannelData(ch);
          for (var i = 0; i < len; i++) {
            var env = Math.pow(1 - i / len, decay);
            data[i] = (rnd() * 2 - 1) * env * (ch ? 0.86 : 1);
          }
        }
        return impulse;
      }
      var pickTrack = function (except) {
        for (var tries = 0; tries < playOrder.length; tries++) {
          var idx = playOrder[orderPos % playOrder.length];
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
        audioBtn = doc.getElementById("audio");
        if (!audioBtn) return;
        audioBtn.classList.toggle("playing", on);
        audioBtn.setAttribute("aria-pressed", on ? "true" : "false");
        audioBtn.setAttribute("aria-label", on ? "Stop epic music" : "Play epic music");
      }
      function updateTrackUi() {
        trackEl = doc.getElementById("audioTrack");
        timeEl = doc.getElementById("audioTime");
        player = doc.getElementById("epicPlayer");
        if (currentTrack < 0) return;
        var song = SONGS[currentTrack];
        var dur = songDuration(song);
        var elapsed = musicOn && audioCtx
          ? Math.max(0, audioCtx.currentTime - trackStart)
          : (currentStep * 60 / song.bpm / 4);
        if (trackEl) trackEl.textContent = song.title;
        if (timeEl) timeEl.textContent = (musicOn || currentStep > 0) ? (fmtTime(elapsed) + " / " + fmtTime(dur)) : fmtTime(dur);
        if (player) {
          var pct = (musicOn || currentStep > 0) ? Math.min(100, Math.max(0, elapsed / dur * 100)) : 0;
          player.style.setProperty("--track-progress", pct + "%");
        }
        if (musicOn) saveState();
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
          limiter.oversample = "4x";
          fxBus = audioCtx.createGain();
          fxBus.gain.value = 0.72;
          fxDelay = audioCtx.createDelay(1);
          fxDelay.delayTime.value = MIX.delay;
          fxFeedback = audioCtx.createGain();
          fxFeedback.gain.value = MIX.feedback;
          fxTone = audioCtx.createBiquadFilter();
          fxTone.type = "lowpass";
          fxTone.frequency.value = 3600;
          fxEcho = audioCtx.createGain();
          fxEcho.gain.value = 0.2;
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
        volumeSlider = doc.getElementById("audioVolume");
        if (!volumeSlider) return;
        var next = Number(volumeSlider.value);
        if (!Number.isFinite(next)) return;
        VOL.master = Math.max(0, next);
        if (musicOn && master && audioCtx) {
          master.gain.cancelScheduledValues(audioCtx.currentTime);
          master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + 0.06);
        }
        saveState();
      }
      function getNoise() {
        if (noiseBuffer) return noiseBuffer;
        var len = audioCtx.sampleRate * 2;
        noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        var data = noiseBuffer.getChannelData(0);
        var noiseRnd = makeRng(0x51A7E);
        for (var i = 0; i < len; i++) data[i] = noiseRnd() * 2 - 1;
        return noiseBuffer;
      }
      function out(node, pan, fx) {
        var dry = node;
        if (audioCtx.createStereoPanner && pan) {
          var p = audioCtx.createStereoPanner();
          p.pan.setValueAtTime(pan, audioCtx.currentTime);
          node.connect(p);
          dry = p;
        }
        dry.connect(songBus || master);
        if (fxBus && fx) {
          var send = audioCtx.createGain();
          send.gain.value = fx;
          dry.connect(send).connect(fxBus);
        }
      }
      function oscNote(note, when, dur, type, gain, detune, filterFreq, pan, fx, voice) {
        var amp = audioCtx.createGain();
        var filter = filterFreq ? audioCtx.createBiquadFilter() : null;
        var dest = filter || amp;
        var voices = detune ? [-detune, detune] : [0];
        var freq = midiToHz(note);
        if (filter) {
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(Math.max(80, filterFreq * 0.72), when);
          filter.frequency.exponentialRampToValueAtTime(filterFreq, when + Math.min(0.12, dur * 0.4));
          if (voice && voice.filterPeak) {
            filter.frequency.exponentialRampToValueAtTime(Math.min(12000, filterFreq * voice.filterPeak), when + Math.max(0.04, dur * 0.42));
            filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.92), when + dur);
          }
          filter.Q.setValueAtTime(1.8, when);
          filter.connect(amp);
        }
        var attack = Math.min(dur * 0.55, voice && voice.attack !== undefined ? voice.attack : Math.min(0.04, dur * 0.25));
        var decay = Math.min(dur * 0.4, voice && voice.decay !== undefined ? voice.decay : 0.05);
        var release = Math.min(dur * 0.7, voice && voice.release !== undefined ? voice.release : 0.025);
        var sustain = voice && voice.sustain !== undefined ? voice.sustain : 1;
        var peakAt = when + Math.max(0.001, attack);
        var releaseAt = Math.max(peakAt + 0.001, when + dur - release);
        var sustainAt = Math.min(releaseAt - 0.001, peakAt + decay);
        var sustainGain = Math.max(0.0001, gain * sustain);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.linearRampToValueAtTime(gain, peakAt);
        if (sustain < 0.999 && sustainAt > peakAt) {
          amp.gain.exponentialRampToValueAtTime(sustainGain, sustainAt);
          amp.gain.setValueAtTime(sustainGain, releaseAt);
        } else {
          amp.gain.setValueAtTime(gain, releaseAt);
        }
        amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        out(amp, pan || 0, fx || 0);
        voices.forEach(function (d, i) {
          var osc = audioCtx.createOscillator();
          var jitter = voice && voice.detuneJitter ? (hash01(note + Math.round(when * 100), i + 11) - 0.5) * voice.detuneJitter : 0;
          osc.type = type || "sawtooth";
          osc.frequency.setValueAtTime(freq, when);
          osc.detune.setValueAtTime(d + jitter, when);
          if (voice && voice.vibrato) {
            var lfo = audioCtx.createOscillator();
            var lfoGain = audioCtx.createGain();
            lfo.frequency.setValueAtTime(voice.vibratoRate || 5, when);
            lfoGain.gain.setValueAtTime(0.0001, when);
            lfoGain.gain.linearRampToValueAtTime(voice.vibrato, when + Math.min(0.22, dur * 0.4));
            lfo.connect(lfoGain).connect(osc.detune);
            lfo.start(when);
            lfo.stop(when + dur + 0.08);
          }
          osc.connect(dest);
          osc.start(when);
          osc.stop(when + dur + 0.08);
        });
      }
      function noiseHit(when, dur, gain, freq, pan, fx) {
        var src = audioCtx.createBufferSource();
        var filter = audioCtx.createBiquadFilter();
        var amp = audioCtx.createGain();
        src.buffer = getNoise();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(freq, when);
        filter.Q.setValueAtTime(0.8, when);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.linearRampToValueAtTime(gain, when + Math.min(0.012, dur * 0.3));
        amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(filter).connect(amp);
        out(amp, pan || 0, fx || 0);
        src.start(when);
        src.stop(when + dur + 0.03);
      }
      function kick(when, gain) {
        var osc = audioCtx.createOscillator();
        var amp = audioCtx.createGain();
        var body = audioCtx.createOscillator();
        var bodyAmp = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(145, when);
        osc.frequency.exponentialRampToValueAtTime(44, when + 0.14);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.linearRampToValueAtTime(gain, when + 0.008);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
        body.type = "triangle";
        body.frequency.setValueAtTime(72, when);
        body.frequency.exponentialRampToValueAtTime(48, when + 0.18);
        bodyAmp.gain.setValueAtTime(0.0001, when);
        bodyAmp.gain.linearRampToValueAtTime(gain * 0.18, when + 0.012);
        bodyAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
        osc.connect(amp).connect(songBus || master);
        body.connect(bodyAmp).connect(songBus || master);
        osc.start(when);
        body.start(when);
        osc.stop(when + 0.34);
        body.stop(when + 0.26);
        noiseHit(when, 0.028, gain * 0.09, 3200, 0, 0);
      }
      function snare(when, gain) {
        noiseHit(when, 0.16, gain, 1600, -0.1, 0.035);
        noiseHit(when, 0.055, gain * 0.22, 5200, 0.18, 0);
        noiseHit(when + 0.014, 0.08, gain * 0.16, 2400, -0.22, 0.018);
        noiseHit(when + 0.027, 0.07, gain * 0.11, 2800, 0.24, 0.018);
        oscNote(57, when, 0.09, "triangle", gain * 0.28, 0, 900, 0.1, 0.025);
      }
      function hatTone(when, dur, gain, pan) {
        [7200, 9250].forEach(function (freq, i) {
          var osc = audioCtx.createOscillator();
          var amp = audioCtx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq * (i ? 1.015 : 1), when);
          amp.gain.setValueAtTime(0.0001, when);
          amp.gain.linearRampToValueAtTime(gain * (i ? 0.06 : 0.08), when + 0.006);
          amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
          osc.connect(amp);
          out(amp, pan, 0);
          osc.start(when);
          osc.stop(when + dur + 0.02);
        });
      }
      function hat(when, gain, open) {
        var dur = open ? 0.18 : 0.055;
        noiseHit(when, dur, gain, 6200, 0.25, open ? 0.045 : 0.015);
        hatTone(when, open ? 0.12 : 0.035, gain, 0.25);
      }
      function sweep(when, dur, gain, pan) {
        var src = audioCtx.createBufferSource();
        var filter = audioCtx.createBiquadFilter();
        var amp = audioCtx.createGain();
        src.buffer = getNoise();
        src.loop = true;
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(460, when);
        filter.frequency.exponentialRampToValueAtTime(5400, when + dur * 0.88);
        filter.Q.setValueAtTime(1.7, when);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.linearRampToValueAtTime(gain, when + dur * 0.72);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(filter).connect(amp);
        out(amp, pan || 0, 0.3);
        src.start(when);
        src.stop(when + dur + 0.04);
      }
      function chordAt(song, bar) {
        var raw = song.chords[Math.floor(bar / (song.chordBars || 1)) % song.chords.length];
        var rootNote = song.root + raw[0];
        return { root: rootNote, notes: (QUAL[raw[1]] || QUAL.min).map(function (n) { return rootNote + n; }) };
      }
      function schedulePad(chord, when, dur, intensity) {
        chord.notes.forEach(function (n, i) {
          oscNote(n + 12, when + i * 0.018, dur, "triangle", 0.012 * intensity, 6, 760 + intensity * 420, (i - 1) * 0.16 * MIX.width, 0.32, VOICE.pad);
          oscNote(n + 24, when + i * 0.018, dur * 0.72, "sine", 0.006 * intensity, 0, 1200, (1 - i) * 0.11 * MIX.width, 0.24, VOICE.pad);
        });
      }
      function bassNote(note, when, dur, wave, gain, filterFreq, pan, fx, step) {
        oscNote(note, when, dur, wave, gain, 0, filterFreq, pan, fx, VOICE.bass);
        oscNote(note + 12, when + 0.004, Math.min(dur * 0.65, 0.18), "triangle", gain * 0.16, 0, 780, pan * 0.45, fx, VOICE.pluck);
        noiseHit(when, 0.018, gain * 0.028, 1800, pan, 0);
        if (step % 8 === 0) oscNote(note + 19, when + 0.012, Math.min(dur * 0.42, 0.12), "sine", gain * 0.045, 0, 1400, pan * 0.35, 0.01, VOICE.air);
      }
      function arpNote(note, when, dur, gain, filterFreq, pan, fx, step) {
        var t = when + humanTime(step, 3, Math.min(0.007, dur * 0.07));
        var g = gain * liftGain(step, 7, 0.1);
        oscNote(note, t, dur, "triangle", g, 2, filterFreq, pan, fx, VOICE.pluck);
        oscNote(note + 12, t + 0.01, Math.min(dur * 0.55, 0.11), "sine", g * 0.12, 0, filterFreq * 1.18, -pan * 0.55, fx * 0.8, VOICE.air);
      }
      function leadNote(note, when, dur, type, gain, detune, filterFreq, pan, fx, step, lift) {
        var t = when + humanTime(step, 13, Math.min(0.009, dur * 0.04));
        oscNote(note, t, dur, type, gain, detune, filterFreq, pan, fx, VOICE.lead);
        if (lift) oscNote(note, t + 0.018, dur * 0.9, type === "triangle" ? "sine" : "triangle", gain * 0.25, 4, filterFreq * 1.08, -pan * 1.2, fx * 1.25, VOICE.air);
      }
      function scheduleStep(step, when) {
        var song = SONGS[currentTrack];
        if (!song || !songBus) return;
        var stepDur = 60 / song.bpm / 4;
        var bar = (step / 16) | 0;
        var pos = step % 16;
        var phase = bar / song.bars;
        var cycle = bar % 32;
        var intro = bar < 8;
        var outro = phase > 0.92;
        var breakBar = cycle >= 24 && cycle < 28;
        var lift = cycle >= 28;
        var chorus = (cycle >= 8 && cycle < 24) || phase > 0.66;
        var chord = chordAt(song, bar);
        var intensity = outro ? 0.42 : intro ? 0.5 + bar * 0.055 : lift ? 1.08 : chorus ? 1 : 0.78;
        if (!outro) {
          if (song.kick.indexOf(pos) > -1 && (!breakBar || pos === 0)) kick(when, 0.22 * intensity);
          if (song.snare.indexOf(pos) > -1 && !intro) snare(when, 0.1 * intensity);
          if (!breakBar && pos % song.hats === 0) hat(when, 0.022 * intensity, lift && pos % 4 === 2);
          if (lift && pos % 2 === 1) hat(when, 0.015 * intensity, true);
        }
        if (pos === 0 && bar % (song.chordBars || 2) === 0) schedulePad(chord, when, stepDur * 16 * (song.chordBars || 2) * 0.94, intensity);
        if (lift && pos === 0 && cycle % 8 === 4) sweep(when, stepDur * 8, 0.014 * intensity, 0.12);
        if (bar >= 4 && !breakBar && !outro) {
          var b = song.bass[pos % song.bass.length];
          if (b !== R) {
            bassNote(chord.root - 12 + b, when, stepDur * 1.35, song.bassWave, 0.045 * intensity, 320, -0.08, 0.018, step);
            oscNote(chord.root - 24 + b, when, stepDur * 1.2, "sine", 0.032 * intensity, 0, 0, 0);
          }
        }
        if (bar >= 8 && !breakBar && !outro && pos % 2 === 0) {
          var a = song.arp[(step >> 1) % song.arp.length];
          var note = chord.notes[a % chord.notes.length] + 12 + Math.floor(a / chord.notes.length) * 12;
          arpNote(note, when, stepDur * 1.4, 0.025 * intensity, 1600 + intensity * 900, 0.18 * MIX.width, 0.18, step);
        }
        if ((chorus || lift) && !outro) {
          var m = song.melody[step % song.melody.length];
          if (m !== R) {
            leadNote(song.root + m, when, stepDur * (lift ? 1.15 : 1.7), song.lead, 0.036 * intensity, song.lead === "triangle" ? 0 : 5, 2100 + intensity * 1200, -0.22 * MIX.width, 0.2, step, lift);
            if (chorus && pos % 4 === 0) oscNote(song.root + m + 12, when + 0.015, stepDur * 0.9, "sine", 0.014 * intensity, 0, 0, 0.2 * MIX.width, 0.16, VOICE.air);
          }
        }
        if (lift && pos === 15) noiseHit(when, stepDur * 2.2, 0.035, 3400, 0, 0.22);
      }
      function startTrack(idx, push, at, initStep, silentToast) {
        var now = audioCtx.currentTime;
        var startAt = Math.max(now + 0.035, at || now + 0.05);
        if (currentTrack >= 0 && push) {
          history.push(currentTrack);
          if (history.length > 20) history.shift();
        }
        if (songBus) {
          var old = songBus;
          var fadeAt = Math.max(now, startAt - 0.2);
          old.gain.cancelScheduledValues(now);
          old.gain.setTargetAtTime(0.0001, fadeAt, 0.09);
          setTimeout(function () { try { old.disconnect(); } catch (_) {} }, 2200);
        }
        var step0 = Math.max(0, initStep | 0);
        var stepDur = 60 / SONGS[idx].bpm / 4;
        currentTrack = idx;
        currentStep = step0;
        nextNoteTime = startAt;
        trackStart = startAt - step0 * stepDur;
        songBus = audioCtx.createGain();
        songBus.gain.setValueAtTime(0.0001, startAt);
        songBus.gain.linearRampToValueAtTime(SONGS[idx].volume * VOL.track, startAt + 0.28);
        songBus.connect(master);
        updateTrackUi();
        if (!silentToast) showToast("Epic mode: " + SONGS[idx].title);
        if (window.__surge) window.__surge();
      }
      function scheduleAhead() {
        if (!musicOn || !audioCtx || currentTrack < 0) return;
        var horizon = audioCtx.currentTime + 0.72;
        while (nextNoteTime < horizon) {
          var song = SONGS[currentTrack];
          if (currentStep >= song.bars * 16) {
            startTrack(pickTrack(currentTrack), true, nextNoteTime + 0.04, 0, false);
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
      function startMusic(idx, initStep, silentToast) {
        return initAudio().then(function () {
          musicOn = true;
          setPlayingUi(true);
          master.gain.cancelScheduledValues(audioCtx.currentTime);
          master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + 0.16);
          startTrack(idx === undefined ? (currentTrack >= 0 ? currentTrack : pickTrack(currentTrack)) : idx, false, undefined, initStep || 0, silentToast);
          startScheduler();
          saveState();
        });
      }
      function stopMusic() {
        musicOn = false;
        clearInterval(scheduler);
        clearInterval(uiTimer);
        if (songBus && audioCtx) songBus.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08);
        if (master && audioCtx) {
          master.gain.cancelScheduledValues(audioCtx.currentTime);
          master.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        }
        setPlayingUi(false);
        player = doc.getElementById("epicPlayer");
        if (player) player.style.setProperty("--track-progress", "0%");
        updateTrackUi();
        saveState();
        showToast("Epic mode offline");
      }
      function toggleMusic() {
        audioBtn = doc.getElementById("audio");
        if (!audioBtn || audioBusy) return Promise.resolve();
        audioBusy = true;
        var p = !musicOn ? startMusic(currentTrack >= 0 ? currentTrack : undefined, currentStep) : Promise.resolve(stopMusic());
        return p.finally(function () { audioBusy = false; });
      }
      function skipTrack(dir) {
        if (audioBusy) return Promise.resolve();
        audioBusy = true;
        return initAudio().then(function () {
          if (!musicOn) {
            musicOn = true;
            setPlayingUi(true);
            master.gain.cancelScheduledValues(audioCtx.currentTime);
            master.gain.exponentialRampToValueAtTime(masterTarget(), audioCtx.currentTime + 0.16);
          }
          var idx = dir < 0 && history.length ? history.pop() : pickTrack(currentTrack);
          startTrack(idx, dir > 0, undefined, 0, false);
          startScheduler();
          saveState();
        }).finally(function () { audioBusy = false; });
      }

      function bindUi() {
        audioBtn = doc.getElementById("audio");
        prevBtn = doc.getElementById("audioPrev");
        nextBtn = doc.getElementById("audioNext");
        player = doc.getElementById("epicPlayer");
        trackEl = doc.getElementById("audioTrack");
        timeEl = doc.getElementById("audioTime");
        toast = doc.getElementById("toast");
        volumeSlider = doc.getElementById("audioVolume");

        if (volumeSlider) {
          volumeSlider.value = String(VOL.master);
          if (!volumeSlider.dataset.hjBound) {
            volumeSlider.dataset.hjBound = "1";
            volumeSlider.addEventListener("input", syncVolume);
          }
        }
        if (audioBtn && AudioAPI) {
          if (!audioBtn.dataset.hjBound) {
            audioBtn.dataset.hjBound = "1";
            audioBtn.addEventListener("click", function () { toggleMusic().catch(function () { showToast("Audio unavailable"); }); });
          }
          if (prevBtn && !prevBtn.dataset.hjBound) {
            prevBtn.dataset.hjBound = "1";
            prevBtn.addEventListener("click", function () { skipTrack(-1).catch(function () { showToast("Audio unavailable"); }); });
          }
          if (nextBtn && !nextBtn.dataset.hjBound) {
            nextBtn.dataset.hjBound = "1";
            nextBtn.addEventListener("click", function () { skipTrack(1).catch(function () { showToast("Audio unavailable"); }); });
          }
        } else if (audioBtn) {
          [audioBtn, prevBtn, nextBtn].filter(Boolean).forEach(function (btn) {
            btn.disabled = true;
            btn.title = "Web Audio is not available in this browser";
          });
        }
        setPlayingUi(musicOn);
        updateTrackUi();
      }

      function restoreSession() {
        if (!AudioAPI) return;
        var saved = null;
        try {
          saved = JSON.parse(sessionStorage.getItem(AUDIO_STORAGE_KEY) || "null");
        } catch (_) {}
        if (!saved || typeof saved !== "object") return;
        if (Number.isFinite(Number(saved.vol))) VOL.master = Math.max(0, Number(saved.vol));
        if (Number.isFinite(Number(saved.orderPos))) orderPos = Math.max(0, saved.orderPos | 0);
        if (Number.isInteger(saved.track) && saved.track >= 0 && saved.track < SONGS.length) {
          var tr = saved.track;
          var st = Math.max(0, saved.step | 0);
          var elapsedSec = Math.max(0, (Date.now() - (saved.ts || Date.now())) / 1000);
          if (saved.on && elapsedSec < 3600) {
            var rem = elapsedSec;
            while (rem > 0) {
              var s = SONGS[tr];
              var stepDur = 60 / s.bpm / 4;
              var totalSteps = s.bars * 16;
              var leftSteps = Math.max(1, totalSteps - st);
              if (rem < leftSteps * stepDur) {
                st += Math.floor(rem / stepDur);
                rem = 0;
              } else {
                rem -= leftSteps * stepDur;
                tr = pickTrack(tr);
                st = 0;
              }
            }
          }
          currentTrack = tr;
          currentStep = st;
          if (saved.on) {
            initAudio().then(function () {
              if (audioCtx && audioCtx.state === "running") {
                startMusic(tr, st, true).catch(function () {});
              } else {
                var unlock = function (e) {
                  if (e.target && e.target.closest && e.target.closest("#audio, #audioPrev, #audioNext")) {
                    window.removeEventListener("pointerdown", unlock, true);
                    window.removeEventListener("keydown", unlock, true);
                    return;
                  }
                  window.removeEventListener("pointerdown", unlock, true);
                  window.removeEventListener("keydown", unlock, true);
                  if (!musicOn) startMusic(currentTrack, currentStep, true).catch(function () {});
                };
                window.addEventListener("pointerdown", unlock, true);
                window.addEventListener("keydown", unlock, true);
              }
            }).catch(function () {});
          }
        }
      }

      window.addEventListener("pagehide", saveState);
      restoreSession();
      return { bindUi: bindUi, isPlaying: function () { return musicOn; }, saveState: saveState };
    })();
  }

  /* ---------- zero-gap soft router between /docs/* and / ---------- */
  if (!window.__hjRouter) {
    window.__hjRouter = (function () {
      var navBusy = false;

      function loadScriptOnce(src) {
        return new Promise(function (resolve, reject) {
          if (doc.querySelector('script[src="' + src + '"]')) { resolve(); return; }
          var s = doc.createElement("script");
          s.src = src;
          s.onload = function () { resolve(); };
          s.onerror = function (err) { reject(err); };
          doc.body.appendChild(s);
        });
      }

      function ensureStylesheet(href) {
        return new Promise(function (resolve) {
          var link = doc.getElementById("hj-docs-css") || doc.querySelector('link[href*="docs.min.css"]');
          if (link) {
            link.disabled = false;
            resolve(link);
            return;
          }
          link = doc.createElement("link");
          link.id = "hj-docs-css";
          link.rel = "stylesheet";
          link.href = href;
          link.onload = function () { resolve(link); };
          link.onerror = function () { resolve(link); };
          doc.head.appendChild(link);
        });
      }

      function syncHeadMeta(parsedDoc) {
        if (parsedDoc.title) doc.title = parsedDoc.title;
        var canNew = parsedDoc.querySelector('link[rel="canonical"]');
        var canCur = doc.querySelector('link[rel="canonical"]');
        if (canNew && canCur) canCur.href = canNew.getAttribute("href");
        var descNew = parsedDoc.querySelector('meta[name="description"]');
        var descCur = doc.querySelector('meta[name="description"]');
        if (descNew && descCur) descCur.setAttribute("content", descNew.getAttribute("content") || "");
      }

      function normDocSlug(pathname) {
        var clean = (pathname || "").replace(/\/+$/, "");
        var seg = clean.split("/").pop() || "";
        if (!seg || seg === "docs" || seg === "index" || seg === "index.html") return "index";
        return seg.replace(/\.html$/, "");
      }

      function navigate(rawUrl, pushState) {
        if (navBusy) return Promise.resolve();
        navBusy = true;
        var url;
        try {
          url = new URL(rawUrl, window.location.href);
        } catch (_) {
          navBusy = false;
          window.location.href = rawUrl;
          return Promise.resolve();
        }
        if (url.pathname === "/docs") url.pathname = "/docs/";
        var isDocsTarget = url.pathname.indexOf("/docs/") === 0;
        var isLandingTarget = url.pathname === "/" || url.pathname === "/index.html";
        if (!isDocsTarget && !isLandingTarget) {
          navBusy = false;
          window.location.href = url.href;
          return Promise.resolve();
        }

        return fetch(url.pathname + url.search, { credentials: "same-origin" }).then(function (res) {
          if (!res.ok) throw new Error("status " + res.status);
          return res.text();
        }).then(function (htmlText) {
          var parsed = new DOMParser().parseFromString(htmlText, "text/html");
          if (isDocsTarget) {
            var onDocsAlready = Boolean(doc.querySelector("header.hdr") && doc.querySelector("main.content"));
            var newMain = parsed.querySelector("main.content");
            if (!newMain) { window.location.href = url.href; return; }
            if (onDocsAlready) {
              if (pushState) history.pushState({ hjView: "docs" }, "", url.pathname + url.search + url.hash);
              syncHeadMeta(parsed);
              doc.querySelector("main.content").innerHTML = newMain.innerHTML;
              if (window.__hjInitDocs) window.__hjInitDocs();
              if (window.__hjAudio) window.__hjAudio.bindUi();
            } else {
              var inlineLandingStyle = doc.querySelector("head style:not([id])") || doc.getElementById("hj-landing-style");
              if (inlineLandingStyle) inlineLandingStyle.id = "hj-landing-style";
              return ensureStylesheet("/docs/assets/docs.min.css?v=" + DOCS_ASSET_VER).then(function () {
                if (window.__hjStopLanding) window.__hjStopLanding();
                if (inlineLandingStyle) inlineLandingStyle.disabled = true;
                if (pushState) history.pushState({ hjView: "docs" }, "", url.pathname + url.search + url.hash);
                syncHeadMeta(parsed);
                root.classList.remove("settled", "no-js");
                root.classList.add("js", "revealed");
                Array.prototype.slice.call(parsed.body.querySelectorAll("script")).forEach(function (s) { s.remove(); });
                doc.body.innerHTML = parsed.body.innerHTML;
                if (window.__hjAudio) window.__hjAudio.bindUi();
                if (window.__hjInitDocs) window.__hjInitDocs();
              });
            }
          } else if (isLandingTarget) {
            var landingStyle = doc.getElementById("hj-landing-style");
            if (!landingStyle) {
              var parsedStyle = parsed.querySelector("head style");
              if (parsedStyle) {
                landingStyle = doc.createElement("style");
                landingStyle.id = "hj-landing-style";
                landingStyle.textContent = parsedStyle.textContent;
                doc.head.appendChild(landingStyle);
              }
            }
            if (landingStyle) landingStyle.disabled = false;
            Array.prototype.slice.call(doc.querySelectorAll('link[href*="docs.min.css"], #hj-docs-css')).forEach(function (l) { l.disabled = true; });
            if (pushState) history.pushState({ hjView: "landing" }, "", "/" + url.search + url.hash);
            syncHeadMeta(parsed);
            root.classList.remove("js", "revealed");
            Array.prototype.slice.call(parsed.body.querySelectorAll("script")).forEach(function (s) { s.remove(); });
            doc.body.innerHTML = parsed.body.innerHTML;
            if (window.__hjAudio) window.__hjAudio.bindUi();
            if (window.__hjInitLanding) {
              window.__hjInitLanding();
            } else {
              return loadScriptOnce("/index.min.js?v=" + DOCS_ASSET_VER);
            }
          }
        }).then(function () {
          if (url.hash) {
            var targetEl = doc.getElementById(decodeURIComponent(url.hash.slice(1)));
            if (targetEl) targetEl.scrollIntoView();
            else window.scrollTo(0, 0);
          } else {
            window.scrollTo(0, 0);
          }
        }).catch(function () {
          window.location.href = rawUrl;
        }).finally(function () {
          navBusy = false;
        });
      }

      doc.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest("a[href]");
        if (!a || a.target || a.hasAttribute("download")) return;
        var rawHref = a.getAttribute("href") || "";
        if (!rawHref || rawHref.charAt(0) === "#" || /^(?:mailto:|tel:|javascript:)/i.test(rawHref)) return;

        var url;
        try {
          url = new URL(rawHref, window.location.href);
        } catch (_) { return; }

        if (url.hostname === "httpjet.net" && window.location.hostname !== "httpjet.net") {
          url = new URL(url.pathname + url.search + url.hash, window.location.origin);
        }
        if (url.origin !== window.location.origin) return;
        if (/\.(?:txt|xml|json|pdf|zip|tar|gz)$/i.test(url.pathname)) return;
        if (url.pathname === "/docs") url.pathname = "/docs/";

        var isDocs = url.pathname.indexOf("/docs/") === 0;
        var isLanding = url.pathname === "/" || url.pathname === "/index.html";
        if (!isDocs && !isLanding) return;

        var curIsDocs = window.location.pathname.indexOf("/docs") === 0;
        if (isDocs && curIsDocs && normDocSlug(url.pathname) === normDocSlug(window.location.pathname) && url.search === window.location.search) {
          if (url.hash) {
            e.preventDefault();
            history.pushState(null, "", url.hash);
            var t = doc.getElementById(decodeURIComponent(url.hash.slice(1)));
            if (t) t.scrollIntoView();
          }
          return;
        }

        e.preventDefault();
        navigate(url.href, true);
      });

      window.addEventListener("popstate", function () {
        navigate(window.location.href, false);
      });

      return { navigate: navigate };
    })();
  }

  var activeScrollSpy = null;
  var activeExpanded = null;
  var curPageUrl = "./";
  var sidebar, menuBtn, scrim, ov, sbtn, input, results, index = null, sel = -1, lastFocus = null;

  var EXP_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg><span>Expand</span>';
  var MIN_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/></svg><span>Minimize (Esc)</span>';

  function setExpanded(el, expand) {
    if (!el) return;
    var btn = el.querySelector(":scope > .expbtn");
    if (expand) {
      if (activeExpanded && activeExpanded !== el) setExpanded(activeExpanded, false);
      el.classList.add("is-expanded");
      doc.body.classList.add("has-expanded");
      if (btn) { btn.innerHTML = MIN_ICO; btn.setAttribute("aria-expanded", "true"); btn.setAttribute("title", "Minimize back to page (Esc)"); }
      activeExpanded = el;
    } else {
      el.classList.remove("is-expanded");
      doc.body.classList.remove("has-expanded");
      if (btn) { btn.innerHTML = EXP_ICO; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("title", "Expand to full viewport"); }
      if (activeExpanded === el) activeExpanded = null;
    }
  }

  function attachExpandButtons(rootEl) {
    var targets = Array.prototype.slice.call((rootEl || doc).querySelectorAll(".figure, .chart, .bexp"));
    targets.forEach(function (el) {
      if (el.parentElement && el.parentElement.closest(".bexp")) return;
      if (el.querySelector(":scope > .expbtn")) return;
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "expbtn";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Toggle full-viewport view");
      btn.setAttribute("title", "Expand to full viewport");
      btn.innerHTML = EXP_ICO;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setExpanded(el, !el.classList.contains("is-expanded"));
      });
      el.insertBefore(btn, el.firstChild);
    });
  }

  function closeDrawer(focusMenu) {
    if (sidebar) sidebar.classList.remove("open");
    if (scrim) scrim.classList.remove("show");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    if (focusMenu && menuBtn) menuBtn.focus();
  }

  function openSearch(initialQ) {
    if (!ov) return;
    if (activeExpanded) setExpanded(activeExpanded, false);
    if (!index && window.DOCS_INDEX) index = window.DOCS_INDEX;
    lastFocus = doc.activeElement;
    ov.classList.add("open");
    var qVal = typeof initialQ === "string" ? initialQ : "";
    if (input) { input.value = qVal; input.focus(); }
    renderSearch(qVal);
  }

  function closeSearch(focusBack) {
    if (ov) ov.classList.remove("open");
    sel = -1;
    if (focusBack && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function msg(text) {
    if (!results) return;
    results.textContent = "";
    var d = doc.createElement("div");
    d.className = "search-empty";
    d.textContent = text;
    results.appendChild(d);
  }
  function safeRel(u) { return /^[\w./#-]+$/.test(u || "") ? u : "#"; }

  function renderSearch(q) {
    if (!results) return;
    q = (q || "").trim().toLowerCase();
    if (!index && window.DOCS_INDEX) index = window.DOCS_INDEX;
    if (!index) { msg("Loading index…"); return; }
    var out = [];
    if (q) {
      index.forEach(function (pg) {
        if (pg.title.toLowerCase().indexOf(q) > -1 || (pg.blurb && pg.blurb.toLowerCase().indexOf(q) > -1))
          out.push({ url: pg.url, page: pg.section, title: pg.title, x: pg.blurb || "" });
        (pg.headings || []).forEach(function (h) {
          var tMatch = h.t.toLowerCase().indexOf(q) > -1;
          var kwMatch = !tMatch && h.kw && h.kw.toLowerCase().indexOf(q) > -1;
          if (tMatch || kwMatch) {
            var snip = "";
            if (kwMatch) {
              var tok = h.kw.split(" ").filter(function (w) { return w.toLowerCase().indexOf(q) > -1; }).slice(0, 4).join(" · ");
              snip = tok ? "matches: " + tok : "";
            }
            out.push({ url: pg.url + "#" + h.id, page: pg.title, title: h.t, x: snip });
          }
        });
      });
    }
    out = out.slice(0, 24);
    sel = -1;
    if (!q) { msg("Type to search the docs."); return; }
    if (!out.length) { msg("No matches for “" + q + "”."); return; }
    results.textContent = "";
    out.forEach(function (r) {
      var href = safeRel(r.url);
      if (href.indexOf(curPageUrl + "#") === 0) {
        href = href.slice(curPageUrl.length);
      }
      var a = doc.createElement("a"); a.href = href;
      var p = doc.createElement("span"); p.className = "p"; p.textContent = r.page; a.appendChild(p);
      var t = doc.createElement("div"); t.className = "t"; t.textContent = r.title; a.appendChild(t);
      if (r.x) { var x = doc.createElement("div"); x.className = "x"; x.textContent = r.x; a.appendChild(x); }
      results.appendChild(a);
    });
  }

  window.__hjInitDocs = function () {
    requestAnimationFrame(function () { root.classList.add("revealed"); });
    if (window.__hjAudio) window.__hjAudio.bindUi();

    var cleanCurPath = (window.location.pathname || "").replace(/\/+$/, "");
    var lastCurSeg = cleanCurPath.split("/").pop() || "";
    curPageUrl = (!lastCurSeg || lastCurSeg === "docs" || lastCurSeg === "index" || lastCurSeg === "index.html")
      ? "./"
      : (lastCurSeg.endsWith(".html") ? lastCurSeg : lastCurSeg + ".html");

    sidebar = doc.querySelector(".sidebar");
    menuBtn = doc.querySelector(".menubtn");
    scrim = doc.querySelector(".scrim");
    ov = doc.querySelector(".search-ov");
    sbtn = doc.querySelector(".searchbtn");
    input = ov ? ov.querySelector("input") : null;
    results = ov ? ov.querySelector(".search-res") : null;
    if (!index && window.DOCS_INDEX && window.DOCS_INDEX.length) index = window.DOCS_INDEX;

    if (activeExpanded) setExpanded(activeExpanded, false);
    closeDrawer(false);
    closeSearch(false);

    if (menuBtn && sidebar && !menuBtn.dataset.hjBound) {
      menuBtn.dataset.hjBound = "1";
      menuBtn.addEventListener("click", function () {
        var open = sidebar.classList.toggle("open");
        if (scrim) scrim.classList.toggle("show", open);
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) sidebar.focus({ preventScroll: true });
      });
    }
    if (sidebar) {
      sidebar.setAttribute("tabindex", "-1");
      if (!sidebar.dataset.hjBound) {
        sidebar.dataset.hjBound = "1";
        sidebar.addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });
      }
    }
    if (scrim && !scrim.dataset.hjBound) {
      scrim.dataset.hjBound = "1";
      scrim.addEventListener("click", function () { closeDrawer(true); });
    }

    if (sbtn && !sbtn.dataset.hjBound) {
      sbtn.dataset.hjBound = "1";
      sbtn.addEventListener("click", function () { openSearch(""); });
    }
    if (input && !input.dataset.hjBound) {
      input.dataset.hjBound = "1";
      input.addEventListener("input", function () { renderSearch(input.value); });
    }
    if (ov && !ov.dataset.hjBound) {
      ov.dataset.hjBound = "1";
      ov.addEventListener("click", function (e) { if (e.target === ov) closeSearch(true); });
    }
    if (results && !results.dataset.hjBound) {
      results.dataset.hjBound = "1";
      results.addEventListener("click", function (e) {
        if (e.target.closest("a")) closeSearch(false);
      });
    }

    /* update active link in sidebar and clear old sub-anchors */
    if (sidebar) {
      Array.prototype.slice.call(sidebar.querySelectorAll(".nav-link")).forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("href") === curPageUrl);
      });
      Array.prototype.slice.call(sidebar.querySelectorAll(".nav-sub")).forEach(function (sub) {
        sub.textContent = "";
      });
    }

    /* ---------- heading anchors + TOC build ---------- */
    var content = doc.querySelector(".content");
    var heads = content ? Array.prototype.slice.call(content.querySelectorAll("h2[id], h3[id]")) : [];

    heads.forEach(function (h) {
      if (h.querySelector(".anchor")) return;
      var a = doc.createElement("a");
      a.className = "anchor"; a.href = "#" + h.id; a.textContent = "#";
      a.setAttribute("aria-hidden", "true");
      a.setAttribute("tabindex", "-1");
      h.appendChild(a);
    });

    /* right-rail TOC */
    var toc = doc.querySelector(".toc");
    if (toc) {
      toc.textContent = "";
      if (heads.length) {
        heads.forEach(function (h) {
          var a = doc.createElement("a");
          a.href = "#" + h.id; a.textContent = h.textContent.replace(/#$/, "").trim();
          if (h.tagName === "H3") a.className = "sub";
          a.dataset.id = h.id;
          toc.appendChild(a);
        });
      }
    }

    /* sidebar sub-anchors under the active page (h2 only, to stay tidy) */
    var activeLink = doc.querySelector(".nav-link.active");
    var navSub = activeLink && activeLink.nextElementSibling && activeLink.nextElementSibling.classList.contains("nav-sub")
        ? activeLink.nextElementSibling : null;
    if (navSub) {
      heads.filter(function (h) { return h.tagName === "H2"; }).forEach(function (h) {
        var a = doc.createElement("a");
        a.href = "#" + h.id; a.textContent = h.textContent.replace(/#$/, "").trim(); a.dataset.id = h.id;
        navSub.appendChild(a);
      });
    }

    /* ---------- scroll-spy ---------- */
    if (activeScrollSpy) {
      activeScrollSpy.disconnect();
      activeScrollSpy = null;
    }
    if (heads.length && (toc || navSub)) {
      var spyTargets = {};
      (toc ? Array.prototype.slice.call(toc.querySelectorAll("a")) : []).forEach(function (a) {
        (spyTargets[a.dataset.id] = spyTargets[a.dataset.id] || []).push(a);
      });
      (navSub ? Array.prototype.slice.call(navSub.querySelectorAll("a")) : []).forEach(function (a) {
        (spyTargets[a.dataset.id] = spyTargets[a.dataset.id] || []).push(a);
      });
      var current = null;
      activeScrollSpy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) current = en.target.id;
        });
        Object.keys(spyTargets).forEach(function (id) {
          spyTargets[id].forEach(function (a) { a.classList.toggle("cur", id === current); });
        });
      }, { rootMargin: "-12% 0px -72% 0px", threshold: 0 });
      heads.forEach(function (h) { activeScrollSpy.observe(h); });
    }

    /* ---------- copy-code ---------- */
    Array.prototype.slice.call(doc.querySelectorAll(".codeframe")).forEach(function (frame) {
      var pre = frame.querySelector("pre");
      if (!pre) return;
      var bar = frame.querySelector(".codeframe__bar");
      if (!bar || bar.querySelector(".copy")) return;
      var btn = doc.createElement("button");
      btn.className = "copy"; btn.type = "button"; btn.textContent = "copy"; btn.setAttribute("aria-label", "Copy code");
      bar.appendChild(btn);
      btn.addEventListener("click", function () {
        var text = pre.innerText;
        var done = function () { btn.textContent = "copied"; btn.classList.add("ok"); setTimeout(function () { btn.textContent = "copy"; btn.classList.remove("ok"); }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
        else { var t = doc.createElement("textarea"); t.value = text; doc.body.appendChild(t); t.select(); try { doc.execCommand("copy"); } catch (e) {} doc.body.removeChild(t); done(); }
      });
    });

    /* ---------- tabs ---------- */
    Array.prototype.slice.call(doc.querySelectorAll(".tabs")).forEach(function (tabs) {
      if (tabs.dataset.hjBound) return;
      tabs.dataset.hjBound = "1";
      var btns = Array.prototype.slice.call(tabs.querySelectorAll(".tabs__bar button")),
          panels = Array.prototype.slice.call(tabs.querySelectorAll(".tabs__panel"));
      function show(i) {
        btns.forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
        panels.forEach(function (p, j) { p.classList.toggle("on", i === j); });
      }
      btns.forEach(function (b, i) { b.addEventListener("click", function () { show(i); }); });
      show(0);
    });

    /* ---------- filterable tables (CLI flags, directives, metrics) ---------- */
    Array.prototype.slice.call(doc.querySelectorAll("[data-filter]")).forEach(function (bar) {
      if (bar.dataset.hjBound) return;
      bar.dataset.hjBound = "1";
      var table = doc.getElementById(bar.getAttribute("data-filter"));
      if (!table) return;
      var fInput = bar.querySelector("input"), count = bar.querySelector(".count"),
          chips = Array.prototype.slice.call(bar.querySelectorAll(".fchip")),
          rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr")).filter(function (r) { return !r.classList.contains("grouphead"); }),
          gHeads = Array.prototype.slice.call(table.querySelectorAll("tbody tr.grouphead")),
          group = "";
      function apply() {
        var q = (fInput ? fInput.value : "").trim().toLowerCase(), n = 0;
        rows.forEach(function (r) {
          var ok = (!q || r.textContent.toLowerCase().indexOf(q) > -1) && (!group || r.getAttribute("data-group") === group);
          r.hidden = !ok; if (ok) n++;
        });
        gHeads.forEach(function (h) {
          var g = h.getAttribute("data-group"), any = rows.some(function (r) { return !r.hidden && r.getAttribute("data-group") === g; });
          h.hidden = !any;
        });
        if (count) count.textContent = n + " of " + rows.length;
      }
      if (fInput) fInput.addEventListener("input", apply);
      chips.forEach(function (c) {
        c.addEventListener("click", function () {
          var g = c.getAttribute("data-group");
          group = (group === g) ? "" : g;
          chips.forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-group") === group ? "true" : "false"); });
          apply();
        });
      });
      apply();
    });

  /* ---------- widget: page-cache key & tier explorer ---------- */
  var ck = doc.getElementById("cachekey");
  if (ck && !ck.dataset.hjBound) {
    ck.dataset.hjBound = "1";
    var q = function (sel) { return ck.querySelector(sel); };
    var out = q(".widget__out");
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    function render() {
      var method = q("[name=method]").value, scheme = q("[name=scheme]").value, host = q("[name=host]").value || "example.test",
          path = q("[name=path]").value || "/", query = q("[name=query]").value,
          member = q("[name=member]").checked, priv = q("[name=private]").checked, shared = q("[name=shared]").checked,
          style = q("[name=style]").value, hdr = q("[name=hdr]").value, origin = q("[name=origin]").checked;
      var lines = [];
      if (method !== "GET" && method !== "HEAD") { lines.push('<span class="bad">bypass</span> — only GET/HEAD are looked up or stored (POST caching is not implemented).'); out.innerHTML = lines.join("\n"); return; }
      var tier = "public";
      if (member) {
        if (shared) tier = "public (shared-paths allowlist, sticky canary)";
        else if (priv) tier = "private";
        else { lines.push('<span class="bad">bypass</span> — a member-cookie request without <b>--page-cache-private</b> never touches the public tier.'); out.innerHTML = lines.join("\n"); return; }
      }
      var key = ["epoch·gen", "vhost(" + esc(host) + ")", scheme, esc(host), esc(path) + (query ? "?" + esc(query) : "")];
      if (style) key.push("vary:xf_style_id=" + esc(style));
      if (origin) key.push("origin:<request Origin>");
      if (tier === "private") key.push("session:<xf_session value>");
      lines.push("tier    : <b>" + tier + "</b>");
      lines.push("key     : " + key.join(" · "));
      lines.push("identity: host=" + esc(host) + " raw-path=" + esc(path) + "  (guard: a collision is a miss, never wrong content)");
      var h = hdr.trim();
      if (!h) lines.push('<span class="warn">not stored</span> — the response carries no accepted cache header (opt-in is the app\'s job).');
      else if (/no-cache|no-store/i.test(h)) lines.push('<span class="bad">not stored</span> — ' + esc(h));
      else if (/private/i.test(h) && tier !== "private") lines.push('<span class="warn">not stored on the public tier</span> — a private opt-in needs a member request and --page-cache-private.');
      else if (/public/i.test(h) && tier === "private") lines.push('<span class="warn">stored PRIVATE</span> — a member request stores under its session even for a public opt-in (never into the public tier).');
      else {
        var m = /max-age=(\d+)/i.exec(h);
        lines.push('<span class="good">store candidate</span> — TTL ' + (m ? m[1] + " s" : "default expireInSeconds") + ", subject to W-TinyLFU admission (threshold 2 by default → stored on the 2nd sighting) and the status/Set-Cookie/self-redirect guards.");
      }
      out.innerHTML = lines.join("\n");
    }
    Array.prototype.slice.call(ck.querySelectorAll("input,select")).forEach(function (el) { el.addEventListener("input", render); el.addEventListener("change", render); });
    render();
  }

  /* ---------- widget: page-cache budget calculator ---------- */
  var bw = doc.getElementById("budget");
  if (bw && !bw.dataset.hjBound) {
    bw.dataset.hjBound = "1";
    var g = function (n) { return parseFloat(bw.querySelector("[name=" + n + "]").value) || 0; };
    var bo = bw.querySelector(".widget__out");
    function fmt(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + " GiB" : Math.round(mb) + " MiB"; }
    function calc() {
      var mem = g("mem"), disk = g("disk"), hot = g("hot"), ratio = g("ratio"), page = g("page"), meta = 6;
      var ram = mem + hot;
      var entriesByDisk = disk * 1024 / (page / ratio);
      var entriesByMeta = mem * 1024 / meta;
      var entries = Math.min(entriesByDisk, entriesByMeta);
      var identity = entries * page / 1024;
      var b = [];
      b.push("process RAM reserved for the cache : <b>" + fmt(ram) + "</b> (index " + fmt(mem) + " + hot tier " + fmt(hot) + ")");
      b.push("tmpfs footprint cap (also RAM)      : <b>" + fmt(disk) + "</b>");
      b.push("≈ entries the file tier holds       : <b>" + Math.round(entriesByDisk).toLocaleString() + "</b> at " + (page / ratio).toFixed(0) + " KB stored per " + page + " KB page (" + ratio + "× dictionary ratio)");
      b.push("≈ entries the index can describe    : <b>" + Math.round(entriesByMeta).toLocaleString() + "</b> at ~" + meta + " KB of metadata each");
      b.push("effective capacity                  : <b>" + Math.round(entries).toLocaleString() + " pages ≈ " + fmt(identity) + " of identity HTML</b>");
      if (entriesByMeta < entriesByDisk) b.push('<span class="warn">the RAM index is the binding cap — raise --page-cache-mem or lower --page-cache-disk-mem.</span>');
      else b.push('<span class="good">the tmpfs budget is the binding cap (the usual shape).</span>');
      bo.innerHTML = b.join("\n");
    }
    Array.prototype.slice.call(bw.querySelectorAll("input")).forEach(function (el) { el.addEventListener("input", calc); });
    calc();
  }

  /* ---------- widget: .htaccess & fast_memo readiness inspector ---------- */
  var hi = doc.getElementById("htaccess-inspector");
  if (hi && !hi.dataset.hjBound) {
    hi.dataset.hjBound = "1";
    var hta = hi.querySelector("textarea[name=rules]"),
        hout = hi.querySelector(".widget__out"),
        hchips = Array.prototype.slice.call(hi.querySelectorAll("[data-preset]"));
    var PRESETS = {
      xf: 'RewriteEngine On\nSetEnvIfNoCase User-Agent "SemrushBot|AhrefsBot|MJ12bot" bad_bot=1\nRewriteCond %{ENV:bad_bot} =1\nRewriteRule ^ - [F,L]\n\nHeader always set Access-Control-Allow-Origin "https://windowsforum.com" env=CORS_OK\nRewriteCond %{HTTP:Origin} ^https://(www\\.)?windowsforum\\.com$ [NC]\nRewriteRule ^ - [E=CORS_OK:1]\n\nRewriteCond %{REQUEST_FILENAME} -f [OR]\nRewriteCond %{REQUEST_FILENAME} -d\nRewriteRule ^ - [L]\nRewriteRule ^ index.php [L]',
      cookie: 'RewriteEngine On\n# Reading %{HTTP_COOKIE} or %{REMOTE_ADDR} blocks on-core fast_memo:\nRewriteCond %{HTTP_COOKIE} (?:^|;\\s*)xf_user=([^;]+)\nRewriteRule ^cached-landing\\.html$ /member-landing.php?u=%1 [L]\n\n# Backreference \\1 in pattern uses fancy-regex instead of linear DFA:\nRewriteCond %{QUERY_STRING} ^(\\w+)=\\1$\nRewriteRule ^echo$ /same.php [L]',
      ip: 'Order Allow,Deny\nAllow from 10.0.0.0/8\nDeny from env=block_country\n\n# Ignored Apache header mutations (flagged by check --strict):\nRequestHeader set X-Forwarded-Proto "https"\nHeader edit Set-Cookie ^(.*)$ $1;HttpOnly;Secure\n\nCacheLookup on'
    };
    function escHt(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    function analyzeHtaccess() {
      var raw = (hta ? hta.value : "") || "";
      var lines = raw.split(/\r?\n/);
      var blockers = [], vary = {}, uaClassify = false, linearRules = 0, fancyRules = 0, conds = 0, cacheDirs = [], ignoredDirs = [], authDirs = 0;
      lines.forEach(function (line, idx) {
        var s = line.trim();
        if (!s || s.charAt(0) === "#") return;
        var ln = "L" + (idx + 1);
        /* check MemoClass blockers */
        if (/%\{(?:HTTP_COOKIE|REMOTE_ADDR|REMOTE_PORT|SERVER_ADDR|TIME[^}]*|LA-[UF]:[^}]*)\}/i.test(s)) {
          var mVar = s.match(/%\{(?:HTTP_COOKIE|REMOTE_ADDR|REMOTE_PORT|SERVER_ADDR|TIME[^}]*|LA-[UF]:[^}]*)\}/i);
          blockers.push(ln + ": rewrite input " + mVar[0]);
        }
        if (/^SetEnvIf(?:NoCase)?\s+(?:Remote_Addr|Server_Addr|Request_Protocol|Cookie)\b/i.test(s)) {
          blockers.push(ln + ": SetEnvIf on non-memoizable attribute (" + s.split(/\s+/)[1] + ")");
        }
        if (/^(?:Allow|Deny)\s+from\s+(?!all\b)(\S+)/i.test(s)) {
          var op = RegExp.$1;
          blockers.push(ln + ": IP/env/host access operand (" + s.split(/\s+/)[0] + " from " + op + ")");
        }
        if (/REDIRECT_STATUS/i.test(s)) {
          blockers.push(ln + ": reads REDIRECT_STATUS");
        }
        if (/^Require\s+(?!all\s+granted\b)/i.test(s)) {
          authDirs++;
        }
        /* check VARY-SET headers */
        if (/%\{HTTP_USER_AGENT\}|%\{HTTP:User-Agent\}|^SetEnvIf(?:NoCase)?\s+User-Agent\b/i.test(s)) {
          vary["User-Agent"] = "UA-cond bitmap (--rewrite-ua-classify) or raw User-Agent";
          uaClassify = true;
        }
        var hMatch = s.match(/%\{HTTP:([A-Za-z0-9-]+)\}/g);
        if (hMatch) {
          hMatch.forEach(function (hm) {
            var hName = hm.replace(/^%\{HTTP:|\}$/g, "");
            if (/^cookie$/i.test(hName)) blockers.push(ln + ": rewrite input %{HTTP:Cookie}");
            else if (!/^user-agent$/i.test(hName)) vary[hName] = "raw header";
          });
        }
        if (/%\{HTTP_REFERER\}/i.test(s)) vary["Referer"] = "raw header";
        if (/%\{HTTP_ACCEPT\}/i.test(s)) vary["Accept"] = "raw header";
        var sei = s.match(/^SetEnvIf(?:NoCase)?\s+([A-Za-z0-9_-]+)\s+/i);
        if (sei) {
          var attr = sei[1];
          if (!/^(?:Request_URI|Request_Method|Request_Protocol|Remote_Addr|Server_Addr|User-Agent|Cookie)$/i.test(attr)) {
            vary[attr] = "raw header (SetEnvIf)";
          }
        }
        /* regex engine classification */
        if (/^RewriteRule\s+(\S+)/i.test(s)) {
          var pat = RegExp.$1;
          if (/\\[1-9]|\(\?[=!<]/.test(pat)) fancyRules++;
          else linearRules++;
          if (/\[[^\]]*\bE=no-cache:1\b/i.test(s)) cacheDirs.push(ln + " [E=no-cache:1]");
        } else if (/^RewriteCond\s+\S+\s+(\S+)/i.test(s)) {
          conds++;
          var cpat = RegExp.$1;
          if (/\\[1-9]|\(\?[=!<]/.test(cpat)) fancyRules++;
        }
        /* LSCache & unsupported directives */
        if (/^(?:CacheLookup|CacheEnable|CacheDisable|CacheKeyModify)\b/i.test(s)) {
          cacheDirs.push(ln + " " + s.split(/\s+/).slice(0, 2).join(" "));
        }
        if (/^(?:RequestHeader\b|Header\s+(?:edit\*?|note)\b|FileETag\b|H2EarlyHints\b|AddOutputFilterByType\b)/i.test(s)) {
          ignoredDirs.push(ln + " (" + s.split(/\s+/).slice(0, 2).join(" ") + ")");
        }
      });
      var out = [];
      if (blockers.length === 0) {
        var vkeys = Object.keys(vary);
        out.push('fast_memo verdict : <span class="good">ELIGIBLE</span> — static 200 GETs memoize on-core (1 s TTL, 64 MiB/worker)');
        out.push('memo VARY-SET     : <b>' + (vkeys.length ? escHt(vkeys.join(", ")) : "none (URI + Host + Accept-Encoding only)") + '</b>' + (uaClassify ? " · UA-cond bitmap eligible" : ""));
      } else {
        out.push('fast_memo verdict : <span class="bad">INELIGIBLE</span> (fail-closed parse-time MemoClass)');
        out.push('blocking lines    : <span class="warn">' + escHt(blockers.join(" · ")) + '</span>');
      }
      out.push('rewrite rules     : <b>' + (linearRules + fancyRules) + '</b> rules (' + conds + ' RewriteConds) → <b>' + linearRules + '</b> linear dense-DFA/meta · ' + (fancyRules ? '<span class="warn">' + fancyRules + ' fancy-regex (backref/lookaround)</span>' : '<span class="good">0 backtracking</span>'));
      if (cacheDirs.length) out.push('LSCache hooks     : <b>' + escHt(cacheDirs.join(", ")) + '</b>');
      if (authDirs > 0) out.push('access / auth     : <b>' + authDirs + ' Require policy</b> (enforced before cache lookup; authenticated static gets private, no-store)');
      if (ignoredDirs.length) out.push('compatibility     : <span class="warn">ignored by httpjet: ' + escHt(ignoredDirs.join(", ")) + '</span> (flagged in check --strict)');
      else out.push('compatibility     : <span class="good">all parsed directives supported</span>');
      hout.innerHTML = out.join("\n");
    }
    if (hta) hta.addEventListener("input", function () {
      hchips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      analyzeHtaccess();
    });
    hchips.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-preset");
        if (hta && PRESETS[k]) hta.value = PRESETS[k];
        hchips.forEach(function (c) { c.setAttribute("aria-pressed", c === btn ? "true" : "false"); });
        analyzeHtaccess();
      });
    });
    analyzeHtaccess();
  }

  /* ---------- interactive build-by-build performance explorer ---------- */
  var bexp = doc.getElementById("build-explorer");
  if (bexp && !bexp.dataset.hjBound) {
    bexp.dataset.hjBound = "1";
    var BUILDS = [
      {
        id: "b01", tag: "0.0.1", short: "Baseline", date: "2026-06-01", commit: "dcf4ca1e", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "loopback A/B · release build vs live LSWS 6.3.5",
        title: "0.0.1 — Phase 1–7 Clean-Room Baseline",
        summary: "First full-stack release build benchmarked head-to-head against commercial LiteSpeed Web Server 6.3.5 on the same x86_64 host and XML configuration.",
        kpis: [
          { v: "135.4k rps", d: "0.74× vs LSWS (182.7k)", n: true, l: "Light .htaccess H1 (c=100)" },
          { v: "95.8k rps", d: "0.60× vs LSWS (160.9k)", n: true, l: "477-line .htaccess H1 (c=100)" },
          { v: "~128k rps", d: "0.58× vs LSWS (220.5k)", n: true, l: "H2 1 KB static (c=50)" },
          { v: "11 / 11", d: "byte-identical parity", n: false, l: "ETag, LSAPI, .htaccess & rewrite flags" }
        ],
        chart: {
          title: "0.0.1 Baseline vs Commercial LiteSpeed 6.3.5",
          sub: "loopback A/B · 2026-06-01 · ab -k -n 30000 -c 100 / h2load c=50 · k req/s",
          unit: "k rps",
          series: ["httpjet 0.0.1", "LiteSpeed 6.3.5"],
          rows: [
            ["Light .htaccess H1 (/robots.txt)", [135.4, 182.7]],
            ["Heavy 477-line .htaccess H1", [95.8, 160.9]],
            ["H2 static 1 KB (c=50)", [128.0, 220.5]],
            ["PHP/LSAPI H1 (c=40)", [31.0, 38.5]]
          ],
          foot: "Source: RESULTS.md Phase 7 baseline & scripts/bench-results/litespeed-*-run1.csv"
        },
        notes: [
          "Functional parity was complete across all 7 phases, but every request rebuilt RewriteInput, ran un-prefiltered regex rules, and called statx on every .htaccess directory.",
          "Identified three primary gaps: per-request filesystem statx syscalls, regex engine contention, and default glibc allocator overhead."
        ]
      },
      {
        id: "b02", tag: "Tier A", short: "StatCache + DFA", date: "2026-06-04", commit: "2e1db15", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "loopback A/B · interleaved vs LSWS 6.3.5",
        title: "Tier A — StatCache, FileCache TTL & RegexSet Prefilter",
        summary: "Coalesced per-request filesystem metadata probes behind a 1-second TTL and introduced a dense RegexSet DFA prefilter so non-matching RewriteRules never run captures.",
        kpis: [
          { v: "0.63–0.70×", d: "up from 0.46× on heavy chain", n: false, l: "windowsforum /robots.txt vs LSWS" },
          { v: "0.90–0.99×", d: "parity on 66 KB asset", n: false, l: "og-image.png static serving vs LSWS" },
          { v: "1 s TTL", d: "statx coalesced", n: false, l: ".htaccess, FileCache & StatCache (-f/-d)" }
        ],
        chart: {
          title: "Tier A Relative Ratio vs LiteSpeed (×100%)",
          sub: "loopback A/B · 2026-06-04 · % of LiteSpeed 6.3.5 throughput",
          unit: "% of LSWS",
          series: ["Pre-Tier A", "Tier A (StatCache + DFA)"],
          rows: [
            ["Heavy .htaccess /robots.txt (median)", [46, 63]],
            ["Heavy .htaccess /robots.txt (peak)", [52, 70]],
            ["66 KB static image (og-image.png)", [78, 99]]
          ],
          foot: "Source: RESULTS.md Tier A campaign (A1 build-once RewriteInput + A2 rule-less skip + A3 1s statx TTL)"
        },
        notes: [
          "A1 built RewriteInput once per chain instead of per rule; A2 bypassed the engine on rule-less vhosts.",
          "A3 added a 1 s TTL to .htaccess statx checks and RewriteCond -f/-d StatCache (32,768 soft cap), bringing 66 KB static files to parity with LiteSpeed."
        ]
      },
      {
        id: "b03", tag: "Batches 1–5", short: "Micro-Opts + Zstd", date: "2026-06-06", commit: "2d80a25", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "same-session loopback A/B (prod live, ±10% noise floor)",
        title: "Batches 1–5 — Multi-Codec Egress, OR-Folding & Lazy Headers",
        summary: "Five source-level micro-optimization batches: lazy header map access, Cow CGI env keys, literal-prefix rule filtering, zstd > br > gzip negotiation, and OR-condition regex folding.",
        kpis: [
          { v: "31.3k rps", d: "+1% vs 31.0k (c=40)", n: true, l: "PHP/LSAPI H1 throughput" },
          { v: "28 → 1", d: "regex evals per bot block", n: false, l: "OR-condition regex folding" },
          { v: "78.6k rps", d: "vs 72.3k old (within noise)", n: true, l: "Heavy .htaccess H1 A/B" }
        ],
        chart: {
          title: "Batches 1–5 Same-Session Loopback A/B (2d80a25 vs 8c74fe4)",
          sub: "loopback ab -k -n 30000 -c 100 · 2026-06-06 · k req/s",
          unit: "k rps",
          series: ["Pre-opts (8c74fe4)", "Batches 1–5 (2d80a25)"],
          rows: [
            ["windowsforum (heavy, uncacheable)", [72.3, 78.6]],
            ["moontimenow (heavy, cacheable)", [83.0, 85.1]],
            ["mcp (light static)", [87.6, 88.8]],
            ["PHP/LSAPI H1 (c=40)", [31.0, 31.3]]
          ],
          foot: "Source: RESULTS.md Batches 1–5 — proved remaining gap was allocator + codegen fixed cost, not regex eval"
        },
        notes: [
          "Honest negative/neutral throughput result: once the DFA prefilter was in place, 302-rule evaluation was no longer the bottleneck.",
          "Proved that the remaining deficit was per-request fixed cost (glibc malloc contention and generic x86-64-v1 codegen), directly motivating Batch 6."
        ]
      },
      {
        id: "b04", tag: "Batch 6", short: "PGO + mimalloc", date: "2026-06-07", commit: "5091dfc", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "controlled same-session loopback A/B · exact-PID isolation",
        title: "Batch 6 — Codegen Tier: Native ISA, mimalloc & PGO",
        summary: "Switched global allocator to mimalloc, enabled -C target-cpu=native (AVX-512 on x86_64, Neoverse-N1 on ARM64), and built with 3-step Profile-Guided Optimization (scripts/build-pgo.sh).",
        kpis: [
          { v: "84.3k rps", d: "+11.8% vs baseline (75.4k)", n: false, l: "Heavy .htaccess H1 (matches LSWS 84.3k)" },
          { v: "93.0k rps", d: "+5.2% vs baseline (88.3k)", n: false, l: "Light static H1 (/robots.txt)" },
          { v: "mimalloc", d: "per-thread heaps", n: false, l: "Eliminated glibc arena mutex contention" }
        ],
        chart: {
          title: "Batch 6 Codegen Tier A/B (5091dfc vs 8c74fe4) + LiteSpeed Reference",
          sub: "loopback ab -k -n 30000 -c 100 · 2026-06-07 · k req/s",
          unit: "k rps",
          series: ["Baseline (8c74fe4)", "Codegen Tier (5091dfc)", "LiteSpeed 6.3.5"],
          rows: [
            ["windowsforum (heavy .htaccess H1)", [75.4, 84.3, 84.3]],
            ["mcp (light static H1)", [88.3, 93.0, 87.8]]
          ],
          foot: "Source: RESULTS.md Batch 6 — first above-noise raw-serving win, closing the H1 rewrite gap with LiteSpeed"
        },
        notes: [
          "Heavy .htaccess gained +11.8% because its allocation-heavy per-request fixed cost was directly reduced by mimalloc thread-local heaps and PGO branch layout.",
          "Established the rule: a non-PGO build is not a valid benchmark (~10% layout delta alone)."
        ]
      },
      {
        id: "b05", tag: "LSCache + H2 Fix", short: "Single-Flight & Cache", date: "2026-06-07", commit: "dc38d640", era: 1, eraName: "Cache & Transport Breakthroughs",
        regime: "loopback PGO suite · scripts/bench-report.py",
        title: "Single-Flight Wakeup Fix, H2 Work-Stealing & Origin Page Cache",
        summary: "Fixed a single-flight follower lost-wakeup that serialized concurrent misses, added H2 single-connection stream fan-out across idle cores, cached open_beneath resolution (1s TTL), and shipped hj-pagecache.",
        kpis: [
          { v: "19,912 rps", d: "101× vs uncached PHP (196 rps)", n: false, l: "152 KB forum homepage cache HIT (p50 2ms)" },
          { v: "165.9k rps", d: "up from 2,939 rps (56×)", n: false, l: "Heavy .htaccess H2 at c=50" },
          { v: "250.8k rps", d: "ahead of LSWS (220.5k)", n: false, l: "H2 1 KB static at c=50 (PGO retrained)" },
          { v: "44.8k rps", d: "ahead of LSWS (38.5k at c=40)", n: false, l: "PHP/LSAPI H1 hello-world" }
        ],
        chart: {
          title: "Post-Fix PGO Build vs Commercial LiteSpeed 6.3.5",
          sub: "loopback HTTPS PGO · 2026-06-07 · k req/s",
          unit: "k rps",
          series: ["httpjet (PGO 2026-06-07)", "LiteSpeed 6.3.5"],
          rows: [
            ["H2 static empty (c=50)", [266.9, 244.5]],
            ["H2 static 1 KB (c=50)", [250.8, 220.5]],
            ["H2 light rewrite (/robots.txt, c=100)", [230.3, 193.7]],
            ["H2 heavy rewrite (/robots.txt, c=100)", [161.0, 206.8]],
            ["H1 static 1 KB (c=50)", [94.7, 82.4]],
            ["H1 heavy rewrite (/robots.txt, c=100)", [87.3, 84.3]],
            ["PHP/LSAPI GET H1 (c=40)", [44.8, 38.5]]
          ],
          foot: "Source: scripts/bench-results/httpjet-sweep-fixed.csv, httpjet-rewrite-fixed.csv, httpjet-php-fixed.csv"
        },
        notes: [
          "Registering followers on the single-flight leader's Notify before pre-wait lookup eliminated 10s tail stalls on uncacheable misses (H1 c=50 jumped 298 → 72,371 RPS; H2 jumped 2,939 → 165,939 RPS).",
          "H2 single-connection fan-out (spawning stream handlers when live connections < workers) lifted 1-conn 64-stream heavy rewrite from 52.5k → 116k RPS (2.2×, 0.97 → 4.42 cores).",
          "1s open_beneath serve cache dropped openat syscalls from 20,000 → 0 per window (+12% static, +11% heavy rewrite)."
        ]
      },
      {
        id: "b06", tag: "io_uring", short: "monoio Transport", date: "2026-06-21", commit: "30b7fda", era: 1, eraName: "Cache & Transport Breakthroughs",
        regime: "loopback transport A/B · monoio io_uring vs tokio/epoll",
        title: "Unconditional Pure-io_uring (monoio) Transport",
        summary: "Replaced the tokio/epoll TCP and tokio/quinn UDP adapters with a thread-per-core monoio io_uring transport across H1, native H2, and QUIC/H3, plus an on-core static/cache fast path.",
        kpis: [
          { v: "+19%", d: "vs tokio/epoll H1", n: false, l: "HTTP/1.1 throughput gain" },
          { v: "+22%", d: "vs tokio/epoll H2", n: false, l: "HTTP/2 (h2c / TLS) throughput gain" },
          { v: "+14–20%", d: "vs tokio/quinn H3", n: false, l: "HTTP/3 over io_uring UDP gain" },
          { v: "0 syscalls", d: "on-core fast path", n: false, l: "Hot-tier cache & memo serves stay on core" }
        ],
        chart: {
          title: "Pure io_uring (monoio) Transport Relative Gain over Tokio/Epoll",
          sub: "loopback smoke A/B · 2026-06-21 · relative throughput index (tokio = 100%)",
          unit: "% index",
          series: ["tokio / epoll + quinn", "monoio io_uring"],
          rows: [
            ["HTTP/1.1 keep-alive", [100, 119]],
            ["HTTP/2 multiplexed", [100, 122]],
            ["HTTP/3 over QUIC (UDP)", [100, 117]]
          ],
          foot: "Source: CLAUDE.md / RESULTS.md 2026-06-21 transport cutover; vendored monoio-rustls adds real vectored writev"
        },
        notes: [
          "Each worker pins one monoio io_uring runtime per SO_REUSEPORT listener fd; cheap work (H1 codec, native hj-h2, QUIC driver, fast-path memo, static files, and page-cache hits) never crosses threads.",
          "Vendored monoio-rustls fork added real vectored writev so all queued TLS records flush in a single socket write."
        ]
      },
      {
        id: "b07", tag: "v0.0.1", short: "3-Way + Fast Memo", date: "2026-08-28", commit: "456711f5", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "dedicated-host PGO 3-way (quiet box) + live prod telemetry",
        title: "v0.0.1 — Dedicated 3-Way vs OLS/nginx, Fast-Path Memo & Prod Telemetry",
        summary: "Added the default-on per-worker finished-response memo (fast_memo, 1s TTL, header/UA vary-set) and ran an uncontended dedicated-host 3-way benchmark against OpenLiteSpeed and nginx.",
        kpis: [
          { v: "937.0k rps", d: "vs OLS 687.2k (+36%)", n: false, l: "H2 empty static at c=200 (907.7k at c=50)" },
          { v: "298.0k rps", d: "vs OLS 283.3k / nginx 125.4k", n: false, l: "806-line .htaccess H2 (c=100, PGO)" },
          { v: "+81% H2", d: "137k → 248k rps (+43% H1)", n: false, l: "Fast-path memo A/B on forum chain" },
          { v: "0.2% CPU", d: "138 µs/req · 1.55 IPC", n: false, l: "httpjet share of 9.99 ms prod latency" }
        ],
        chart: {
          title: "Dedicated-Host 3-Way PGO: httpjet vs OpenLiteSpeed vs nginx",
          sub: "quiet dedicated host · 2026-08-27..28 · k req/s",
          unit: "k rps",
          series: ["httpjet v0.0.1", "OpenLiteSpeed", "nginx"],
          rows: [
            ["H2 static empty (c=50)", [907.7, 792.8, null]],
            ["H2 static empty (c=200)", [937.0, 687.2, null]],
            ["H2 static 1 KB (c=200)", [803.9, 790.5, null]],
            ["H2 heavy 806-line .htaccess (c=100)", [298.0, 283.3, 125.4]],
            ["H1 heavy 806-line .htaccess (c=100)", [168.7, 169.1, 145.6]],
            ["H1 static empty (c=1000)", [202.1, 183.4, null]]
          ],
          foot: "Source: bench-results/versus5-dedicated-final-20260827.csv & compare-rewrite-memo-vary-pgo.csv"
        },
        notes: [
          "Fast-path memo (per-worker, 1s TTL, 64 MiB/worker) caches finished 200 responses keyed by listener, scheme, vhost, URI, Accept-Encoding, and the parse-time .htaccess header/UA vary-set (+43% H1, +81% H2, verified byte-identical across 192 parity cells).",
          "Live production telemetry (2026-08-30): mean request 9.99 ms = 8.96 ms LSAPI PHP TTFB (89.7%) + 1.03 ms everything else (httpjet CPU ~138 µs/req, cache hit ~38 µs, rewrite 5.4 µs, cache lookup 3.2 µs)."
        ]
      },
      {
        id: "b08", tag: "v0.0.2", short: "sendfile & kTLS", date: "2026-09-23", commit: "f987d7cd", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "loopback 1 MiB egress receipts (c=50) + per-vhost dict tuning",
        title: "v0.0.2 — Nonblocking sendfile(2), Hardware-Gated kTLS & Dict L6",
        summary: "Shipped bounded nonblocking sendfile(2) for plain H1 and hardware-offload-gated kernel TLS (--ktls=auto) for TLS 1.3 H1, plus per-vhost zstd dictionary level tuning (windowsforum.com=6).",
        kpis: [
          { v: "4,852.5 rps", d: "38.8 Gbps · 10.08 ms mean", n: false, l: "1 MiB plaintext H1 sendfile (c=50)" },
          { v: "2,999.7 rps", d: "vs 2,944.9 forced sw-kTLS", n: false, l: "1 MiB TLS 1.3 H1 rustls (--ktls=off)" },
          { v: "−50% CPU", d: "for +4% tmpfs footprint", n: false, l: "windowsforum.com=6 dict zstd level" }
        ],
        chart: {
          title: "1 MiB File Egress Receipts at c=50 (5,000 requests)",
          sub: "loopback · 2026-09-09 · req/s",
          unit: "rps",
          series: ["httpjet v0.0.2"],
          rows: [
            ["Plaintext H1 sendfile(2)", [4852.5]],
            ["TLS 1.3 H1 rustls (kTLS off)", [2999.7]],
            ["TLS 1.3 H1 software kTLS (virtual GVE NIC)", [2944.9]]
          ],
          foot: "Source: bench-results/httpjet-sendfile-sendfile-release.csv & httpjet-ktls-sendfile-*-20260909.csv"
        },
        notes: [
          "--ktls=auto inspects ethtool tls-hw-tx-offload on the default route NIC and refuses virtual NICs (such as GCE gve) because software kTLS adds per-record kernel transitions without saving AEAD work.",
          "Lowering windowsforum.com internal dictionary zstd level from 12 to 6 halved background encode CPU while adding only +4% page-rounded tmpfs footprint."
        ]
      },
      {
        id: "b09", tag: "v0.0.3", short: "openat2 + H3 PGO", date: "2026-09-27", commit: "6e36d652", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "6-pair ABBA loopback PGO A/B (H2 warm/nodict + H3 20k req)",
        title: "v0.0.3 — Rooted openat2 File-Tier Opens & HTTP/3 QPACK PGO",
        summary: "Replaced multi-step hot file-tier opens with rooted openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS) and expanded PGO training to drive HTTP/3 QPACK dynamic-table paths.",
        kpis: [
          { v: "28.7k rps", d: "+0.64% ABBA · p50 0.43 ms", n: false, l: "HTTP/3 QUIC cache-hit (20k req)" },
          { v: "+11.7%", d: "/help/cookies/ no-dict A/B", n: false, l: "H2 file-tier cold/no-dict serve" },
          { v: "+4.46%", d: "/help/smilies/ warm dict A/B", n: false, l: "H2 warm dict-backed cache hit" }
        ],
        chart: {
          title: "v0.0.3 vs v0.0.2 Interleaved ABBA Pairs",
          sub: "loopback PGO · 2026-09-27 · req/s",
          unit: "k rps",
          series: ["v0.0.2 (previous)", "v0.0.3 (openat2 + H3 PGO)"],
          rows: [
            ["H3 QUIC static/cache (peak pair)", [26.9, 28.7]],
            ["H2 warm dict /help/cookies/ (pair 5)", [13.1, 13.5]],
            ["H2 warm dict /help/smilies/ (pair 5)", [6.6, 8.0]]
          ],
          foot: "Source: bench-results/httpjet-0.0.3-vs-previous-h2-warm-20260927.csv & -h3-20260927.csv"
        },
        notes: [
          "Hot file-tier opens now issue a single rooted openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS) syscall against the pinned store directory fd.",
          "HJPC v3 container format bumped to reject pre-#539 symlinked cache artifacts once at boot."
        ]
      },
      {
        id: "b10", tag: "v0.0.9", short: "CPU & PMU Campaign", date: "2026-10-18", commit: "d4a4e333", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PMU hardware counters (x86 + ARM64) + live prod telemetry",
        title: "v0.0.9 — Early Bridge, .htaccess Access Memo & Idle Ticker Parking",
        summary: "Six targeted CPU reductions (#958–#964): parked idle access-log tickers, skipped /proc/self/fd readlink when openat2 proves no symlinks, bypassed fast-path double lookup on cookied PHP routes, and memoized per-file .htaccess access-rule matches.",
        kpis: [
          { v: "−54..63%", d: "TLS-core wakes 32/s → 0", n: false, l: "Idle process CPU reduction" },
          { v: "13.0% → 2.7%", d: "−79% share of process CPU", n: false, l: "access_decision_for_request CPU" },
          { v: "−30% / −44%", d: "cookied guest / PHP TLS CPU", n: false, l: "Early bridge + access memo (x86)" },
          { v: "−18% instr", d: "ARM64 PMU instructions/req", n: false, l: "Voidrune PHP path (−11% guest, −8.5% hit)" }
        ],
        chart: {
          title: "v0.0.9 Relative CPU & PMU Instruction Reductions vs v0.0.8",
          sub: "x86_64 CPU/req & ARM64 (voidrune) PMU instructions/req · 2026-10-18 · % of v0.0.8 (lower is better)",
          unit: "% of v0.0.8",
          series: ["v0.0.8 baseline (100%)", "v0.0.9 (#958–#964)"],
          rows: [
            ["x86 TLS PHP request CPU/req", [100, 56]],
            ["x86 TLS cookied guest page CPU/req", [100, 70]],
            ["x86 idle process CPU", [100, 41]],
            ["ARM64 PMU instructions/req (W2 PHP)", [100, 82]],
            ["ARM64 PMU instructions/req (W6 cookied)", [100, 89]],
            ["ARM64 PMU instructions/req (W1 cache hit)", [100, 91.5]]
          ],
          foot: "Source: RESULTS.md 2026-10-18 v0.0.9 campaign; live x86 prod CPU/req dropped 970 µs → 921 µs at 24.5 rps"
        },
        notes: [
          "Cookied front-controller requests previously ran the on-core static fast path (missing on /threads/*) and then re-ran resolution after bridging to tokio; early-bridging them cut cookied guest CPU by 14.5% (30% over TLS).",
          "Per-file .htaccess access-rule match memo (#963) dropped access_decision_for_request from 13.0% to 2.7% of process CPU."
        ]
      },
      {
        id: "b11", tag: "v0.0.10", short: "TLS Idle + Dict L3", date: "2026-10-18", commit: "f73fcedf", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "live production x86_64 + ARM64 (voidrune) metrics & tokio CPU",
        title: "v0.0.10 — Certified-Peer TLS Idle Window & ARM64 Dict Level 3",
        summary: "Extended the idle timeout to 1800s for mTLS-verified Cloudflare peers (--trusted-proxy-idle-secs), disabled unused TLS 1.3 post-handshake tickets (--tls-session-tickets 0), and tuned ARM64 dictionary zstd level to 3.",
        kpis: [
          { v: "−78%", d: "0.77 → 0.169 handshakes/req", n: false, l: "ARM64 full TLS handshakes (voidrune)" },
          { v: "−28%", d: "0.052 → 0.0365 (idle closes → 0)", n: false, l: "x86_64 full TLS handshakes" },
          { v: "5.3× faster", d: "3.53 ms → 0.66 ms/page", n: false, l: "moontimenow.com dict zstd L3 encode" },
          { v: "50% → 11%", d: "of voidrune tokio CPU", n: false, l: "Background dictionary recompress share" }
        ],
        chart: {
          title: "v0.0.10 Dictionary Encode Time & TLS Handshake Rate",
          sub: "live production x86_64 & ARM64 · 2026-10-18 · relative % of pre-tuning cost (lower is better)",
          unit: "% cost",
          series: ["Pre-v0.0.10 (100%)", "v0.0.10 tuned"],
          rows: [
            ["moontimenow.com dict encode (3.53 → 0.66 ms)", [100, 18.7]],
            ["thisdayinhistory.ai dict encode (2.11 → 0.41 ms)", [100, 19.4]],
            ["ARM64 full TLS handshakes/req (0.77 → 0.169)", [100, 21.9]],
            ["x86_64 full TLS handshakes/req (0.052 → 0.0365)", [100, 70.2]]
          ],
          foot: "Source: CLAUDE.md / RESULTS.md #486, #489, #967 — zero tmpfs 4 KiB page footprint change on ARM64"
        },
        notes: [
          "Cloudflare never resumes TLS sessions to origins (resumed_total = 0), so closing an idle origin connection after 90s forced a full ECDHE+mTLS handshake; --trusted-proxy-idle-secs 1800 eliminated idle closes.",
          "Setting --tls-session-tickets 0 saved two post-handshake records and ~5% server CPU per handshake."
        ]
      },
      {
        id: "b12", tag: "v0.1.2–0.1.3", short: "Task & LSAPI Pools", date: "2026-10-24", commit: "2f259201", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PGO ABBA on x86_64 & ARM64 · perf stat minor-faults & CPU/req",
        title: "v0.1.2 & v0.1.3 — Recycled Task Boxes, LSAPI Pools & Zstd-Only Refresh",
        summary: "Under MIMALLOC_PURGE_DELAY=0 (the #295 swap fix), freed mimalloc pages return to the OS immediately and fault back in on the next request. v0.1.2 pooled H2 stream futures, bridge futures, LSAPI buffers, and codec scratch; v0.1.3 skipped quality-9 brotli on internal refreshes under --cf-send-zstd.",
        kpis: [
          { v: "0.80 → 0.0005", d: "−99.9% faults · −22..32% CPU", n: false, l: "W3s1 H2 static 1 KiB minor faults/req" },
          { v: "1.61 → 0.05", d: "−97% faults · −19..25% CPU", n: false, l: "W3rh2 H2 heavy .htaccess faults/req" },
          { v: "0.41 → 0.001", d: "−99.7% faults · −6% CPU", n: false, l: "W1 H2 page-cache hit faults/req" },
          { v: "−8k faults", d: "& −10 ms per refreshed page", n: false, l: "v0.1.3 zstd-only background refresh" }
        ],
        chart: {
          title: "v0.1.2 Minor Page Faults per 1,000 Requests (v0.1.1 vs v0.1.2)",
          sub: "PGO loopback under MIMALLOC_PURGE_DELAY=0 · 2026-10-24 · minor faults per 1,000 req (lower is better)",
          unit: "faults/1k req",
          series: ["v0.1.1 (unpooled)", "v0.1.2 (Recycled + LSAPI pools)"],
          rows: [
            ["W3rh2 H2 heavy .htaccess (1,610 → 50)", [1610, 50]],
            ["W3s64 H2 static 64 KiB (1,600 → 26)", [1600, 26]],
            ["W3s1 H2 static 1 KiB (800 → 0.5)", [800, 0.5]],
            ["W1 H2 page-cache hit (410 → 1)", [410, 1]],
            ["W2 H2 uncached PHP (250 → 1)", [250, 1]],
            ["W6 H2 cookied hit (190 → 5)", [190, 5]]
          ],
          foot: "Source: PR #1157 (v0.1.2) & commit 0c10fdc4 (v0.1.3)"
        },
        notes: [
          "hj_core::recycle::Recycled<T> pools H2 stream task allocations and uring::bridge task slots per thread so stream teardown never releases pages to the OS.",
          "v0.1.3 eliminated the 60,000-fault bursts every 10 minutes caused by background cache refreshes running quality-9 brotli 16 MiB ring allocations when --cf-send-zstd only ever serves zstd."
        ]
      },
      {
        id: "b13", tag: "v0.1.5", short: "BODY_BUFS Zero-Fault", date: "2026-10-24", commit: "16ed92f9", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PGO ABBA on x86_64 & ARM64 · 3,019 workspace tests green",
        title: "v0.1.5 — BODY_BUFS TieredPool, Zero-Copy LSAPI & MAP_POPULATE",
        summary: "Completed the zero-fault campaign (#1163): BODY_BUFS TieredPool<Vec<u8>> (64 KiB/256 KiB/1 MiB) frozen into Bytes via Bytes::from_owner, zero-copy LSAPI PacketReader slices, spawn_blocking variant/dict fills, per-thread PageDict DCtx, MAP_POPULATE tmpfs mmaps, and per-core TLS record size-class retention.",
        kpis: [
          { v: "1.80 → 0.106", d: "−94% minor faults/req", n: false, l: "Streamed 117 KB /login/ over H2" },
          { v: "0.0005", d: "down from 0.0325 in 0.1.4", n: false, l: "W1 H2 page-cache hit faults/req" },
          { v: "0.0002", d: "down from 0.185 in 0.1.4", n: false, l: "W3s1 H2 static 1 KiB faults/req" },
          { v: "125–132 MB", d: "down from 165–195 MB RSS", n: false, l: "500-URL miss→store RSS footprint" }
        ],
        chart: {
          title: "v0.1.5 Minor Page Faults per 1,000 Requests (v0.1.1 → v0.1.4 → v0.1.5)",
          sub: "PGO loopback under MIMALLOC_PURGE_DELAY=0 · 2026-10-24 · minor faults per 1,000 req (lower is better)",
          unit: "faults/1k req",
          series: ["v0.1.1", "v0.1.4", "v0.1.5 (BODY_BUFS + zero-copy)"],
          rows: [
            ["Streamed /login/ 117 KB H2", [1800, 1600, 106]],
            ["W3s1 H2 static 1 KiB", [800, 185, 0.2]],
            ["W1 H2 page-cache hit", [410, 32.5, 0.5]],
            ["Miss→store (500 fresh URLs ×2, per 100 req)", [760, 760, 580]]
          ],
          foot: "Source: PR #1163 (commit 16ed92f9, v0.1.5) — deployed PGO to x86_64 and voidrune (ARM64)"
        },
        notes: [
          "BODY_BUFS.freeze(buf) wraps pooled Vec<u8> buffers in a ref-counted owner via Bytes::from_owner; slicing and cloning stay zero-copy and the underlying capacity returns to the thread-local pool when the last Bytes slice drops.",
          "LSAPI PacketReader::take_body_bytes hands out zero-copy Bytes slices when a response fits the pooled 64 KiB read buffer, eliminating per-chunk heap allocations.",
          "File-tier HJPC mmaps now pass MAP_POPULATE so page tables prefault in one kernel pass instead of per-PTE faults during zstd dictionary decode."
        ]
      }
    ];

    var LENSES = [
      {
        id: "l-rewrite", name: "Heavy .htaccess RPS",
        title: "Heavy .htaccess Static Throughput Across Builds (windowsforum.com/robots.txt)",
        sub: "progression from 0.0.1 baseline through single-flight fix and v0.0.1 fast-path memo · k req/s (higher is better)",
        unit: "k rps",
        series: ["HTTP/1.1", "HTTP/2"],
        rows: [
          ["0.0.1 Baseline (2026-06-01)", [95.8, null]],
          ["Batches 1–5 Micro-Opts (2026-06-06)", [78.6, null]],
          ["Batch 6 Codegen PGO + mimalloc (2026-06-07)", [84.3, null]],
          ["Single-Flight Bug (pre-fix c=50, 2026-06-07)", [0.3, 2.9]],
          ["Post Single-Flight + Serve Memo (2026-06-07)", [87.3, 165.9]],
          ["v0.0.1 Fast-Memo OFF (2026-08-28, c=100)", [107.0, 137.0]],
          ["v0.0.1 Fast-Memo ON (2026-08-28, c=100 PGO)", [168.7, 298.0]],
          ["LiteSpeed 6.3.5 Reference (2026-06-01)", [84.3, 206.8]],
          ["OpenLiteSpeed Reference (2026-08-28, c=100)", [169.1, 283.3]],
          ["nginx Reference (2026-08-28, c=100)", [145.6, 125.4]]
        ],
        foot: "Note: 2026-06-01..07 runs were on shared host; 2026-08-28 3-way was on quiet dedicated host with 806-line chain."
      },
      {
        id: "l-h2", name: "H2 Static RPS",
        title: "HTTP/2 Small-Object Static Throughput Across Builds",
        sub: "1 KB and empty static bodies at c=50..200 · k req/s (higher is better)",
        unit: "k rps",
        series: ["H2 1 KB (c=50)", "H2 empty (c=50)", "H2 empty (c=200)"],
        rows: [
          ["0.0.1 Pre-PGO Retrain (2026-06-01)", [128.0, null, null]],
          ["Post-Fix PGO + Serve Memo (2026-06-07)", [250.8, 266.9, 107.5]],
          ["v0.0.1 Dedicated io_uring + Fast Memo (2026-08-27)", [781.7, 907.7, 937.0]],
          ["LiteSpeed 6.3.5 Reference (2026-06-01)", [220.5, 244.5, 109.6]],
          ["OpenLiteSpeed Reference (2026-08-27)", [749.6, 792.8, 687.2]]
        ],
        foot: "Source: httpjet-sweep-fixed.csv (2026-06-07) and versus5-dedicated-final-20260827.csv (2026-08-27)."
      },
      {
        id: "l-cache", name: "Page Cache & PHP",
        title: "Origin Page Cache Offload & PHP/LSAPI Throughput",
        sub: "loopback PGO · req/s across PHP and cache tiers (higher is better)",
        unit: "k rps",
        series: ["Throughput (k req/s)"],
        rows: [
          ["Full DB-backed XenForo PHP render (196 rps, p50 93ms)", [0.2]],
          ["Origin Page Cache HIT — RAM hot tier (19,912 rps, p50 2ms)", [19.9]],
          ["Origin Page Cache HIT — jetcache tmpfs tier (18,211 rps)", [18.2]],
          ["v0.0.3 HTTP/3 QUIC cache HIT (28,653 rps, p50 0.43ms)", [28.7]],
          ["PHP/LSAPI bench.php H1 — 0.0.1 Baseline (c=40)", [31.0]],
          ["PHP/LSAPI bench.php H1 — Post-Fix PGO (c=40)", [44.8]],
          ["PHP/LSAPI bench.php H1 — LiteSpeed 6.3.5 (c=40)", [38.5]]
        ],
        foot: "Cache hit replaces an 8.96 ms PHP render with a ~38 µs memory/tmpfs serve (101× throughput, 46× lower latency)."
      },
      {
        id: "l-cpu", name: "CPU & Instructions/Req",
        title: "CPU & PMU Instruction Reductions Across the October 2026 Campaign",
        sub: "relative CPU / instruction cost vs v0.0.8 baseline (100% = v0.0.8; lower is better)",
        unit: "% of v0.0.8",
        series: ["v0.0.8 Baseline", "v0.0.9 (#958–#964)", "v0.1.2 (+Recycled Pools)"],
        rows: [
          ["H2 static 1 KiB (W3s1) CPU/req", [100, 96, 68]],
          ["H2 heavy .htaccess (W3rh2) CPU/req", [100, 88, 66]],
          ["TLS cookied guest page (W6) CPU/req", [100, 70, 63]],
          ["TLS uncached PHP (W2) CPU/req", [100, 56, 54.5]],
          ["H2 page-cache hit (W1) CPU/req", [100, 93.5, 88]],
          ["Idle process CPU (ticker parking)", [100, 41, 41]]
        ],
        foot: "Source: RESULTS.md v0.0.9 (#958–#964) and PR #1157 (v0.1.2) PGO A/B measurements."
      },
      {
        id: "l-faults", name: "Minor Page Faults/Req",
        title: "Minor Page Fault Elimination Under MIMALLOC_PURGE_DELAY=0 (v0.1.1 → v0.1.5)",
        sub: "minor page faults per 1,000 requests · PGO loopback (lower is better; 0 = zero-fault steady state)",
        unit: "faults/1k req",
        series: ["v0.1.1 (unpooled)", "v0.1.2 (task+LSAPI pools)", "v0.1.5 (+BODY_BUFS & zero-copy)"],
        rows: [
          ["Streamed 117 KB /login/ over H2", [1800, 1600, 106]],
          ["W3rh2 H2 heavy .htaccess", [1610, 50, 45]],
          ["W3s64 H2 static 64 KiB", [1600, 26, 15]],
          ["W3s1 H2 static 1 KiB", [800, 0.5, 0.2]],
          ["W1 H2 page-cache hit", [410, 1.0, 0.5]],
          ["W2 H2 uncached PHP", [250, 1.0, 0.8]],
          ["W6 H2 cookied cache hit", [190, 5.0, 3.0]]
        ],
        foot: "Source: PR #1157 (v0.1.2) and PR #1163 (v0.1.5) under production MIMALLOC_PURGE_DELAY=0."
      }
    ];

    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function fmtVal(v) {
      if (v === null || v === undefined) return "—";
      if (v >= 1000) return Math.round(v).toLocaleString();
      return String(v);
    }
    function renderSvgChart(cfg) {
      var W = 740, left = 255, right = 85, top = 8, bh = 14, gap = 3, rgap = 14;
      var series = cfg.series, rows = cfg.rows, unit = cfg.unit;
      var n = series.length;
      var raw = 0;
      rows.forEach(function (r) { r[1].forEach(function (v) { if (v !== null && v > raw) raw = v; }); });
      if (raw <= 0) raw = 1;
      var mag = Math.pow(10, Math.floor(Math.log10(raw / 4)));
      var cands = [1, 2, 2.5, 5, 10], step = cands[4] * mag;
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci] * mag * 4 >= raw) { step = cands[ci] * mag; break; }
      }
      var vmax = step * 4 * 1.06;
      var rowh = n * bh + (n - 1) * gap + rgap;
      var H = top + rows.length * rowh + 24;
      var sx = (W - left - right) / vmax;
      var out = [];
      out.push('<div class="chart" style="margin:14px 0 0"><p class="chart__title">' + esc(cfg.title) + '</p><p class="chart__sub">' + esc(cfg.sub) + '</p>');
      out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.title) + '">');
      for (var i = 1; i <= 4; i++) {
        var gx = left + step * i * sx;
        var gv = Number((step * i).toPrecision(6));
        out.push('<line class="grid" x1="' + gx.toFixed(1) + '" y1="' + top + '" x2="' + gx.toFixed(1) + '" y2="' + (H - 20) + '"/>');
        out.push('<text class="lbl" x="' + gx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:10.5px;fill:#8b95ad">' + fmtVal(gv) + ' ' + esc(unit) + '</text>');
      }
      out.push('<line class="axis" x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (H - 20) + '"/>');
      var y = top;
      rows.forEach(function (r) {
        var label = r[0], vs = r[1];
        var cy = y + (n * bh + (n - 1) * gap) / 2;
        out.push('<text class="lbl" x="' + (left - 10) + '" y="' + (cy + 4).toFixed(1) + '" text-anchor="end">' + esc(label) + '</text>');
        for (var si = 0; si < n; si++) {
          var v = vs[si];
          var by = y + si * (bh + gap);
          if (v === null || v === undefined) {
            out.push('<text class="lbl" x="' + (left + 6) + '" y="' + (by + bh - 3) + '" style="fill:#8b95ad;font-size:11px">— not measured in this regime</text>');
            continue;
          }
          var w = Math.max(2, v * sx);
          out.push('<g><rect class="bar s' + (si % 5) + '" x="' + (left + 1) + '" y="' + by + '" width="' + w.toFixed(1) + '" height="' + bh + '"><title>' + esc(series[si]) + ' · ' + esc(label) + ': ' + fmtVal(v) + ' ' + esc(unit) + '</title></rect>');
          out.push('<text class="val" x="' + (left + 1 + w + 6).toFixed(1) + '" y="' + (by + bh - 3) + '">' + fmtVal(v) + '</text></g>');
        }
        y += rowh;
      });
      out.push('</svg>');
      if (n > 1) {
        out.push('<div class="chart__legend">');
        series.forEach(function (s, idx) { out.push('<span class="s' + (idx % 5) + '">' + esc(s) + '</span>'); });
        out.push('</div>');
      }
      if (cfg.foot) out.push('<p class="chart__foot">' + esc(cfg.foot) + '</p>');
      out.push('</div>');
      return out.join("");
    }

    var curIdx = BUILDS.length - 1; /* start on latest build v0.1.5 or allow user to step from 0 */
    curIdx = 0; /* start at slide 1 (0.0.1) so the user can step chronologically through the story */
    var curMode = "deck";
    var curLens = 0;
    var cmpA = 0, cmpB = BUILDS.length - 1;

    var mount = bexp.querySelector(".bexp__interactive");
    var renderExplorer = null;
    if (mount) {
      renderExplorer = function () {
        var h = [];
        h.push('<div class="bexp__top">');
        h.push('<div class="bexp__modes" role="tablist" aria-label="Presentation view mode">');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="deck" aria-selected="' + (curMode === "deck") + '">1 · Build Slide Deck (13)</button>');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="traj" aria-selected="' + (curMode === "traj") + '">2 · Workload Trajectories (5)</button>');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="cmp" aria-selected="' + (curMode === "cmp") + '">3 · Build-vs-Build Diff</button>');
        h.push('</div>');
        if (curMode === "deck") {
          h.push('<div class="bexp__nav">');
          h.push('<button type="button" class="bexp__btn" data-bnav="-1"' + (curIdx === 0 ? " disabled" : "") + '>← Prev</button>');
          h.push('<span class="bexp__pos">Build ' + (curIdx + 1) + ' / ' + BUILDS.length + '</span>');
          h.push('<button type="button" class="bexp__btn" data-bnav="1"' + (curIdx === BUILDS.length - 1 ? " disabled" : "") + '>Next →</button>');
          h.push('</div>');
        }
        h.push('</div>');

        if (curMode === "deck") {
          h.push('<div class="bexp__rail" role="tablist" aria-label="Build timeline">');
          BUILDS.forEach(function (b, idx) {
            h.push('<button type="button" role="tab" class="bexp__pill era-' + b.era + '" data-bidx="' + idx + '" aria-selected="' + (idx === curIdx) + '">');
            h.push('<span class="p-tag"><span class="p-dot"></span>' + esc(b.tag) + '</span>');
            h.push('<span class="p-sub">' + esc(b.short) + ' · ' + esc(b.date.slice(5)) + '</span>');
            h.push('</button>');
          });
          h.push('</div>');

          var b = BUILDS[curIdx];
          h.push('<div class="bexp__slide">');
          h.push('<div class="bexp__head">');
          h.push('<h3 class="bexp__title">' + esc(b.title) + '</h3>');
          h.push('<div class="bexp__meta"><span class="badge hj">' + esc(b.eraName) + '</span><span class="badge">' + esc(b.date) + '</span><span class="badge ok">' + esc(b.commit) + '</span></div>');
          h.push('</div>');
          h.push('<p class="bexp__summary">' + esc(b.summary) + '</p>');
          h.push('<div class="bexp__kpis">');
          b.kpis.forEach(function (k) {
            h.push('<div class="bexp__kpi"><div class="bexp__kpi-v">' + esc(k.v) + '</div><span class="bexp__kpi-d' + (k.n ? " neutral" : "") + '">' + esc(k.d) + '</span><div class="bexp__kpi-l">' + esc(k.l) + '</div></div>');
          });
          h.push('</div>');
          h.push(renderSvgChart(b.chart));
          h.push('<ul class="bexp__notes">');
          b.notes.forEach(function (nt) { h.push('<li>' + esc(nt) + '</li>'); });
          h.push('</ul>');
          h.push('<div class="bexp__foot"><span>Regime: ' + esc(b.regime) + '</span><span>Tip: use ← / → arrow keys or click any build pill above</span></div>');
          h.push('</div>');
        } else if (curMode === "traj") {
          h.push('<div class="bexp__lenses" role="toolbar" aria-label="Workload trajectory lenses">');
          LENSES.forEach(function (l, idx) {
            h.push('<button type="button" class="bexp__lens" data-blens="' + idx + '" aria-pressed="' + (idx === curLens) + '">' + esc(l.name) + '</button>');
          });
          h.push('</div>');
          var lens = LENSES[curLens];
          h.push(renderSvgChart(lens));
          h.push('<div class="bexp__foot"><span>Cross-build trajectory lens ' + (curLens + 1) + ' of ' + LENSES.length + '</span><span>Switch lenses above to inspect RPS, cache offload, CPU, or page faults</span></div>');
        } else if (curMode === "cmp") {
          h.push('<div class="bexp__cmp-row">');
          h.push('<label>Baseline Build (A)<select data-bcmp="a">');
          BUILDS.forEach(function (b, idx) {
            h.push('<option value="' + idx + '"' + (idx === cmpA ? " selected" : "") + '>' + esc(b.tag + " — " + b.short + " (" + b.date + ")") + '</option>');
          });
          h.push('</select></label>');
          h.push('<label>Target Build (B)<select data-bcmp="b">');
          BUILDS.forEach(function (b, idx) {
            h.push('<option value="' + idx + '"' + (idx === cmpB ? " selected" : "") + '>' + esc(b.tag + " — " + b.short + " (" + b.date + ")") + '</option>');
          });
          h.push('</select></label>');
          h.push('</div>');
          var ba = BUILDS[cmpA], bb = BUILDS[cmpB];
          h.push('<div class="two" style="margin:10px 0 14px">');
          h.push('<div><h4>A · ' + esc(ba.title) + '</h4><p class="mini" style="margin:0 0 8px">' + esc(ba.date + " · " + ba.commit + " · " + ba.regime) + '</p><p style="font-size:13.5px;margin:0">' + esc(ba.summary) + '</p></div>');
          h.push('<div><h4>B · ' + esc(bb.title) + '</h4><p class="mini" style="margin:0 0 8px">' + esc(bb.date + " · " + bb.commit + " · " + bb.regime) + '</p><p style="font-size:13.5px;margin:0">' + esc(bb.summary) + '</p></div>');
          h.push('</div>');
          h.push(renderSvgChart(ba.chart));
          h.push(renderSvgChart(bb.chart));
        }

        mount.innerHTML = h.join("");
        var activePill = mount.querySelector('.bexp__pill[aria-selected="true"]');
        if (activePill && activePill.scrollIntoView) {
          activePill.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }

      bexp.addEventListener("click", function (e) {
        var modeBtn = e.target.closest("[data-bmode]");
        if (modeBtn) { curMode = modeBtn.getAttribute("data-bmode"); renderExplorer(); return; }
        var navBtn = e.target.closest("[data-bnav]");
        if (navBtn) {
          var d = parseInt(navBtn.getAttribute("data-bnav"), 10);
          curIdx = Math.max(0, Math.min(BUILDS.length - 1, curIdx + d));
          renderExplorer();
          return;
        }
        var pillBtn = e.target.closest("[data-bidx]");
        if (pillBtn) {
          curIdx = parseInt(pillBtn.getAttribute("data-bidx"), 10);
          renderExplorer();
          return;
        }
        var lensBtn = e.target.closest("[data-blens]");
        if (lensBtn) {
          curLens = parseInt(lensBtn.getAttribute("data-blens"), 10);
          renderExplorer();
          return;
        }
      });

      bexp.addEventListener("change", function (e) {
        var sel = e.target.closest("[data-bcmp]");
        if (!sel) return;
        if (sel.getAttribute("data-bcmp") === "a") cmpA = parseInt(sel.value, 10);
        else cmpB = parseInt(sel.value, 10);
        renderExplorer();
      });

      bexp.addEventListener("keydown", function (e) {
        if (curMode !== "deck") return;
        if (e.key === "ArrowRight") { e.preventDefault(); if (curIdx < BUILDS.length - 1) { curIdx++; renderExplorer(); } }
        else if (e.key === "ArrowLeft") { e.preventDefault(); if (curIdx > 0) { curIdx--; renderExplorer(); } }
      });

      renderExplorer();
    }

    /* ---------- unified all-builds performance curve vs LiteSpeed, OLS & nginx ---------- */
    var curveBox = doc.getElementById("all-builds-curve");
    var curveMount = curveBox ? curveBox.querySelector(".bexp__curve") : null;
    if (curveMount) {
      var CURVES = [
        {
          id: "c-rewrite",
          name: "1 · Heavy .htaccess (H1 & H2 RPS)",
          title: "All-Builds Speed Curve — Heavy .htaccess Static (/robots.txt) vs LiteSpeed, OpenLiteSpeed & nginx",
          sub: "806/477-line forum .htaccess chain across all 13 builds + reference baselines · k req/s (click any node to inspect that build)",
          unit: "k rps",
          ymax: 320,
          ystep: 80,
          pts: [
            { idx: 0, tag: "0.0.1", h2: 88.0, h1: 95.8, note: "Initial baseline" },
            { idx: 1, tag: "Tier A", h2: 112.0, h1: 101.4, note: "StatCache + DFA" },
            { idx: 2, tag: "B1–5", h2: 115.0, h1: 78.6, note: "OR-fold + zstd" },
            { idx: 3, tag: "Batch 6", h2: 138.0, h1: 84.3, note: "PGO + mimalloc" },
            { idx: 4, tag: "LSCache", h2: 165.9, h1: 87.3, note: "Single-flight fix" },
            { idx: 5, tag: "io_uring", h2: 202.4, h1: 103.9, note: "monoio transport" },
            { idx: 6, tag: "v0.0.1", h2: 298.0, h1: 168.7, note: "fast_memo + 3-way" },
            { idx: 7, tag: "v0.0.2", h2: 298.5, h1: 169.0, note: "sendfile + kTLS" },
            { idx: 8, tag: "v0.0.3", h2: 302.3, h1: 171.1, note: "openat2 + H3 PGO" },
            { idx: 9, tag: "v0.0.9", h2: 308.0, h1: 174.5, note: "access-rule memo" },
            { idx: 10, tag: "v0.0.10", h2: 309.5, h1: 175.0, note: "TLS idle + dict L3" },
            { idx: 11, tag: "v0.1.2", h2: 314.0, h1: 178.0, note: "Recycled task pools" },
            { idx: 12, tag: "v0.1.5", h2: 316.0, h1: 179.2, note: "BODY_BUFS zero-fault" }
          ],
          series: [
            { key: "h2", label: "httpjet HTTP/2 (k rps)", color: "#22d3ee" },
            { key: "h1", label: "httpjet HTTP/1.1 (k rps)", color: "#818cf8" }
          ],
          refs: [
            { val: 283.3, label: "OpenLiteSpeed H2 (283.3k)", color: "#fbbf73" },
            { val: 206.8, label: "LiteSpeed 6.3.5 H2 (206.8k)", color: "#e879f9" },
            { val: 169.1, label: "OpenLiteSpeed H1 (169.1k)", color: "#34d399" },
            { val: 145.6, label: "nginx H1 (145.6k) / H2 (125.4k)", color: "#8b95ad" },
            { val: 84.3, label: "LiteSpeed 6.3.5 H1 (84.3k)", color: "#c2cadd" }
          ],
          foot: "June builds (0.0.1–LSCache) measured on shared host vs LSWS 6.3.5; v0.0.1+ measured on dedicated host with 806-line chain vs OLS & nginx (compare-rewrite-memo-vary-pgo.csv) + subsequent PGO A/B deltas."
        },
        {
          id: "c-static",
          name: "2 · H2 & H1 Static Small-Object (RPS)",
          title: "All-Builds Speed Curve — HTTP/2 & HTTP/1.1 Static Throughput vs OpenLiteSpeed, LiteSpeed & nginx",
          sub: "small-object static serving (empty / 1 KB, c=50..200) across all 13 builds + reference servers · k req/s",
          unit: "k rps",
          ymax: 1000,
          ystep: 250,
          pts: [
            { idx: 0, tag: "0.0.1", h2: 128.0, h1: 88.0, note: "Initial baseline" },
            { idx: 1, tag: "Tier A", h2: 145.0, h1: 90.5, note: "FileCache 1s TTL" },
            { idx: 2, tag: "B1–5", h2: 148.0, h1: 91.2, note: "Lazy headers" },
            { idx: 3, tag: "Batch 6", h2: 195.0, h1: 93.8, note: "PGO + mimalloc" },
            { idx: 4, tag: "LSCache", h2: 266.9, h1: 96.9, note: "open_beneath memo" },
            { idx: 5, tag: "io_uring", h2: 520.0, h1: 145.0, note: "monoio io_uring" },
            { idx: 6, tag: "v0.0.1", h2: 937.0, h1: 202.1, note: "Dedicated 3-way" },
            { idx: 7, tag: "v0.0.2", h2: 938.0, h1: 202.5, note: "sendfile + kTLS" },
            { idx: 8, tag: "v0.0.3", h2: 942.0, h1: 204.0, note: "openat2 hot path" },
            { idx: 9, tag: "v0.0.9", h2: 948.0, h1: 206.0, note: "readlink skip" },
            { idx: 10, tag: "v0.0.10", h2: 950.0, h1: 206.5, note: "TLS ticketless" },
            { idx: 11, tag: "v0.1.2", h2: 962.0, h1: 209.0, note: "Recycled H2 tasks" },
            { idx: 12, tag: "v0.1.5", h2: 965.0, h1: 210.0, note: "BODY_BUFS zero-fault" }
          ],
          series: [
            { key: "h2", label: "httpjet HTTP/2 peak (k rps)", color: "#22d3ee" },
            { key: "h1", label: "httpjet HTTP/1.1 peak (k rps)", color: "#818cf8" }
          ],
          refs: [
            { val: 877.8, label: "OpenLiteSpeed H2 c=1000 (877.8k) / c=50 (792.8k)", color: "#fbbf73" },
            { val: 244.5, label: "LiteSpeed 6.3.5 H2 shared-box (244.5k)", color: "#e879f9" },
            { val: 183.4, label: "OpenLiteSpeed H1 (183.4k)", color: "#34d399" },
            { val: 119.6, label: "nginx H2 c=1000 (119.6k)", color: "#8b95ad" }
          ],
          foot: "Source: httpjet-sweep-fixed.csv (June shared-box vs LSWS 6.3.5) and versus5-dedicated-final-20260827.csv (dedicated-host vs OLS & nginx)."
        },
        {
          id: "c-php",
          name: "3 · PHP/LSAPI & Origin Page Cache (RPS)",
          title: "All-Builds Speed Curve — PHP/LSAPI & Origin Page Cache vs LiteSpeed 6.3.5",
          sub: "PHP hello-world (H1 c=40) and 152 KB XenForo page-cache hits across all 13 builds · k req/s",
          unit: "k rps",
          ymax: 52,
          ystep: 13,
          pts: [
            { idx: 0, tag: "0.0.1", php: 31.0, cache: 0.2, note: "Uncached PHP only" },
            { idx: 1, tag: "Tier A", php: 31.1, cache: 0.2, note: "StatCache" },
            { idx: 2, tag: "B1–5", php: 31.3, cache: 0.2, note: "Cow CGI env" },
            { idx: 3, tag: "Batch 6", php: 39.4, cache: 0.2, note: "PGO + mimalloc" },
            { idx: 4, tag: "LSCache", php: 44.8, cache: 19.9, note: "hj-pagecache live (101×)" },
            { idx: 5, tag: "io_uring", php: 45.2, cache: 23.5, note: "On-core cache hit" },
            { idx: 6, tag: "v0.0.1", php: 45.5, cache: 25.0, note: "Sharded hot+tmpfs" },
            { idx: 7, tag: "v0.0.2", php: 45.5, cache: 25.4, note: "Dict L6 tuning" },
            { idx: 8, tag: "v0.0.3", php: 45.8, cache: 28.7, note: "openat2 + H3 28.7k" },
            { idx: 9, tag: "v0.0.9", php: 46.8, cache: 29.5, note: "Cookied early bridge" },
            { idx: 10, tag: "v0.0.10", php: 47.0, cache: 30.1, note: "ARM dict L3 (5.3×)" },
            { idx: 11, tag: "v0.1.2", php: 48.2, cache: 31.0, note: "LSAPI buf pools (+2.5%)" },
            { idx: 12, tag: "v0.1.5", php: 48.6, cache: 31.8, note: "Zero-copy PacketReader" }
          ],
          series: [
            { key: "php", label: "httpjet PHP/LSAPI H1 c=40 (k rps)", color: "#22d3ee" },
            { key: "cache", label: "httpjet Origin Page Cache Hit (k rps)", color: "#34d399" }
          ],
          refs: [
            { val: 41.2, label: "LiteSpeed 6.3.5 PHP best (c=60: 41.2k)", color: "#fbbf73" },
            { val: 38.5, label: "LiteSpeed 6.3.5 PHP c=40 (38.5k)", color: "#e879f9" },
            { val: 0.2, label: "Uncached XenForo DB-backed PHP (0.196k)", color: "#8b95ad" }
          ],
          foot: "Source: httpjet-php-fixed.csv, litespeed-php-run1.csv, httpjet-cache-run1.csv, httpjet-0.0.3-vs-previous-h3-20260927.csv, and PR #1157/#1163."
        }
      ];

      var curCurve = 0;
      function renderCurve() {
        var c = CURVES[curCurve];
        var W = 860, H = 370, padL = 64, padR = 235, padT = 24, padB = 58;
        var plotW = W - padL - padR, plotH = H - padT - padB;
        var n = c.pts.length;
        function xOf(i) { return padL + (i / (n - 1)) * plotW; }
        function yOf(v) { return padT + plotH - (Math.min(v, c.ymax) / c.ymax) * plotH; }

        var h = [];
        h.push('<div class="bexp__top">');
        h.push('<div class="bexp__modes" role="tablist" aria-label="All-builds speed curve workload">');
        CURVES.forEach(function (cv, idx) {
          h.push('<button type="button" class="bexp__mode" role="tab" data-ccurve="' + idx + '" aria-selected="' + (idx === curCurve) + '">' + esc(cv.name) + '</button>');
        });
        h.push('</div>');
        h.push('<span class="mini" style="font-family:var(--mono);font-size:11px">Click any build point to jump to its slide ↓</span>');
        h.push('</div>');

        h.push('<div class="chart" style="margin:6px 0 0">');
        h.push('<p class="chart__title">' + esc(c.title) + '</p>');
        h.push('<p class="chart__sub">' + esc(c.sub) + '</p>');
        h.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(c.title) + '">');
        h.push('<defs>');
        h.push('<linearGradient id="cfill0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.22"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0.0"/></linearGradient>');
        h.push('<linearGradient id="cfill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8" stop-opacity="0.16"/><stop offset="1" stop-color="#818cf8" stop-opacity="0.0"/></linearGradient>');
        h.push('</defs>');

        /* horizontal y-axis gridlines */
        for (var yv = 0; yv <= c.ymax; yv += c.ystep) {
          var gy = yOf(yv);
          h.push('<line class="grid" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>');
          h.push('<text class="lbl" x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" style="font-size:10.5px;fill:#8b95ad">' + fmtVal(yv) + ' ' + esc(c.unit) + '</text>');
        }
        h.push('<line class="axis" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '"/>');
        h.push('<line class="axis" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"/>');

        /* competitor reference horizontal dashed lines */
        c.refs.forEach(function (rf) {
          var ry = yOf(rf.val);
          h.push('<line x1="' + padL + '" y1="' + ry.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + ry.toFixed(1) + '" stroke="' + rf.color + '" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.85"/>');
          h.push('<text x="' + (W - padR + 8) + '" y="' + (ry + 3.5).toFixed(1) + '" style="font-size:10px;fill:' + rf.color + ';font-family:var(--mono)">' + esc(rf.label) + '</text>');
        });

        /* vertical build guide ticks + x labels */
        c.pts.forEach(function (pt, i) {
          var px = xOf(i);
          var isSel = (i === curIdx);
          if (isSel) {
            h.push('<line x1="' + px.toFixed(1) + '" y1="' + padT + '" x2="' + px.toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="#22d3ee" stroke-width="1.2" opacity="0.45"/>');
          }
          h.push('<g style="cursor:pointer" data-cjump="' + pt.idx + '">');
          h.push('<text x="' + px.toFixed(1) + '" y="' + (padT + plotH + 16) + '" text-anchor="end" transform="rotate(-32 ' + px.toFixed(1) + ' ' + (padT + plotH + 16) + ')" style="font-size:10.5px;fill:' + (isSel ? "#22d3ee" : "#c2cadd") + ';font-weight:' + (isSel ? "700" : "400") + '">' + esc(pt.tag) + '</text>');
          h.push('</g>');
        });

        /* area + polyline + interactive circles per httpjet series */
        c.series.forEach(function (sr, sIdx) {
          var coords = c.pts.map(function (pt, i) { return [xOf(i), yOf(pt[sr.key]), pt[sr.key], pt]; });
          var poly = coords.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
          var area = padL.toFixed(1) + "," + (padT + plotH).toFixed(1) + " " + poly + " " + (W - padR).toFixed(1) + "," + (padT + plotH).toFixed(1);
          h.push('<polygon points="' + area + '" fill="url(#cfill' + (sIdx % 2) + ')"/>');
          h.push('<polyline points="' + poly + '" fill="none" stroke="' + sr.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
          coords.forEach(function (p, i) {
            var isSel = (i === curIdx);
            var r = isSel ? 5.5 : 3.8;
            h.push('<g style="cursor:pointer" data-cjump="' + p[3].idx + '">');
            h.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r + '" fill="' + (isSel ? "#fff" : sr.color) + '" stroke="' + sr.color + '" stroke-width="2"><title>' + esc(p[3].tag + " (" + p[3].note + ") · " + sr.label + ": " + p[2] + " " + c.unit) + '</title></circle>');
            if (i === 0 || i === 4 || i === 6 || i === n - 1 || isSel) {
              var dy = sIdx === 0 ? -9 : 14;
              h.push('<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy).toFixed(1) + '" text-anchor="middle" style="font-size:10px;font-weight:700;fill:#fff">' + fmtVal(p[2]) + '</text>');
            }
            h.push('</g>');
          });
        });

        h.push('</svg>');
        h.push('<div class="chart__legend">');
        c.series.forEach(function (sr) {
          h.push('<span><i style="display:inline-block;width:12px;height:3px;background:' + sr.color + ';vertical-align:middle;margin-right:6px"></i>' + esc(sr.label) + '</span>');
        });
        c.refs.forEach(function (rf) {
          h.push('<span><i style="display:inline-block;width:12px;height:0;border-top:2px dashed ' + rf.color + ';vertical-align:middle;margin-right:6px"></i>' + esc(rf.label) + '</span>');
        });
        h.push('</div>');
        h.push('<p class="chart__foot">' + esc(c.foot) + '</p>');
        h.push('</div>');

        curveMount.innerHTML = h.join("");
      }

      curveBox.addEventListener("click", function (e) {
        var cBtn = e.target.closest("[data-ccurve]");
        if (cBtn) {
          curCurve = parseInt(cBtn.getAttribute("data-ccurve"), 10);
          renderCurve();
          return;
        }
        var jEl = e.target.closest("[data-cjump]");
        if (jEl) {
          curIdx = parseInt(jEl.getAttribute("data-cjump"), 10);
          curMode = "deck";
          if (activeExpanded === curveBox) setExpanded(curveBox, false);
          renderCurve();
          if (renderExplorer) renderExplorer();
          bexp.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });

      /* keep the highlighted point on the curve synced when the user steps through the slide deck */
      bexp.addEventListener("click", function () { setTimeout(renderCurve, 0); });
      bexp.addEventListener("keydown", function () { setTimeout(renderCurve, 0); });
      renderCurve();
    }
  }

  attachExpandButtons(doc);
  }; /* end window.__hjInitDocs */

  window.__hjInitDocs();

  function getInitialSearchQuery() {
    try {
      var sp = new URLSearchParams(window.location.search);
      if (sp.get("q")) return sp.get("q");
      if (sp.get("search") === "1") return "";
    } catch (e) {
      if (/(?:^|[?&])search=1(?:&|$)/.test(window.location.search)) return "";
    }
    if (window.location.hash === "#search") return "";
    return null;
  }
  var initQ = getInitialSearchQuery();
  if (initQ !== null) setTimeout(function () { openSearch(initQ); }, 0);

  if (!window.__hjDocsGlobalBound) {
    window.__hjDocsGlobalBound = true;
    doc.addEventListener("dblclick", function (e) {
      var fig = e.target.closest && e.target.closest(".figure svg, .chart svg");
      if (!fig) return;
      var box = fig.closest(".bexp") || fig.closest(".figure, .chart");
      if (box) setExpanded(box, !box.classList.contains("is-expanded"));
    });
    doc.addEventListener("click", function (e) {
      var svgLink = e.target.closest && e.target.closest(".figure.diagram svg a");
      if (!svgLink) return;
      var rawHref = svgLink.getAttribute("href") || svgLink.getAttribute("xlink:href") || "";
      if (activeExpanded) setExpanded(activeExpanded, false);
      if (rawHref.indexOf(curPageUrl + "#") === 0) {
        e.preventDefault();
        window.location.hash = rawHref.slice(curPageUrl.length);
      } else if (rawHref && rawHref.charAt(0) !== "#" && window.__hjRouter) {
        e.preventDefault();
        window.__hjRouter.navigate(new URL(rawHref, window.location.href).href, true);
      }
    });
    doc.addEventListener("keydown", function (e) {
      if (!doc.querySelector("header.hdr")) return;
      if (e.key === "Escape" && activeExpanded) { e.preventDefault(); setExpanded(activeExpanded, false); return; }
      if ((e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(doc.activeElement.tagName)) ||
          ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); openSearch(""); return; }
      if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) { closeDrawer(true); return; }
      if (!ov || !ov.classList.contains("open")) return;
      if (e.key === "Escape") { closeSearch(true); return; }
      if (e.key === "Tab") {
        var f = Array.prototype.slice.call(ov.querySelectorAll('input, a[href], button, [tabindex]:not([tabindex="-1"])')).filter(function (el) {
          return !el.disabled && el.offsetParent !== null;
        });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      var items = results ? Array.prototype.slice.call(results.querySelectorAll("a")) : [];
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); }
      else if (e.key === "Enter" && sel > -1 && items[sel]) {
        var targetHref = items[sel].getAttribute("href");
        closeSearch(false);
        if (window.__hjRouter && targetHref && targetHref.charAt(0) !== "#") {
          window.__hjRouter.navigate(new URL(targetHref, window.location.href).href, true);
        } else {
          window.location.href = targetHref;
        }
        return;
      }
      items.forEach(function (a, i) { a.classList.toggle("sel", i === sel); if (i === sel) a.scrollIntoView({ block: "nearest" }); });
    });
  }
})();
