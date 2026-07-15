/* SynthLab Isochronic PWA v2 — motor Web Audio sem dependências externas. */
const SR = 44100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const defaultChannel = (name) => ({
  name,
  active: name === "Canal 1",
  freq: name === "Canal 1" ? 528 : 432,
  waveform: "sine",
  level: name === "Canal 1" ? 0.55 : 0.25,
  pan: 0,
  pulseEnabled: true,
  pulseHz: name === "Canal 1" ? 10 : 6,
  pulseMode: "continuous_plus_pulse",
  intensity: 0.45,
  duty: 50,
  attack: 0.02,
  decay: 0.02,
  sustain: 50,
  release: 0.04,
  phase: 0,
  pulsePhase: 0,
  startedAtSample: 0,
});

let state = {
  running: false,
  master: 0.25,
  channels: [defaultChannel("Canal 1"), defaultChannel("Canal 2")],
};

let audioCtx = null;
let processor = null;
let sampleCounter = 0;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindEls();
  buildPresetSelectors();
  buildChannelUI();
  loadStateFromStorage(false);
  updatePresetText();
  updateUI();
  registerServiceWorker();
});

function bindEls() {
  for (const id of ["playStop", "masterVolume", "masterLabel", "nowSummary", "engineState", "baseSelect", "pulseSelect", "modeSelect", "applySingle", "applyCh1", "applyCh2", "presetTitle", "presetShort", "presetFull", "channels", "exportWav", "wavDuration", "wavName", "saveState", "loadState", "installState"]) {
    els[id] = document.getElementById(id);
  }
  els.playStop.addEventListener("click", toggleAudio);
  els.masterVolume.addEventListener("input", () => {
    state.master = Number(els.masterVolume.value) / 100;
    updateUI(); saveStateToStorage(false);
  });
  els.baseSelect.addEventListener("change", updatePresetText);
  els.pulseSelect.addEventListener("change", updatePresetText);
  els.modeSelect.addEventListener("change", updatePresetText);
  els.applySingle.addEventListener("click", () => applyPreset(0, true));
  els.applyCh1.addEventListener("click", () => applyPreset(0, false));
  els.applyCh2.addEventListener("click", () => applyPreset(1, false));
  els.exportWav.addEventListener("click", exportWav);
  els.saveState.addEventListener("click", () => saveStateToStorage(true));
  els.loadState.addEventListener("click", () => loadStateFromStorage(true));
}

function buildPresetSelectors() {
  const bases = Object.entries(window.PRESET_BASES).map(([hz, data]) => ({ hz: Number(hz), ...data })).sort((a,b)=>a.hz-b.hz);
  els.baseSelect.innerHTML = bases.map(b => `<option value="${b.hz}">${b.label}</option>`).join("");
  const pulses = window.PRESET_PULSES;
  els.pulseSelect.innerHTML = pulses.map(p => `<option value="${p.id}">${p.name} — ${p.hz} Hz</option>`).join("");
  els.baseSelect.value = "528";
  els.pulseSelect.value = "alpha";
}

function buildChannelUI() {
  els.channels.innerHTML = "";
  state.channels.forEach((ch, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "channel-card";
    wrap.dataset.channelCard = String(idx);
    wrap.innerHTML = `
      <div class="channel-head">
        <div>
          <div class="channel-title">${ch.name}</div>
          <div class="channel-mini" data-mini="${idx}"></div>
        </div>
        <label class="switch-row">Ativo <input data-k="active" data-i="${idx}" type="checkbox" /></label>
      </div>
      <details class="advanced" ${idx === 0 ? "open" : ""}>
        <summary>Editar este canal</summary>
        <div class="grid two">
          <label>Frequência base (Hz)
            <input data-k="freq" data-i="${idx}" type="number" step="0.1" min="1" max="20000" />
          </label>
          <label>Forma de onda
            <select data-k="waveform" data-i="${idx}">
              <option value="sine">Senoidal</option>
              <option value="triangle">Triangular</option>
              <option value="square">Quadrada</option>
              <option value="saw">Dente de serra</option>
            </select>
          </label>
        </div>
        <div class="grid two">
          <label>Nível do canal
            <input data-k="level" data-i="${idx}" type="range" min="0" max="100" />
          </label>
          <label>Panorama L/R
            <input data-k="pan" data-i="${idx}" type="range" min="-100" max="100" />
          </label>
        </div>
        <label class="switch-row">Pulso isocrónico ativo <input data-k="pulseEnabled" data-i="${idx}" type="checkbox" /></label>
        <div class="grid two">
          <label>Frequência do pulso (Hz)
            <input data-k="pulseHz" data-i="${idx}" type="number" step="0.01" min="0.05" max="80" />
          </label>
          <label>Modo do pulso
            <select data-k="pulseMode" data-i="${idx}">
              <option value="continuous_plus_pulse">Tom contínuo + pulso acrescentado</option>
              <option value="pulse_base">Pulsar o tom base</option>
            </select>
          </label>
        </div>
        <div class="grid two">
          <label>Intensidade do pulso
            <input data-k="intensity" data-i="${idx}" type="range" min="0" max="100" />
          </label>
          <label>Duração do pulso / Duty (%)
            <input data-k="duty" data-i="${idx}" type="range" min="5" max="95" />
          </label>
        </div>
        <details>
          <summary>ADSR do pulso</summary>
          <div class="small-grid">
            <label>Attack (s)<input data-k="attack" data-i="${idx}" type="number" step="0.001" min="0" max="5" /></label>
            <label>Decay (s)<input data-k="decay" data-i="${idx}" type="number" step="0.001" min="0" max="5" /></label>
            <label>Sustain (%)<input data-k="sustain" data-i="${idx}" type="number" step="1" min="0" max="100" /></label>
            <label>Release (s)<input data-k="release" data-i="${idx}" type="number" step="0.001" min="0" max="5" /></label>
          </div>
        </details>
      </details>
    `;
    els.channels.appendChild(wrap);
  });
  els.channels.querySelectorAll("input, select").forEach(input => {
    input.addEventListener("input", onChannelInput);
    input.addEventListener("change", onChannelInput);
  });
}

function getSelectedPreset() {
  const baseHz = Number(els.baseSelect.value);
  const pulseId = els.pulseSelect.value;
  const base = window.PRESET_BASES[String(baseHz)];
  const pulse = window.PRESET_PULSES.find(p => p.id === pulseId);
  return { baseHz, base, pulse, mode: els.modeSelect.value };
}

function getPresetAdsr(baseHz, pulse) {
  const key = `${baseHz}|${pulse.id}`;
  return (window.PRESET_ADSR_OVERRIDES && window.PRESET_ADSR_OVERRIDES[key]) || {
    attack: pulse.attack,
    decay: pulse.decay,
    sustain: Math.round((pulse.sustain <= 1 ? pulse.sustain * 100 : pulse.sustain)),
    release: pulse.release,
  };
}

function updatePresetText() {
  const { baseHz, base, pulse, mode } = getSelectedPreset();
  const modeText = mode === "pulse_base" ? "Pulsar o tom base" : "Tom contínuo + pulso acrescentado";
  els.presetTitle.textContent = `${baseHz} Hz + ${pulse.name} ${pulse.hz} Hz`;
  els.presetShort.textContent = `${modeText}. ${base.short[pulse.id]} Duty 50%; ADSR ${pulse.attack}s / ${pulse.decay}s / ${pulse.sustain}% / ${pulse.release}s.`;
  els.presetFull.textContent = `${base.intro}\n\n${base.full[pulse.id]}\n\nNota: esta explicação é apresentada como mapeamento simbólico/subjetivo fornecido pelo utilizador. A app apenas gera som.`;
}

function applyPreset(idx, single) {
  const { baseHz, base, pulse, mode } = getSelectedPreset();
  const ch = state.channels[idx];
  ch.active = true;
  ch.freq = baseHz;
  ch.waveform = "sine";
  ch.level = idx === 0 ? 0.55 : 0.35;
  ch.pan = 0;
  ch.pulseEnabled = true;
  ch.pulseHz = pulse.hz;
  ch.pulseMode = mode;
  ch.intensity = 0.45;
  ch.duty = 50;
  const adsr = getPresetAdsr(baseHz, pulse);
  ch.attack = adsr.attack;
  ch.decay = adsr.decay;
  ch.sustain = adsr.sustain;
  ch.release = adsr.release;
  if (single) {
    state.channels.forEach((c, i) => { if (i !== idx) c.active = false; });
  }
  updateUI(); saveStateToStorage(false);
}

function onChannelInput(ev) {
  const i = Number(ev.target.dataset.i);
  const k = ev.target.dataset.k;
  const ch = state.channels[i];
  if (ev.target.type === "checkbox") {
    ch[k] = ev.target.checked;
  } else if (ev.target.type === "range") {
    const v = Number(ev.target.value);
    if (k === "level" || k === "intensity") ch[k] = v / 100;
    else if (k === "pan") ch[k] = v / 100;
    else ch[k] = v;
  } else if (ev.target.type === "number") {
    ch[k] = Number(ev.target.value);
  } else {
    ch[k] = ev.target.value;
  }
  updateUI(); saveStateToStorage(false);
}

function updateUI() {
  els.masterVolume.value = Math.round(state.master * 100);
  els.masterLabel.textContent = `${Math.round(state.master * 100)}%`;
  els.engineState.textContent = state.running ? "A tocar" : "Parado";
  els.engineState.className = state.running ? "state-on" : "state-off";
  els.playStop.textContent = state.running ? "Parar" : "Iniciar";
  els.playStop.className = state.running ? "primary stop" : "primary";
  els.installState.textContent = window.matchMedia('(display-mode: standalone)').matches ? "Instalada" : "Web/PWA";
  state.channels.forEach((ch, idx) => {
    for (const el of document.querySelectorAll(`[data-i="${idx}"]`)) {
      const k = el.dataset.k;
      if (!(k in ch)) continue;
      if (el.type === "checkbox") el.checked = !!ch[k];
      else if (el.type === "range") {
        if (k === "level" || k === "intensity") el.value = Math.round(ch[k] * 100);
        else if (k === "pan") el.value = Math.round(ch[k] * 100);
        else el.value = ch[k];
      } else el.value = ch[k];
    }
    const mini = document.querySelector(`[data-mini="${idx}"]`);
    if (mini) mini.textContent = summarizeChannel(ch);
    const card = document.querySelector(`[data-channel-card="${idx}"]`);
    if (card) {
      card.classList.toggle("channel-active", !!ch.active);
      card.classList.toggle("channel-inactive", !ch.active);
    }
  });
  updateNowSummary();
}

function summarizeChannel(ch) {
  if (!ch.active) return "desligado";
  const mode = ch.pulseEnabled ? (ch.pulseMode === "pulse_base" ? "pulsado" : "contínuo + pulso") : "sem pulso";
  const pan = ch.pan < -0.2 ? "esquerda" : ch.pan > 0.2 ? "direita" : "centro";
  return `${fmt(ch.freq)} Hz, ${waveName(ch.waveform)}, ${mode}${ch.pulseEnabled ? ` ${fmt(ch.pulseHz)} Hz` : ""}, ${pan}`;
}
function waveName(w) { return {sine:"seno", triangle:"triangular", square:"quadrada", saw:"dente"}[w] || w; }
function fmt(v) { return Number(v).toFixed(Math.abs(v) < 10 ? 2 : (Math.abs(v) < 100 ? 1 : 1)).replace(/\.0$/, ""); }

function updateNowSummary() {
  const active = state.channels.filter(c => c.active && c.level > 0);
  if (!active.length) {
    els.nowSummary.textContent = "Nenhum som ativo.";
    return;
  }
  els.nowSummary.innerHTML = `<strong>${active.length} canal${active.length>1?"es":""} ativo${active.length>1?"s":""}</strong> | Master ${Math.round(state.master*100)}%<br>` +
    active.map(c => `${c.name}: ${summarizeChannel(c)}`).join("<br>");
}

async function toggleAudio() {
  if (state.running) stopAudio(); else await startAudio();
}

async function startAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (processor) processor.disconnect();
  processor = audioCtx.createScriptProcessor(1024, 0, 2);
  state.channels.forEach(ch => { ch.phase = 0; ch.pulsePhase = 0; ch.startedAtSample = sampleCounter; });
  processor.onaudioprocess = processAudio;
  processor.connect(audioCtx.destination);
  state.running = true;
  updateUI();
}

function stopAudio() {
  state.running = false;
  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    processor = null;
  }
  updateUI();
}

function processAudio(e) {
  const outL = e.outputBuffer.getChannelData(0);
  const outR = e.outputBuffer.getChannelData(1);
  const activeCount = Math.max(1, state.channels.filter(c => c.active && c.level > 0).length);
  const mixNorm = 1 / Math.sqrt(activeCount);
  for (let i = 0; i < outL.length; i++) {
    let l = 0, r = 0;
    for (const ch of state.channels) {
      if (!ch.active || ch.level <= 0) continue;
      const sample = renderChannelSample(ch, SR);
      const pan = clamp(ch.pan, -1, 1);
      const angle = (pan + 1) * Math.PI / 4;
      const lg = Math.cos(angle), rg = Math.sin(angle);
      l += sample * lg;
      r += sample * rg;
    }
    outL[i] = softLimit(l * state.master * mixNorm);
    outR[i] = softLimit(r * state.master * mixNorm);
    sampleCounter++;
  }
}

function renderChannelSample(ch, sr) {
  const freq = clamp(Number(ch.freq) || 0, 0, sr / 2 - 100);
  const ph = ch.phase;
  let carrier = wave(ch.waveform, ph);
  ch.phase = (ch.phase + freq / sr) % 1;
  let amp = 1;
  if (ch.pulseEnabled) {
    const env = pulseEnvelope(ch);
    if (ch.pulseMode === "pulse_base") {
      amp = (1 - ch.intensity) + ch.intensity * env;
    } else {
      amp = (1 + ch.intensity * env) / (1 + ch.intensity);
    }
  }
  return carrier * ch.level * amp;
}

function wave(w, phase) {
  switch (w) {
    case "square": return phase < 0.5 ? 1 : -1;
    case "triangle": return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
    case "saw": return 2 * phase - 1;
    case "sine":
    default: return Math.sin(2 * Math.PI * phase);
  }
}

function pulseEnvelope(ch) {
  const hz = clamp(Number(ch.pulseHz) || 0, 0.05, 80);
  const period = 1 / hz;
  const duty = clamp(Number(ch.duty) || 50, 1, 99) / 100;
  const onDur = period * duty;
  const offDur = period - onDur;
  const t = ch.pulsePhase * period;
  ch.pulsePhase = (ch.pulsePhase + hz / SR) % 1;
  let a = Math.max(0, Number(ch.attack) || 0);
  let d = Math.max(0, Number(ch.decay) || 0);
  let s = clamp(Number(ch.sustain) || 0, 0, 100) / 100;
  let rel = Math.max(0, Number(ch.release) || 0);
  if (a + d > onDur && a + d > 0) {
    const scale = onDur / (a + d);
    a *= scale; d *= scale;
  }
  rel = Math.min(rel, offDur);
  if (t < onDur) {
    if (a > 0 && t < a) return t / a;
    if (d > 0 && t < a + d) return 1 - (1 - s) * ((t - a) / d);
    return s;
  }
  const offT = t - onDur;
  if (rel > 0 && offT < rel) return s * (1 - offT / rel);
  return 0;
}

function softLimit(x) { return Math.tanh(x * 1.35) / Math.tanh(1.35); }

function saveStateToStorage(show) {
  const serializable = { master: state.master, channels: state.channels.map(c => ({...c, phase:0, pulsePhase:0, startedAtSample:0})) };
  localStorage.setItem("synthlabIsoState", JSON.stringify(serializable));
  if (show) alert("Estado guardado neste browser/telemóvel.");
}
function loadStateFromStorage(show) {
  const raw = localStorage.getItem("synthlabIsoState");
  if (!raw) { if (show) alert("Ainda não existe estado guardado."); return; }
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.master === "number") state.master = obj.master;
    if (Array.isArray(obj.channels)) {
      state.channels = [0,1].map(i => ({...defaultChannel(`Canal ${i+1}`), ...(obj.channels[i] || {})}));
      buildChannelUI();
    }
    updateUI();
    if (show) alert("Estado carregado.");
  } catch (err) {
    console.error(err);
    if (show) alert("Não foi possível carregar o estado guardado.");
  }
}

function exportWav() {
  const duration = clamp(Number(els.wavDuration.value) || 30, 1, 600);
  const name = (els.wavName.value || "synthlab_isochronic.wav").replace(/[\\/:*?"<>|]/g, "_");
  const total = Math.floor(duration * SR);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const copy = JSON.parse(JSON.stringify(state.channels));
  const activeCount = Math.max(1, copy.filter(c => c.active && c.level > 0).length);
  const mixNorm = 1 / Math.sqrt(activeCount);
  for (let i = 0; i < total; i++) {
    let l = 0, r = 0;
    for (const ch of copy) {
      if (!ch.active || ch.level <= 0) continue;
      const sample = renderChannelSample(ch, SR);
      const pan = clamp(ch.pan, -1, 1);
      const angle = (pan + 1) * Math.PI / 4;
      l += sample * Math.cos(angle);
      r += sample * Math.sin(angle);
    }
    left[i] = softLimit(l * state.master * mixNorm);
    right[i] = softLimit(r * state.master * mixNorm);
  }
  const blob = encodeWav(left, right, SR);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name.endsWith(".wav") ? name : name + ".wav";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function encodeWav(left, right, sampleRate) {
  const n = left.length;
  const buffer = new ArrayBuffer(44 + n * 4);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i=0;i<s.length;i++) view.setUint8(off+i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 4, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 4, true);
  let off = 44;
  for (let i=0;i<n;i++) {
    view.setInt16(off, clamp(left[i], -1, 1) * 32767, true); off += 2;
    view.setInt16(off, clamp(right[i], -1, 1) * 32767, true); off += 2;
  }
  return new Blob([view], {type:"audio/wav"});
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(err => console.warn("SW não registado:", err));
  }
}
