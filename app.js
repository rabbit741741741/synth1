/* SynthLab Isochronic PWA v6.4 — decimais nos pulsos + presets de sequências programadas. */
const SR = 44100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Aceita decimais com ponto ou vírgula e não estraga a escrita intermédia
// em telemóveis/Chrome (ex.: 0.1, 0,1, 0.5, 0,5).
function parseDecimal(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value ?? "").trim().replace(",", ".");
  if (raw === "" || raw === "." || raw === "," || raw === "-" || raw === "-.") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

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

const defaultSequenceRows = () => ([
  {
    label: "Etapa 1",
    freq: 285,
    pulseHz: 2,
    hours: 0,
    minutes: 20,
    mode: "continuous_plus_pulse",
    level: 55,
  },
  {
    label: "Etapa 2",
    freq: 582,
    pulseHz: 2,
    hours: 8,
    minutes: 0,
    mode: "continuous_plus_pulse",
    level: 45,
  },
]);

const SEQUENCE_PRESETS = [
  {
    id: "noturna_528",
    name: "Sequência Noturna Alargada — foco 528 Hz",
    desc: "Sono/transe inicial e madrugada prolongada: 30 min alívio físico, 3 h silêncio/transe, 5 h base 528 Hz + Delta.",
    rows: [
      { label: "Alívio físico inicial", freq: 174, pulseHz: 2, hours: 0, minutes: 30, mode: "continuous_plus_pulse", level: 38 },
      { label: "Silêncio e transe", freq: 285, pulseHz: 0.5, hours: 3, minutes: 0, mode: "continuous_plus_pulse", level: 32 },
      { label: "Regeneração longa e vitalidade", freq: 528, pulseHz: 2, hours: 5, minutes: 0, mode: "continuous_plus_pulse", level: 30 },
    ],
  },
  {
    id: "reset_ansiedade",
    name: "Reset de Ansiedade e Ancoragem",
    desc: "Descer de hiperalerta/pânico para presença corporal: Alpha inicial, coerência lenta e presença intuitiva sem pensamento.",
    rows: [
      { label: "Suavizar o ritmo mental", freq: 396, pulseHz: 10, hours: 0, minutes: 5, mode: "continuous_plus_pulse", level: 45 },
      { label: "Sincronizar respiração lenta", freq: 174, pulseHz: 0.1, hours: 0, minutes: 10, mode: "continuous_plus_pulse", level: 38 },
      { label: "Intuição e presença sem pensamento", freq: 852, pulseHz: 6, hours: 0, minutes: 10, mode: "continuous_plus_pulse", level: 38 },
    ],
  },
  {
    id: "foco_escrita",
    name: "Foco Profundo e Escrita Crítica",
    desc: "Bloco de trabalho estruturado: clareza inicial, foco ativo prolongado e pico final de clareza experimental.",
    rows: [
      { label: "Clareza inicial e organização", freq: 741, pulseHz: 10, hours: 0, minutes: 10, mode: "continuous_plus_pulse", level: 42 },
      { label: "Foco ativo e escrita constante", freq: 741, pulseHz: 15, hours: 0, minutes: 40, mode: "continuous_plus_pulse", level: 45 },
      { label: "Hiper-foco experimental", freq: 963, pulseHz: 40, hours: 0, minutes: 10, mode: "continuous_plus_pulse", level: 30 },
    ],
  },
  {
    id: "transicao_cosmica",
    name: "Meditação de Transição Cósmica",
    desc: "Sessão curta para mudança de padrões e contemplação: 417 Hz + Theta seguido de 963 Hz + Turiya.",
    rows: [
      { label: "Mudança de padrões e subconsciente", freq: 417, pulseHz: 6, hours: 0, minutes: 15, mode: "continuous_plus_pulse", level: 40 },
      { label: "Contemplação, silêncio e testemunha", freq: 963, pulseHz: 0.5, hours: 0, minutes: 15, mode: "continuous_plus_pulse", level: 34 },
    ],
  },
];

let state = {
  running: false,
  master: 0.25,
  channels: [defaultChannel("Canal 1"), defaultChannel("Canal 2")],
  timer: {
    enabled: false,
    hours: 0,
    minutes: 20,
  },
  sequence: {
    rows: defaultSequenceRows(),
    running: false,
    index: 0,
    loop: false,
  },
};

let audioCtx = null;
let processor = null;
let sampleCounter = 0;
let manualTimerId = null;
let sequenceTimerId = null;
let countdownIntervalId = null;
let deadlineMs = null;

const els = {};

const BIND_IDS = [
  "playStop", "masterVolume", "masterLabel", "nowSummary", "engineState",
  "baseSelect", "pulseSelect", "modeSelect", "applySingle", "applyCh1", "applyCh2",
  "presetTitle", "presetShort", "presetFull", "channels",
  "timerEnabled", "timerHours", "timerMinutes", "timerStatus", "timerFields", "timerStrip",
  "sequenceRows", "sequencePresetSelect", "loadSequencePreset", "sequencePresetDesc", "addSequenceFromPreset", "addSequenceCustom", "startSequence", "stopSequence", "sequenceLoop", "sequenceStatus",
  "exportWav", "wavDuration", "wavName", "saveState", "loadState", "installState"
];

document.addEventListener("DOMContentLoaded", () => {
  bindEls();
  buildPresetSelectors();
  buildSequencePresetSelector();
  buildChannelUI();
  buildSequenceUI();
  loadStateFromStorage(false);
  updatePresetText();
  updateUI();
  registerServiceWorker();
});

function bindEls() {
  for (const id of BIND_IDS) els[id] = document.getElementById(id);

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

  els.timerEnabled.addEventListener("change", () => {
    state.timer.enabled = els.timerEnabled.checked;
    if (!state.timer.enabled) clearManualTimer();
    else if (state.running && !state.sequence.running) scheduleManualTimer();
    updateUI(); saveStateToStorage(false);
  });
  els.timerHours.addEventListener("input", onTimerInput);
  els.timerMinutes.addEventListener("input", onTimerInput);

  els.sequencePresetSelect.addEventListener("change", updateSequencePresetDescription);
  els.loadSequencePreset.addEventListener("click", loadSelectedSequencePreset);
  els.addSequenceFromPreset.addEventListener("click", addSequenceFromPreset);
  els.addSequenceCustom.addEventListener("click", addSequenceCustom);
  els.startSequence.addEventListener("click", startSequence);
  els.stopSequence.addEventListener("click", () => stopAudio({ keepSequence: false }));
  els.sequenceLoop.addEventListener("change", () => {
    state.sequence.loop = els.sequenceLoop.checked;
    updateUI(); saveStateToStorage(false);
  });

  els.exportWav.addEventListener("click", exportWav);
  els.saveState.addEventListener("click", () => saveStateToStorage(true));
  els.loadState.addEventListener("click", () => loadStateFromStorage(true));
}

function buildPresetSelectors() {
  const bases = Object.entries(window.PRESET_BASES)
    .map(([hz, data]) => ({ hz: Number(hz), ...data }))
    .sort((a,b)=>a.hz-b.hz);
  els.baseSelect.innerHTML = bases.map(b => `<option value="${b.hz}">${b.label}</option>`).join("");
  const pulses = window.PRESET_PULSES;
  els.pulseSelect.innerHTML = pulses.map(p => `<option value="${p.id}">${p.name} — ${p.hz} Hz</option>`).join("");
  els.baseSelect.value = "528";
  els.pulseSelect.value = "alpha";
}


function buildSequencePresetSelector() {
  if (!els.sequencePresetSelect) return;
  els.sequencePresetSelect.innerHTML = SEQUENCE_PRESETS
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  els.sequencePresetSelect.value = SEQUENCE_PRESETS[0]?.id || "";
  updateSequencePresetDescription();
}

function updateSequencePresetDescription() {
  if (!els.sequencePresetDesc) return;
  const preset = SEQUENCE_PRESETS.find(p => p.id === els.sequencePresetSelect.value);
  els.sequencePresetDesc.textContent = preset ? preset.desc : "";
}

function cloneSequenceRows(rows) {
  return rows.map(r => cleanSequenceRow({ ...r }));
}

function loadSelectedSequencePreset() {
  if (state.sequence.running) {
    alert("Pare a sequência antes de trocar de preset.");
    return;
  }
  const preset = SEQUENCE_PRESETS.find(p => p.id === els.sequencePresetSelect.value);
  if (!preset) return;
  state.sequence.rows = cloneSequenceRows(preset.rows);
  buildSequenceUI();
  updateUI();
  saveStateToStorage(false);
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
            <input data-k="freq" data-i="${idx}" type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" />
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
            <input data-k="pulseHz" data-i="${idx}" type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" placeholder="0.1" />
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

function buildSequenceUI() {
  els.sequenceRows.innerHTML = "";
  state.sequence.rows.forEach((row, idx) => {
    const div = document.createElement("div");
    div.className = "sequence-row";
    div.dataset.sequenceRow = String(idx);
    div.innerHTML = `
      <div class="sequence-row-head">
        <strong data-seq-title="${idx}">Etapa ${idx + 1}</strong>
        <button class="small danger-soft" data-seq-remove="${idx}" type="button">Remover</button>
      </div>
      <div class="sequence-grid">
        <label>Nome
          <input data-seq-k="label" data-seq-i="${idx}" type="text" />
        </label>
        <label>Frequência base (Hz)
          <input data-seq-k="freq" data-seq-i="${idx}" type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" />
        </label>
        <label>Pulso (Hz)
          <input data-seq-k="pulseHz" data-seq-i="${idx}" type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" placeholder="0.1" />
        </label>
        <label>Horas
          <input data-seq-k="hours" data-seq-i="${idx}" type="number" min="0" max="24" step="1" />
        </label>
        <label>Minutos
          <input data-seq-k="minutes" data-seq-i="${idx}" type="number" min="0" max="59" step="1" />
        </label>
        <label>Nível
          <input data-seq-k="level" data-seq-i="${idx}" type="range" min="0" max="100" />
        </label>
        <label>Modo
          <select data-seq-k="mode" data-seq-i="${idx}">
            <option value="continuous_plus_pulse">Tom contínuo + pulso</option>
            <option value="pulse_base">Pulsar o tom base</option>
          </select>
        </label>
      </div>
    `;
    els.sequenceRows.appendChild(div);
  });
  els.sequenceRows.querySelectorAll("input, select").forEach(input => {
    input.addEventListener("input", onSequenceInput);
    input.addEventListener("change", onSequenceInput);
  });
  els.sequenceRows.querySelectorAll("[data-seq-remove]").forEach(btn => {
    btn.addEventListener("click", () => removeSequenceRow(Number(btn.dataset.seqRemove)));
  });
}

function getSelectedPreset() {
  const baseHz = Number(els.baseSelect.value);
  const pulseId = els.pulseSelect.value;
  const base = window.PRESET_BASES[String(baseHz)];
  const pulse = window.PRESET_PULSES.find(p => p.id === pulseId);
  return { baseHz, base, pulse, mode: els.modeSelect.value };
}

function getPulseDefaultsFromHz(pulseHz) {
  const exact = window.PRESET_PULSES.find(p => Math.abs(Number(p.hz) - Number(pulseHz)) < 0.001);
  if (exact) return exact;
  if (pulseHz <= 0.2) return { attack: 4, decay: 1, sustain: 0.6, release: 5 };
  if (pulseHz <= 1) return { attack: 0.5, decay: 0.5, sustain: 0.6, release: 1 };
  if (pulseHz <= 3) return { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 };
  if (pulseHz <= 8) return { attack: 0.03, decay: 0.03, sustain: 0.5, release: 0.07 };
  if (pulseHz <= 12) return { attack: 0.02, decay: 0.02, sustain: 0.5, release: 0.04 };
  if (pulseHz <= 20) return { attack: 0.015, decay: 0.015, sustain: 0.45, release: 0.03 };
  return { attack: 0.005, decay: 0.005, sustain: 0.4, release: 0.01 };
}

function normalizeSustain(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function getPresetAdsr(baseHz, pulse) {
  const key = `${baseHz}|${pulse.id}`;
  const data = (window.PRESET_ADSR_OVERRIDES && window.PRESET_ADSR_OVERRIDES[key]) || pulse;
  return {
    attack: Number(data.attack),
    decay: Number(data.decay),
    sustain: normalizeSustain(data.sustain),
    release: Number(data.release),
  };
}

function updatePresetText() {
  const { baseHz, base, pulse, mode } = getSelectedPreset();
  const modeText = mode === "pulse_base" ? "Pulsar o tom base" : "Tom contínuo + pulso acrescentado";
  els.presetTitle.textContent = `${baseHz} Hz + ${pulse.name} ${pulse.hz} Hz`;
  els.presetShort.textContent = `${modeText}. ${base.short[pulse.id]} Duty 50%; ADSR ${pulse.attack}s / ${pulse.decay}s / ${normalizeSustain(pulse.sustain)}% / ${pulse.release}s.`;
  els.presetFull.textContent = `${base.intro}\n\n${base.full[pulse.id]}\n\nNota: esta explicação é apresentada como mapeamento simbólico/subjetivo fornecido pelo utilizador. A app apenas gera som.`;
}

function applyPreset(idx, single) {
  const { baseHz, pulse, mode } = getSelectedPreset();
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
  if (single) state.channels.forEach((c, i) => { if (i !== idx) c.active = false; });
  updateUI(); saveStateToStorage(false);
}

function applySequenceRowToSound(row) {
  const pulse = getPulseDefaultsFromHz(parseDecimal(row.pulseHz, 2));
  const ch = state.channels[0];
  ch.active = true;
  ch.freq = clamp(parseDecimal(row.freq, 528), 1, 20000);
  ch.waveform = "sine";
  ch.level = clamp((Number(row.level) || 55) / 100, 0, 1);
  ch.pan = 0;
  ch.pulseEnabled = true;
  ch.pulseHz = clamp(parseDecimal(row.pulseHz, 2), 0.05, 80);
  ch.pulseMode = row.mode === "pulse_base" ? "pulse_base" : "continuous_plus_pulse";
  ch.intensity = 0.45;
  ch.duty = 50;
  ch.attack = Number(pulse.attack);
  ch.decay = Number(pulse.decay);
  ch.sustain = normalizeSustain(pulse.sustain);
  ch.release = Number(pulse.release);
  ch.phase = 0;
  ch.pulsePhase = 0;
  state.channels[1].active = false;
}

function onChannelInput(ev) {
  const i = Number(ev.target.dataset.i);
  const k = ev.target.dataset.k;
  const ch = state.channels[i];
  if (!ch || !k) return;
  if (ev.target.type === "checkbox") ch[k] = ev.target.checked;
  else if (ev.target.type === "range") {
    const v = Number(ev.target.value);
    if (k === "level" || k === "intensity") ch[k] = v / 100;
    else if (k === "pan") ch[k] = v / 100;
    else ch[k] = v;
  } else if (k === "freq") ch[k] = parseDecimal(ev.target.value, ch[k]);
  else if (k === "pulseHz") ch[k] = parseDecimal(ev.target.value, ch[k]);
  else if (ev.target.type === "number") ch[k] = Number(ev.target.value);
  else ch[k] = ev.target.value;
  updateUI({ preserveFocusedInput: true }); saveStateToStorage(false);
}

function onTimerInput(ev) {
  const k = ev.target.id === "timerHours" ? "hours" : "minutes";
  state.timer[k] = Math.max(0, Number(ev.target.value) || 0);
  if (state.running && state.timer.enabled && !state.sequence.running) scheduleManualTimer();
  updateUI(); saveStateToStorage(false);
}

function onSequenceInput(ev) {
  const i = Number(ev.target.dataset.seqI);
  const k = ev.target.dataset.seqK;
  const row = state.sequence.rows[i];
  if (!row || !k) return;
  if (k === "freq" || k === "pulseHz") row[k] = parseDecimal(ev.target.value, row[k]);
  else if (ev.target.type === "number" || ev.target.type === "range") row[k] = Number(ev.target.value);
  else row[k] = ev.target.value;
  updateUI({ preserveFocusedInput: true }); saveStateToStorage(false);
}

function addSequenceFromPreset() {
  const { baseHz, pulse, mode } = getSelectedPreset();
  state.sequence.rows.push({
    label: `Preset ${baseHz} + ${pulse.hz}`,
    freq: baseHz,
    pulseHz: pulse.hz,
    hours: 0,
    minutes: 20,
    mode,
    level: 50,
  });
  buildSequenceUI(); updateUI(); saveStateToStorage(false);
}

function addSequenceCustom() {
  state.sequence.rows.push({
    label: `Etapa ${state.sequence.rows.length + 1}`,
    freq: 528,
    pulseHz: 2,
    hours: 0,
    minutes: 10,
    mode: "continuous_plus_pulse",
    level: 50,
  });
  buildSequenceUI(); updateUI(); saveStateToStorage(false);
}

function removeSequenceRow(idx) {
  if (state.sequence.running) {
    alert("Pare a sequência antes de remover etapas.");
    return;
  }
  state.sequence.rows.splice(idx, 1);
  if (!state.sequence.rows.length) state.sequence.rows = defaultSequenceRows();
  buildSequenceUI(); updateUI(); saveStateToStorage(false);
}

function updateUI({ preserveFocusedInput = false } = {}) {
  els.masterVolume.value = Math.round(state.master * 100);
  els.masterLabel.textContent = `${Math.round(state.master * 100)}%`;
  els.engineState.textContent = state.running ? (state.sequence.running ? "Sequência" : "A tocar") : "Parado";
  els.engineState.className = state.running ? "state-on" : "state-off";
  els.playStop.textContent = state.running ? "Parar" : "Iniciar";
  els.playStop.className = state.running ? "primary stop" : "primary";
  els.installState.textContent = window.matchMedia('(display-mode: standalone)').matches ? "Instalada" : "Web/PWA";

  els.timerEnabled.checked = !!state.timer.enabled;
  els.timerHours.value = clamp(Math.round(Number(state.timer.hours) || 0), 0, 24);
  els.timerMinutes.value = clamp(Math.round(Number(state.timer.minutes) || 0), 0, 59);
  els.timerFields.classList.toggle("timer-fields-visible", !!state.timer.enabled);
  els.timerStrip.classList.toggle("timer-active", !!state.timer.enabled);
  els.timerStatus.textContent = getTimerStatusText();

  els.sequenceLoop.checked = !!state.sequence.loop;

  state.channels.forEach((ch, idx) => {
    for (const el of document.querySelectorAll(`[data-i="${idx}"]`)) {
      const k = el.dataset.k;
      if (!(k in ch)) continue;
      if (preserveFocusedInput && document.activeElement === el) continue;
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

  updateSequenceUIValues();
  updateNowSummary();
  updateSequenceStatusText();
}

function updateSequenceUIValues() {
  state.sequence.rows.forEach((row, idx) => {
    const title = document.querySelector(`[data-seq-title="${idx}"]`);
    if (title) title.textContent = `${idx + 1}. ${row.label || "Etapa"}`;
    const card = document.querySelector(`[data-sequence-row="${idx}"]`);
    if (card) card.classList.toggle("sequence-current", state.sequence.running && idx === state.sequence.index);
    for (const el of document.querySelectorAll(`[data-seq-i="${idx}"]`)) {
      const k = el.dataset.seqK;
      if (!(k in row)) continue;
      if (document.activeElement === el) continue;
      el.value = row[k];
    }
  });
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
  let top = `<strong>${active.length} canal${active.length>1?"es":""} ativo${active.length>1?"s":""}</strong> | Master ${Math.round(state.master*100)}%`;
  if (state.sequence.running) {
    const row = state.sequence.rows[state.sequence.index];
    top += `<br><span class="now-mode">Sequência: ${state.sequence.index + 1}/${state.sequence.rows.length} — ${escapeHtml(row?.label || "Etapa")}${deadlineMs ? ` — faltam ${formatTimeLeft(deadlineMs - Date.now())}` : ""}</span>`;
  } else if (state.timer.enabled) {
    top += `<br><span class="now-mode">Temporizador: ${state.running && deadlineMs ? `faltam ${formatTimeLeft(deadlineMs - Date.now())}` : `duração ${formatDuration(timerSeconds())}`}</span>`;
  } else {
    top += `<br><span class="now-mode">Sem temporizador — reprodução indefinida.</span>`;
  }
  els.nowSummary.innerHTML = top + "<br>" + active.map(c => `${c.name}: ${summarizeChannel(c)}`).join("<br>");
}

function getTimerStatusText() {
  if (state.sequence.running) return deadlineMs ? `Sequência ativa — faltam ${formatTimeLeft(deadlineMs - Date.now())} nesta etapa.` : "Sequência ativa.";
  if (!state.timer.enabled) return "Desligado — reprodução indefinida.";
  const s = timerSeconds();
  if (state.running && deadlineMs) return `Ativo — faltam ${formatTimeLeft(deadlineMs - Date.now())}.`;
  if (s <= 0) return "Ativo, mas defina uma duração superior a zero.";
  return `Ativo — parará após ${formatDuration(s)}.`;
}

function updateSequenceStatusText() {
  if (!state.sequence.running) {
    els.sequenceStatus.textContent = `Sequência parada. Total programado: ${formatDuration(sequenceTotalSeconds())}.`;
    return;
  }
  const row = state.sequence.rows[state.sequence.index];
  els.sequenceStatus.textContent = `A tocar etapa ${state.sequence.index + 1}/${state.sequence.rows.length}: ${row?.label || "Etapa"} — ${fmt(row?.freq || 0)} Hz + ${fmt(row?.pulseHz || 0)} Hz. Faltam ${deadlineMs ? formatTimeLeft(deadlineMs - Date.now()) : "--:--"}.`;
}

async function toggleAudio() {
  if (state.running) stopAudio({ keepSequence: false });
  else await startAudio({ useManualTimer: true });
}

async function startAudio({ useManualTimer = true } = {}) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (processor) processor.disconnect();
  processor = audioCtx.createScriptProcessor(1024, 0, 2);
  state.channels.forEach(ch => { ch.phase = 0; ch.pulsePhase = 0; ch.startedAtSample = sampleCounter; });
  processor.onaudioprocess = processAudio;
  processor.connect(audioCtx.destination);
  state.running = true;
  if (useManualTimer && !state.sequence.running) scheduleManualTimer();
  ensureCountdownInterval();
  updateUI();
}

function stopAudio({ keepSequence = false } = {}) {
  state.running = false;
  if (!keepSequence) state.sequence.running = false;
  clearManualTimer();
  clearSequenceTimer();
  clearCountdownInterval();
  deadlineMs = null;
  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    processor = null;
  }
  updateUI();
}

function clearManualTimer() {
  if (manualTimerId) clearTimeout(manualTimerId);
  manualTimerId = null;
  if (!state.sequence.running) deadlineMs = null;
}
function clearSequenceTimer() {
  if (sequenceTimerId) clearTimeout(sequenceTimerId);
  sequenceTimerId = null;
}
function clearCountdownInterval() {
  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = null;
}
function ensureCountdownInterval() {
  if (countdownIntervalId) return;
  countdownIntervalId = setInterval(updateUI, 1000);
}

function timerSeconds() {
  return clamp(Math.floor((Number(state.timer.hours) || 0) * 3600 + (Number(state.timer.minutes) || 0) * 60), 0, 24 * 3600 + 59 * 60);
}
function rowSeconds(row) {
  return clamp(Math.floor((Number(row.hours) || 0) * 3600 + (Number(row.minutes) || 0) * 60), 0, 24 * 3600 + 59 * 60);
}
function sequenceTotalSeconds() {
  return state.sequence.rows.reduce((acc, row) => acc + rowSeconds(row), 0);
}

function scheduleManualTimer() {
  clearManualTimer();
  if (!state.timer.enabled) return;
  const s = timerSeconds();
  if (s <= 0) return;
  deadlineMs = Date.now() + s * 1000;
  manualTimerId = setTimeout(() => stopAudio({ keepSequence: false }), s * 1000);
}

async function startSequence() {
  if (!state.sequence.rows.length) {
    alert("Adicione pelo menos uma etapa à sequência.");
    return;
  }
  const firstPlayable = state.sequence.rows.findIndex(r => rowSeconds(r) > 0);
  if (firstPlayable < 0) {
    alert("Defina duração superior a zero em pelo menos uma etapa.");
    return;
  }
  clearManualTimer();
  clearSequenceTimer();
  state.sequence.running = true;
  state.sequence.index = firstPlayable;
  await startSequenceStep(state.sequence.index);
}

async function startSequenceStep(idx) {
  const row = state.sequence.rows[idx];
  if (!row) {
    finishSequence();
    return;
  }
  const seconds = rowSeconds(row);
  if (seconds <= 0) {
    advanceSequence();
    return;
  }
  state.sequence.index = idx;
  state.sequence.running = true;
  applySequenceRowToSound(row);
  deadlineMs = Date.now() + seconds * 1000;
  clearSequenceTimer();
  sequenceTimerId = setTimeout(advanceSequence, seconds * 1000);
  if (!state.running) await startAudio({ useManualTimer: false });
  else {
    state.channels.forEach(ch => { ch.phase = 0; ch.pulsePhase = 0; });
    ensureCountdownInterval();
    updateUI();
  }
}

function advanceSequence() {
  if (!state.sequence.running) return;
  let next = state.sequence.index + 1;
  while (next < state.sequence.rows.length && rowSeconds(state.sequence.rows[next]) <= 0) next++;
  if (next >= state.sequence.rows.length) {
    if (state.sequence.loop) {
      next = state.sequence.rows.findIndex(r => rowSeconds(r) > 0);
      if (next >= 0) startSequenceStep(next);
      else finishSequence();
    } else finishSequence();
  } else startSequenceStep(next);
}

function finishSequence() {
  state.sequence.running = false;
  stopAudio({ keepSequence: false });
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
      l += sample * Math.cos(angle);
      r += sample * Math.sin(angle);
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
    if (ch.pulseMode === "pulse_base") amp = (1 - ch.intensity) + ch.intensity * env;
    else amp = (1 + ch.intensity * env) / (1 + ch.intensity);
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
  const serializable = {
    master: state.master,
    timer: {...state.timer},
    sequence: {
      rows: state.sequence.rows.map(r => ({...r})),
      loop: !!state.sequence.loop,
      running: false,
      index: 0,
    },
    channels: state.channels.map(c => ({...c, phase:0, pulsePhase:0, startedAtSample:0})),
  };
  localStorage.setItem("synthlabIsoStateV64", JSON.stringify(serializable));
  if (show) alert("Estado guardado neste browser/telemóvel.");
}

function loadStateFromStorage(show) {
  const raw = localStorage.getItem("synthlabIsoStateV64") || localStorage.getItem("synthlabIsoStateV6") || localStorage.getItem("synthlabIsoState");
  if (!raw) { if (show) alert("Ainda não existe estado guardado."); return; }
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.master === "number") state.master = obj.master;
    if (obj.timer) state.timer = {...state.timer, ...obj.timer, enabled: !!obj.timer.enabled};
    if (obj.sequence) {
      state.sequence = {
        rows: Array.isArray(obj.sequence.rows) && obj.sequence.rows.length ? obj.sequence.rows.map(cleanSequenceRow) : defaultSequenceRows(),
        running: false,
        index: 0,
        loop: !!obj.sequence.loop,
      };
    }
    if (Array.isArray(obj.channels)) {
      state.channels = [0,1].map(i => ({...defaultChannel(`Canal ${i+1}`), ...(obj.channels[i] || {})}));
      buildChannelUI();
    }
    buildSequenceUI();
    updateUI();
    if (show) alert("Estado carregado.");
  } catch (err) {
    console.error(err);
    if (show) alert("Não foi possível carregar o estado guardado.");
  }
}

function cleanSequenceRow(row) {
  return {
    label: String(row.label || "Etapa"),
    freq: clamp(parseDecimal(row.freq, 528), 1, 20000),
    pulseHz: clamp(parseDecimal(row.pulseHz, 2), 0.05, 80),
    hours: clamp(Math.round(Number(row.hours) || 0), 0, 24),
    minutes: clamp(Math.round(Number(row.minutes) || 0), 0, 59),
    mode: row.mode === "pulse_base" ? "pulse_base" : "continuous_plus_pulse",
    level: clamp(Math.round(Number(row.level) || 50), 0, 100),
  };
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

function formatDuration(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min${sec ? ` ${sec} s` : ""}`;
  if (m > 0) return `${m} min${sec ? ` ${sec} s` : ""}`;
  return `${sec} s`;
}
function formatTimeLeft(ms) { return formatDuration(Math.max(0, Math.ceil((Number(ms) || 0) / 1000))); }
function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"}[c]));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js?v=6_4").catch(err => console.warn("SW não registado:", err));
  }
}
