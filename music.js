// Generative ambient soundtrack, synthesized live with the Web Audio API:
// slow drifting pad chords over a soft drone, with sparse bell notes echoing
// through a long reverb. Nothing repeats exactly, so it never loops audibly.
const Music = (() => {
  "use strict";

  // Chords as MIDI notes: Dm9, Fmaj7#11, Bbmaj7, Am(add11) — dark but open.
  const CHORDS = [
    [38, 50, 57, 60, 64, 69],
    [41, 53, 57, 64, 67, 71],
    [34, 46, 53, 57, 62, 65],
    [33, 45, 52, 60, 62, 67],
  ];
  const BELLS = [74, 76, 77, 79, 81, 84, 86, 88];
  const CHORD_SECONDS = 11;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ac = null, master, padFilter, bus, echo, timer = null;
  let nextChord = 0, nextBell = 0, chordIdx = 0, playing = false;

  function reverbImpulse(seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.connect(master); master.connect(ac.destination);

    const reverb = ac.createConvolver(); reverb.buffer = reverbImpulse(8, 2.4);
    const wet = ac.createGain(); wet.gain.value = 0.75;
    const dry = ac.createGain(); dry.gain.value = 0.45;
    reverb.connect(wet); wet.connect(comp); dry.connect(comp);
    bus = ac.createGain(); bus.connect(dry); bus.connect(reverb);

    // dotted echo for the bells
    echo = ac.createDelay(2); echo.delayTime.value = 0.84;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const echoTone = ac.createBiquadFilter(); echoTone.type = "lowpass"; echoTone.frequency.value = 2600;
    echo.connect(echoTone); echoTone.connect(fb); fb.connect(echo); echoTone.connect(reverb);

    // pads breathe: a very slow LFO opens and closes their filter
    padFilter = ac.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 750; padFilter.Q.value = 0.8;
    padFilter.connect(bus);
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = 0.025; depth.gain.value = 420;
    lfo.connect(depth); depth.connect(padFilter.frequency); lfo.start();
  }

  function envelope(g, t, peak, attack, hold, release) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
    return t + attack + hold + release;
  }

  function pad(notes, t) {
    const [root, ...upper] = notes;
    for (const m of upper) {
      for (const detune of [-7, 7]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = detune + (Math.random() - 0.5) * 6;
        const end = envelope(g, t, 0.016, 4, CHORD_SECONDS - 5, 5);
        o.connect(g); g.connect(padFilter); o.start(t); o.stop(end + 0.1);
      }
    }
    const sub = ac.createOscillator(), g = ac.createGain();
    sub.type = "sine"; sub.frequency.value = hz(root);
    const end = envelope(g, t, 0.07, 3, CHORD_SECONDS - 4, 5);
    sub.connect(g); g.connect(bus); sub.start(t); sub.stop(end + 0.1);
  }

  function bell(t) {
    const f = hz(BELLS[(Math.random() * BELLS.length) | 0]);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    g.connect(bus); g.connect(echo);
    for (const [ratio, level] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) { // slightly inharmonic, like a glass bell
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = "sine"; o.frequency.value = f * ratio; og.gain.value = level;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 4.1);
    }
  }

  function schedule() {
    const horizon = ac.currentTime + 1.5;
    while (nextChord < horizon) {
      pad(CHORDS[chordIdx % CHORDS.length], nextChord);
      chordIdx++; nextChord += CHORD_SECONDS;
    }
    while (nextBell < horizon) {
      if (Math.random() < 0.7) bell(nextBell);
      nextBell += 1.2 + Math.random() * 3.8;
    }
  }

  function start() {
    if (!ac) init();
    ac.resume();
    const t = ac.currentTime;
    nextChord = Math.max(nextChord, t + 0.1);
    nextBell = Math.max(nextBell, t + 3);
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.9, t + 4);
    schedule();
    timer = setInterval(schedule, 300);
    playing = true;
  }

  function stop() {
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 1.5);
    clearInterval(timer);
    playing = false;
    setTimeout(() => { if (!playing) ac.suspend(); }, 1600);
  }

  return {
    toggle() { playing ? stop() : start(); return playing; },
    get playing() { return playing; },
  };
})();
