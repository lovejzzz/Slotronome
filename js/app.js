// Audio Context setup
let audioContext;
let metronomeInterval;
let currentBeat = 0;
let currentBar = 0;
let isPlaying = false;
let tempo = 90;
let timeSignature = {
    numerator: 4,
    denominator: 4
};
let accentBeats = [0]; // 0-indexed, first beat is accented by default
let barsToChange = 0; // Changed from 4 to 0 (default: no automatic tempo change)
let changeType = 'random';
let incrementValue = 2;
let isLimitIncrement = true; // Whether increment mode should be limited by min/max range
let isAtMinLimit = false;
let isAtMaxLimit = false;

// Audio samples
let bassDrumBuffer = null;
let snareBuffer = null;
let audioSamplesLoaded = false;

// For gear interaction
let isDraggingGear = false;
let lastY = 0;
let gearRotation = 0;
let dragDistance = 0;
let tempoChangeThreshold = 8; // Pixels needed to move before changing BPM
let gearRotationPerBPM = 8; // Degrees to rotate per BPM change

// Add these new variables near the top of the file with other variables
let isDraggingDigit = false;
let currentDraggedDigit = null;
let digitDragStartY = 0;
let digitDragSensitivity = 8; // Pixels to drag before changing digit value

// Add these new variables near the top of the file with other variables
let isDraggingMinTempo = false;
let isDraggingMaxTempo = false;
let minTempoStartY = 0;
let maxTempoStartY = 0;
let minMaxDragSensitivity = 5; // Pixels to drag before changing value

// DOM Elements
const hundredsRoller = document.getElementById('hundreds-roller');
const tensRoller = document.getElementById('tens-roller');
const onesRoller = document.getElementById('ones-roller');
const slotHandle = document.getElementById('slot-handle');
const startStopBtn = document.getElementById('start-stop-btn');
const accentButtonsContainer = document.getElementById('accent-buttons');
const minTempoInput = document.getElementById('min-tempo');
const maxTempoInput = document.getElementById('max-tempo');
const timeSignatureSelect = document.getElementById('time-signature');
const timeSignatureDisplay = document.getElementById('time-sig-display'); // New time signature display
const timeSignaturePopup = document.getElementById('time-signature-popup'); // New time signature popup
const barsToChangeInput = document.getElementById('bars-to-change');
const changeTypeSelect = document.getElementById('change-type');
const incrementValueInput = document.getElementById('increment-value');
const incrementContainer = document.getElementById('increment-container');
const tempoDisplay = document.querySelector('.tempo-display');
const tempoGear = document.getElementById('tempo-gear');
const tempoInputOverlay = document.getElementById('tempo-input-overlay');
const directTempoInput = document.getElementById('direct-tempo-input');
const cancelTempoBtn = document.getElementById('cancel-tempo-btn');
const applyTempoBtn = document.getElementById('apply-tempo-btn');

// The Limit constraint only means anything while the tempo sits inside the
// min/max range, so moving outside it releases the constraint rather than
// yanking the tempo back. Flash the control on the way out — the checkbox used
// to clear itself with no feedback at all, which read as a glitch.
function releaseLimitConstraint() {
    if (!isLimitIncrement) return;

    const limitCheckbox = document.getElementById('limit-increment');
    if (!limitCheckbox) return;

    limitCheckbox.checked = false;
    isLimitIncrement = false;

    const control = limitCheckbox.closest('.limit-checkbox');
    if (!control) return;

    sfxLimitRelease();

    control.classList.remove('limit-released');
    void control.offsetWidth; // restart the animation on repeat releases
    control.classList.add('limit-released');
    setTimeout(() => control.classList.remove('limit-released'), 900);
}

/* ==========================================================================
   Sound effects
   Synthesised through the existing AudioContext rather than shipped as files,
   so the cabinet stays asset-free. These replace a set of base64 MP3 blobs
   that were too short to decode — every lever pull logged "no supported
   source was found" and played nothing.
   ========================================================================== */

let sfxBusNode = null;
let sfxNoiseBuffer = null;
let sfxEnabled = true;

const SFX_STORAGE_KEY = 'slotronome.sfx';

// The metronome click is the point of the app, so this only silences the
// cabinet noises — lever, reels, blips — never the beat itself.
function setSfxEnabled(on, { persist = true } = {}) {
    sfxEnabled = !!on;

    const button = document.getElementById('sfx-toggle');
    if (button) {
        button.classList.toggle('muted', !sfxEnabled);
        button.setAttribute('aria-pressed', String(sfxEnabled));
        button.setAttribute('aria-label', `Cabinet sound effects ${sfxEnabled ? 'on' : 'off'}`);
    }

    if (persist) {
        // Unavailable in some privacy modes and on some file:// origins
        try {
            localStorage.setItem(SFX_STORAGE_KEY, sfxEnabled ? 'on' : 'off');
        } catch {
            /* preference just won't survive a reload */
        }
    }
}

function loadSfxPreference() {
    let stored = null;
    try {
        stored = localStorage.getItem(SFX_STORAGE_KEY);
    } catch {
        /* fall through to the default */
    }
    setSfxEnabled(stored !== 'off', { persist: false });
}

// Effects share one bus, kept well under the metronome so the click stays the
// loudest thing in the room.
function sfxBus() {
    if (!sfxEnabled || !audioContext) return null;
    if (!sfxBusNode) {
        sfxBusNode = audioContext.createGain();
        sfxBusNode.gain.value = 0.8;
        sfxBusNode.connect(audioContext.destination);
    }
    return sfxBusNode;
}

function sfxNoise() {
    if (!sfxNoiseBuffer && audioContext) {
        const length = Math.floor(audioContext.sampleRate * 0.4);
        sfxNoiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
        const data = sfxNoiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return sfxNoiseBuffer;
}

// Every effect is triggered by a user gesture, so it is safe to spin the
// context up lazily here.
function sfxReady() {
    if (!sfxEnabled) return false;
    if (!audioContext) initAudioContext();
    if (!audioContext) return false;
    if (audioContext.state === 'suspended') audioContext.resume();
    return true;
}

// A filtered burst of noise — the percussive half of most of these effects.
function sfxBurst({ duration = 0.08, gain = 0.3, type = 'bandpass', freq = 1200, q = 1, delay = 0 }) {
    const bus = sfxBus();
    const buffer = sfxNoise();
    if (!bus || !buffer) return;

    const t = audioContext.currentTime + delay;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const env = audioContext.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(bus);
    source.start(t);
    source.stop(t + duration);
}

// A pitched blip, optionally sliding from one frequency to another.
function sfxTone({ freq = 440, endFreq = null, type = 'square', duration = 0.1, gain = 0.15, delay = 0 }) {
    const bus = sfxBus();
    if (!bus) return;

    const t = audioContext.currentTime + delay;
    const osc = audioContext.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + duration);

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.02);
}

// Lever hauled down: a ratchet, then the mechanism catching.
function sfxLeverPull() {
    if (!sfxReady()) return;
    for (let i = 0; i < 5; i++) {
        sfxBurst({ duration: 0.03, gain: 0.55, type: 'bandpass', freq: 2600 - i * 260, q: 3, delay: i * 0.035 });
    }
    sfxTone({ freq: 260, endFreq: 90, type: 'sawtooth', duration: 0.18, gain: 0.16, delay: 0.02 });
}

// Lever springing back to rest.
function sfxLeverRelease() {
    if (!sfxReady()) return;
    sfxBurst({ duration: 0.09, gain: 0.24, type: 'highpass', freq: 2200 });
    sfxTone({ freq: 520, endFreq: 300, type: 'triangle', duration: 0.12, gain: 0.09 });
}

// One digit rolling past the window.
function sfxReelTick() {
    if (!audioContext) return;
    sfxBurst({ duration: 0.018, gain: 0.11, type: 'highpass', freq: 3200 });
}

// A reel dropping into its detent — pitched down as you go left to right so
// the three stops read as a descending sequence.
function sfxReelStop(index) {
    if (!audioContext) return;
    sfxBurst({ duration: 0.05, gain: 0.3, type: 'lowpass', freq: 900 });
    sfxTone({ freq: [220, 175, 140][index] || 160, endFreq: 60, type: 'triangle', duration: 0.14, gain: 0.22 });
}

// Played only when switching effects back on, so you hear what you enabled.
function sfxToggle_confirm() {
    if (!sfxReady()) return;
    sfxTone({ freq: 620, duration: 0.06, gain: 0.12 });
    sfxTone({ freq: 930, duration: 0.09, gain: 0.1, delay: 0.06 });
}

// A symbol landing: a bright arpeggio over the detent thunk.
function sfxSymbolHit() {
    if (!sfxReady()) return;
    sfxBurst({ duration: 0.06, gain: 0.28, type: 'lowpass', freq: 1100 });
    [660, 880, 1320].forEach((freq, i) => {
        sfxTone({ freq, type: 'triangle', duration: 0.13, gain: 0.14, delay: 0.05 + i * 0.075 });
    });
}

function sfxTransport(starting) {
    if (!sfxReady()) return;
    if (starting) {
        sfxTone({ freq: 440, duration: 0.07, gain: 0.13 });
        sfxTone({ freq: 660, duration: 0.11, gain: 0.13, delay: 0.07 });
    } else {
        sfxTone({ freq: 550, duration: 0.07, gain: 0.12 });
        sfxTone({ freq: 330, duration: 0.13, gain: 0.12, delay: 0.07 });
    }
}

function sfxToggle(on) {
    if (!sfxReady()) return;
    sfxTone({ freq: on ? 720 : 460, type: 'square', duration: 0.055, gain: 0.1 });
    sfxBurst({ duration: 0.02, gain: 0.1, type: 'highpass', freq: 3000 });
}

// The Limit constraint letting go — pairs with the checkbox flash.
function sfxLimitRelease() {
    if (!audioContext) return;
    sfxTone({ freq: 880, endFreq: 420, type: 'triangle', duration: 0.16, gain: 0.11 });
}

/* ==========================================================================
   Reel symbols and modifiers

   A pull very occasionally lands a symbol instead of a digit. The symbol holds
   for a moment, the reel nudges on to reveal the real digit, and the symbol's
   modifier runs for a few bars before reverting itself.

   Every modifier is a practice technique rather than an arbitrary effect — if a
   teacher wouldn't ask you to do it, it doesn't belong on the strip. The tempo
   is still chosen before the spin starts, so none of this can corrupt the
   metronome; the symbol is theatre plus a trigger.
   ========================================================================== */

const SYMBOL_SLOT_HOLD_MS = 1000;   // how long a landed symbol sits before the nudge
const SYMBOL_CHANCE = 1 / 12;       // per lever pull, before the cooldown
let symbolCooldown = 0;             // pulls remaining before another can land
let modifiersEnabled = true;
let activeModifier = null;
let beatButtons = [];      // cached per meter; the beat path must not query the DOM
let litBeatButton = null;

const MODIFIERS_STORAGE_KEY = 'slotronome.modifiers';
const COLLECTION_STORAGE_KEY = 'slotronome.collection';

const REEL_SYMBOLS = [
    {
        id: 'cherry',
        name: 'Cherry',
        owns: 'tempo',
        blurb: 'Half time for 2 bars',
        weight: 38,
        bars: 2,
        apply() {
            // Whichever direction there is room for; halving is the more useful
            // drill, so prefer it unless the tempo is already crawling.
            const halved = tempo >= 80;
            const previous = tempo;
            const next = Math.max(10, Math.min(500, halved ? Math.round(tempo / 2) : tempo * 2));
            this.blurb = halved ? 'Half time for 2 bars' : 'Double time for 2 bars';
            applyTempoQuietly(next);
            return () => applyTempoQuietly(previous);
        }
    },
    {
        id: 'bell',
        name: 'Bell',
        owns: 'accents',
        blurb: 'Accent moves for 8 bars',
        weight: 25,
        bars: 8,
        apply() {
            const previous = [...accentBeats];
            const choices = [];
            for (let i = 1; i < timeSignature.numerator; i++) choices.push(i);
            if (!choices.length) return () => {};
            accentBeats = [choices[Math.floor(Math.random() * choices.length)]];
            refreshAccentButtons();
            return () => { accentBeats = previous; refreshAccentButtons(); };
        }
    },
    {
        id: 'bar',
        name: 'Bar',
        blurb: 'Silent bar — keep time',
        weight: 18,
        bars: 1,
        blackout: true,
        apply() { return () => {}; }
    },
    {
        id: 'seven',
        name: 'Seven',
        owns: 'meter',
        blurb: 'Seven eight for 4 bars',
        weight: 11,
        bars: 4,
        apply() {
            const previous = { ...timeSignature };
            const previousAccents = [...accentBeats];
            timeSignature = { numerator: 7, denominator: 8 };
            accentBeats = [0];
            currentBeat = 0;
            createAccentButtons();
            updateTimeSignatureDisplay();
            return () => {
                timeSignature = previous;
                accentBeats = previousAccents;
                currentBeat = 0;
                createAccentButtons();
                updateTimeSignatureDisplay();
            };
        }
    },
    {
        id: 'diamond',
        name: 'Diamond',
        blurb: 'Two bars, no sound, no lights',
        weight: 8,
        bars: 2,
        blackout: true,
        lightsOut: true,
        apply() { return () => {}; }
    }
];

// Pixel-flavoured sprites, drawn in currentColor so they pick up the reels'
// amber glow. crispEdges keeps them from going soft against the digits.
const SYMBOL_ART = {
    cherry: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M12 3h2v2h-2zM14 5h2v2h-2zM16 7h2v2h-2zM10 5h-2v2h2zM8 7h-2v2h2z" fill="currentColor"/><circle cx="6" cy="16" r="4.5" fill="currentColor"/><circle cx="17" cy="17" r="4" fill="currentColor"/><path d="M13 2h5v2h-5z" fill="currentColor"/></svg>',
    bell: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M11 2h2v2h-2zM9 4h6v2H9zM7 6h10v8H7zM5 14h14v3H5zM10 18h4v3h-4z" fill="currentColor"/></svg>',
    bar: '<svg viewBox="0 0 40 24" shape-rendering="crispEdges"><rect x="1" y="4" width="38" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><text x="20" y="17" text-anchor="middle" font-size="10" fill="currentColor" font-family="inherit">BAR</text></svg>',
    seven: '<svg viewBox="0 0 24 30" shape-rendering="crispEdges"><text x="12" y="12" text-anchor="middle" font-size="12" fill="currentColor" font-family="inherit">7</text><rect x="3" y="14" width="18" height="2" fill="currentColor"/><text x="12" y="28" text-anchor="middle" font-size="12" fill="currentColor" font-family="inherit">8</text></svg>',
    diamond: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M12 1 23 12 12 23 1 12z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 6 18 12 12 18 6 12z" fill="currentColor"/></svg>'
};

function randomSymbol() {
    const total = REEL_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
    let roll = Math.random() * total;
    for (const symbol of REEL_SYMBOLS) {
        roll -= symbol.weight;
        if (roll <= 0) return symbol;
    }
    return REEL_SYMBOLS[0];
}

function setReelSymbol(roller, symbol) {
    const slot = roller.querySelector('.digit-symbol');
    if (!slot) return;
    slot.innerHTML = SYMBOL_ART[symbol.id] || '';
    slot.dataset.symbol = symbol.id;
}

// Change the tempo without touching the at-limit flags or releasing Limit — a
// modifier is a temporary detour, not the user setting a new tempo.
function applyTempoQuietly(next) {
    tempo = Math.max(10, Math.min(500, next));
    updateTempoDisplay(tempo);
    rescheduleTransport();
}

function refreshAccentButtons() {
    document.querySelectorAll('.accent-button').forEach(button => {
        const index = parseInt(button.dataset.beatIndex);
        const on = accentBeats.includes(index);
        button.classList.toggle('accent', on);
        button.setAttribute('aria-pressed', String(on));
    });
}

/* --- running a modifier -------------------------------------------------- */

function startModifier(symbol) {
    if (activeModifier) endModifier();

    const revert = symbol.apply();
    activeModifier = {
        symbol,
        barsLeft: symbol.bars,
        blackout: !!symbol.blackout,
        lightsOut: !!symbol.lightsOut,
        revert
    };

    document.body.classList.add('modifier-active');
    document.body.classList.toggle('modifier-blackout', !!symbol.blackout);
    showModifierBanner(symbol);
    announce(`${symbol.name}. ${symbol.blurb}`);
}

function endModifier() {
    if (!activeModifier) return;
    try {
        activeModifier.revert();
    } finally {
        activeModifier = null;
        document.body.classList.remove('modifier-active', 'modifier-blackout');
    }
}

// If the user changes the thing a modifier had taken over, their intent wins:
// the modifier steps aside *without* restoring its snapshot, which would
// otherwise quietly undo what they just did a few bars later.
function releaseModifierOwning(domain) {
    if (!activeModifier || activeModifier.symbol.owns !== domain) return;
    activeModifier = null;
    document.body.classList.remove('modifier-active', 'modifier-blackout');
}

// Called once per completed bar from the scheduler.
function tickModifier() {
    if (!activeModifier) return;
    activeModifier.barsLeft--;
    if (activeModifier.barsLeft <= 0) endModifier();
}

function showModifierBanner(symbol) {
    const banner = document.getElementById('modifier-banner');
    if (!banner) return;
    banner.innerHTML =
        `<span class="modifier-mark">${SYMBOL_ART[symbol.id] || ''}</span>` +
        `<span class="modifier-text"><strong>${symbol.name}</strong>${symbol.blurb}</span>`;
    banner.classList.add('visible');
    clearTimeout(showModifierBanner.timer);
    showModifierBanner.timer = setTimeout(() => banner.classList.remove('visible'), 2600);
}

/* --- the collection plate ------------------------------------------------- */

function loadCollection() {
    try {
        return new Set(JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function recordSymbolFound(symbol) {
    const found = loadCollection();
    const isNew = !found.has(symbol.id);
    found.add(symbol.id);
    try {
        localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify([...found]));
    } catch {
        /* the plate just won't persist */
    }
    renderCollection();
    if (isNew) {
        const slot = document.querySelector(`.collection-slot[data-symbol="${symbol.id}"]`);
        if (slot) {
            slot.classList.add('just-found');
            setTimeout(() => slot.classList.remove('just-found'), 2000);
        }
    }
    return isNew;
}

function renderCollection() {
    const strip = document.getElementById('collection-strip');
    if (!strip) return;
    const found = loadCollection();
    strip.innerHTML = REEL_SYMBOLS.map(symbol =>
        `<span class="collection-slot${found.has(symbol.id) ? ' found' : ''}" data-symbol="${symbol.id}" ` +
        `title="${found.has(symbol.id) ? symbol.name + ' — ' + symbol.blurb : 'Not yet found'}" ` +
        `aria-label="${symbol.name}: ${found.has(symbol.id) ? 'found' : 'not yet found'}">${SYMBOL_ART[symbol.id]}</span>`
    ).join('');
}

/* --- the modifiers toggle -------------------------------------------------- */

function setModifiersEnabled(on, { persist = true } = {}) {
    modifiersEnabled = !!on;

    const button = document.getElementById('luck-toggle');
    if (button) {
        button.classList.toggle('muted', !modifiersEnabled);
        button.setAttribute('aria-pressed', String(modifiersEnabled));
        button.setAttribute('aria-label', `Reel symbols ${modifiersEnabled ? 'on' : 'off'}`);
    }
    if (!modifiersEnabled) endModifier();

    if (persist) {
        try {
            localStorage.setItem(MODIFIERS_STORAGE_KEY, modifiersEnabled ? 'on' : 'off');
        } catch {
            /* preference just won't survive a reload */
        }
    }
}

function loadModifiersPreference() {
    let stored = null;
    try {
        stored = localStorage.getItem(MODIFIERS_STORAGE_KEY);
    } catch {
        /* fall through to the default */
    }
    setModifiersEnabled(stored !== 'off', { persist: false });
}

// Decide whether this pull lands a symbol, and on which reel.
function rollForSymbol() {
    if (!modifiersEnabled) return null;
    if (symbolCooldown > 0) {
        symbolCooldown--;
        return null;
    }
    if (Math.random() >= SYMBOL_CHANCE) return null;

    symbolCooldown = 1;   // never twice running; scarcity is the whole point
    return { symbol: randomSymbol(), reelIndex: Math.floor(Math.random() * 3) };
}

// Restart the beat timer so a tempo change takes effect on the next click
// rather than at the end of the current interval.
function rescheduleTransport() {
    if (!isPlaying) return;
    clearInterval(metronomeInterval);
    metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
}

// Single funnel for every manual tempo change — reels, gear, lever, steppers,
// keyboard and the Set BPM dialog all land here. Clamps to the absolute
// 10-500 range, refreshes the at-limit indicators, releases Limit when the
// value leaves the user's window, then applies and reschedules.
//
// This used to be copy-pasted at seven call sites, which is how the digit-wrap
// and stranded-indicator bugs managed to exist in two places at once.
function commitTempo(newTempo) {
    releaseModifierOwning('tempo');

    newTempo = parseInt(newTempo);
    if (Number.isNaN(newTempo)) return tempo;

    const previousTempo = tempo;
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);

    newTempo = Math.max(10, Math.min(500, newTempo));

    isAtMinLimit = false;
    isAtMaxLimit = false;
    if (newTempo <= minTempo && previousTempo > minTempo) {
        isAtMinLimit = true;
    } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
        isAtMaxLimit = true;
    }

    if (newTempo < minTempo || newTempo > maxTempo) {
        releaseLimitConstraint();
    }

    tempo = newTempo;
    updateTempoDisplay(tempo);
    rescheduleTransport();
    return tempo;
}

// Initialize Audio Context (on user interaction)
function initAudioContext() {
    if (!audioContext) {
        try {
            console.log('Creating new audio context');
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created with state:', audioContext.state);
            // Load audio samples
            loadAudioSamples();
            return true;
        } catch (error) {
            console.error('Failed to create audio context:', error);
            return false;
        }
    } else {
        console.log('Audio context already exists with state:', audioContext.state);
        return true;
    }
}

// Function to manually force reload audio samples
function forceReloadAudioSamples() {
    console.log('Forcing reload of audio samples...');
    
    // Reset loaded flag
    audioSamplesLoaded = false;
    bassDrumBuffer = null;
    snareBuffer = null;
    
    // Ensure audio context is initialized and resumed
    if (!audioContext) {
        const initialized = initAudioContext();
        if (!initialized) {
            console.error('Could not initialize audio context for reload');
            return;
        }
    }
    
    // Make sure context is running
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('Audio context resumed for forced reload');
            loadAudioSamples();
        });
    } else {
        loadAudioSamples();
    }
}

// Load audio samples for the metronome
function loadAudioSamples() {
    if (audioSamplesLoaded) {
        console.log('Audio samples already loaded, skipping');
        return;
    }
    
    console.log('Attempting to load audio samples...');
    
    // Reset the audio samples loaded flag to ensure both samples are loaded
    audioSamplesLoaded = false;
    
    // Log what we're looking for
    console.log('Fetching from: ' + new URL('./Audio/BassDrum.mp3', window.location.href).href);
    console.log('Fetching from: ' + new URL('./Audio/Snare.wav', window.location.href).href);
    
    // Create promises for loading both samples
    const loadBassDrum = fetch('./Audio/BassDrum.mp3')
        .then(response => {
            if (!response.ok) {
                console.error(`Failed to load BassDrum.mp3: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to load BassDrum.mp3: ${response.status} ${response.statusText}`);
            }
            console.log('BassDrum.mp3 fetch successful');
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            console.log('BassDrum.mp3 buffer received, size:', arrayBuffer.byteLength);
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
            console.log('BassDrum.mp3 decoded successfully');
            bassDrumBuffer = audioBuffer;
            return true;
        })
        .catch(error => {
            console.error('Error loading bass drum sample:', error);
            return false;
        });
    
    const loadSnare = fetch('./Audio/Snare.wav')
        .then(response => {
            if (!response.ok) {
                console.error(`Failed to load Snare.wav: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to load Snare.wav: ${response.status} ${response.statusText}`);
            }
            console.log('Snare.wav fetch successful');
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            console.log('Snare.wav buffer received, size:', arrayBuffer.byteLength);
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
            console.log('Snare.wav decoded successfully');
            snareBuffer = audioBuffer;
            return true;
        })
        .catch(error => {
            console.error('Error loading snare sample:', error);
            return false;
        });
    
    // Wait for both samples to load
    Promise.all([loadBassDrum, loadSnare])
        .then(results => {
            // Both samples loaded successfully if both results are true
            audioSamplesLoaded = results[0] && results[1];
            console.log('Audio samples loaded status:', audioSamplesLoaded);
            console.log('BassDrum buffer:', bassDrumBuffer ? 'LOADED' : 'NULL');
            console.log('Snare buffer:', snareBuffer ? 'LOADED' : 'NULL');
            
            if (!audioSamplesLoaded) {
                console.warn('Some audio samples failed to load, will use fallback sounds');
            }
        });
}

// Generate a click sound
function playClick(time, isAccent) {
    // Ensure audio context is running
    if (audioContext.state !== 'running') {
        console.log('Audio context not running, attempting to resume');
        audioContext.resume();
    }
    
    // Check if samples are loaded AND the specific buffer we need exists
    const useBassDrum = audioSamplesLoaded && isAccent && bassDrumBuffer;
    const useSnare = audioSamplesLoaded && !isAccent && snareBuffer;
    
    // Use oscillator as fallback if samples haven't loaded or the needed buffer doesn't exist
    if (!useBassDrum && !useSnare) {
        // Fallback to oscillator-based sound
        const clickOscillator = audioContext.createOscillator();
        const clickGain = audioContext.createGain();
        
        // Different frequency for accented beat
        clickOscillator.frequency.value = isAccent ? 1500 : 1000;
        
        clickGain.gain.value = 0.3;
        clickOscillator.connect(clickGain);
        clickGain.connect(audioContext.destination);
        
        clickOscillator.start(time);
        clickOscillator.stop(time + 0.02);
        
        return;
    }
    
    // Play the appropriate sample based on whether it's an accented beat
    const buffer = isAccent ? bassDrumBuffer : snareBuffer;
    
    if (buffer) {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        
        // Adjust volume levels for better distinction
        gainNode.gain.value = isAccent ? 0.7 : 0.5; // Increased volumes for both with more contrast
        
        // Add a slight compression/distortion to make the samples more punchy
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        
        // Connect the audio graph: source -> gain -> compressor -> destination
        source.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(audioContext.destination);
        
        source.start(time);
    } else {
        console.error(`Buffer not available for ${isAccent ? 'BassDrum' : 'Snare'} despite samples being loaded`);
    }
}

// Schedule the next beat
function scheduleNextBeat() {
    // Guard the invariant at the point of use, so no future path can sound a
    // beat index that no longer exists in the current meter.
    if (currentBeat >= timeSignature.numerator) currentBeat = 0;

    const beatTime = audioContext.currentTime;
    const isAccent = accentBeats.includes(currentBeat);

    // A blackout modifier keeps the beat running but silences it — the whole
    // point is that you carry the pulse yourself for a bar.
    if (!activeModifier || !activeModifier.blackout) {
        playClick(beatTime, isAccent);
    }

    // Move the light on. This used to querySelectorAll every accent button and
    // clear them all on every single beat, which is real main-thread work at
    // fast tempos — and this callback is what the click's timing rides on.
    if (litBeatButton) {
        litBeatButton.classList.remove('active');
        litBeatButton = null;
    }

    // Diamond takes the beat lights away too, so there is nothing left to
    // follow. Every other modifier leaves them as a crutch.
    if (!activeModifier || !activeModifier.lightsOut) {
        const currentBeatButton = beatButtons[currentBeat];
        if (currentBeatButton) {
            currentBeatButton.classList.add('active');
            litBeatButton = currentBeatButton;
        }
    }

    // Advance to next beat
    currentBeat = (currentBeat + 1) % timeSignature.numerator;

    // If we've completed a bar
    if (currentBeat === 0) {
        currentBar++;
        tickModifier();

        // Check if we need to change tempo (only if barsToChange > 0)
        if (barsToChange > 0 && currentBar % barsToChange === 0) {
            changeMetronomeTempo();
        }
    }
}

// Change the metronome tempo based on settings
function changeMetronomeTempo() {
    releaseModifierOwning('tempo');
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // If min and max are the same, keep that tempo (regular metronome)
    if (minTempo === maxTempo) {
        tempo = minTempo;
    } else if (changeType === 'random') {
        // Generate a random tempo within the min-max range
        tempo = Math.floor(Math.random() * (maxTempo - minTempo + 1)) + minTempo;
        
        // Check if at min/max for animation
        if (tempo <= minTempo) {
            isAtMinLimit = true;
        } else if (tempo >= maxTempo) {
            isAtMaxLimit = true;
        }
    } else if (changeType === 'increment') {
        // Increment the tempo by the increment value
        tempo += parseInt(incrementValue);
        
        // Only enforce the absolute limits (10-500)
        if (tempo < 10) {
            tempo = 10;
            isAtMinLimit = true;
        } else if (tempo > 500) {
            tempo = 500;
            isAtMaxLimit = true;
        }
        
        // If limit is enabled, then enforce the min-max range
        if (isLimitIncrement) {
            if (tempo < minTempo) {
                tempo = minTempo;
                isAtMinLimit = true;
            } else if (tempo > maxTempo) {
                tempo = maxTempo;
                isAtMaxLimit = true;
            }
        } else {
            // When not limiting, only show visual indicators if we just crossed the boundary
            if (tempo <= minTempo && previousTempo > minTempo) {
                isAtMinLimit = true;
            } else if (tempo >= maxTempo && previousTempo < maxTempo) {
                isAtMaxLimit = true;
            }
            
            // Leaving the min/max range releases the Limit constraint
            if (tempo < minTempo || tempo > maxTempo) {
                releaseLimitConstraint();
            }
        }
    }
    
    // Update the display with animation
    updateTempoDisplay(tempo);
    
    // Restart the interval with new tempo
    if (isPlaying) {
        clearInterval(metronomeInterval);
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
    }
}

// Update the tempo display with slot machine animation
function updateTempoDisplay(newTempo) {
    const hundreds = Math.floor(newTempo / 100);
    const tens = Math.floor((newTempo % 100) / 10);
    const ones = newTempo % 10;
    
    // Get the container elements
    const hundredsContainer = hundredsRoller.parentElement;
    const tensContainer = tensRoller.parentElement;
    const onesContainer = onesRoller.parentElement;
    
    // Remove any existing limit animations
    hundredsContainer.classList.remove('at-limit');
    tensContainer.classList.remove('at-limit');
    onesContainer.classList.remove('at-limit');
    
    // Calculate the rotation for each roller
    // Each digit is 80px high
    const hundredsRotation = -(hundreds * 80);
    const tensRotation = -(tens * 80);
    const onesRotation = -(ones * 80);
    
    // Apply the rotation with animation
    hundredsRoller.style.transform = `translateY(${hundredsRotation}px)`;
    tensRoller.style.transform = `translateY(${tensRotation}px)`;
    onesRoller.style.transform = `translateY(${onesRotation}px)`;
    
    // Add limit animation if at min/max
    if (isAtMinLimit || isAtMaxLimit) {
        setTimeout(() => {
            hundredsContainer.classList.add('at-limit');
            tensContainer.classList.add('at-limit');
            onesContainer.classList.add('at-limit');
        }, 500); // Delay to allow the roller animation to complete
    }

    // Keep the assistive-tech view of the reels in step with the pixels
    hundredsContainer.setAttribute('aria-valuenow', hundreds);
    tensContainer.setAttribute('aria-valuenow', tens);
    onesContainer.setAttribute('aria-valuenow', ones);
    hundredsContainer.setAttribute('aria-valuetext', `${newTempo} BPM, hundreds digit ${hundreds}`);
    tensContainer.setAttribute('aria-valuetext', `${newTempo} BPM, tens digit ${tens}`);
    onesContainer.setAttribute('aria-valuetext', `${newTempo} BPM, ones digit ${ones}`);

    if (tempoGear) {
        tempoGear.setAttribute('aria-valuenow', newTempo);
        tempoGear.setAttribute('aria-valuetext', `${newTempo} BPM`);
    }
}

// Announce something once to screen readers without showing it on screen.
function announce(message) {
    const status = document.getElementById('sr-status');
    if (status) status.textContent = message;
}

// Enhanced mouse wheel handling for tempo display
function handleTempoWheel(e) {
    e.preventDefault();
    
    // Determine direction (positive is down/decrease, negative is up/increase)
    const direction = e.deltaY > 0 ? -1 : 1;
    
    
    // Apply visual feedback based on scroll direction
    if (direction > 0) {
        // Scrolling up - increasing tempo
        tempoDisplay.classList.add('scrolling', 'scroll-up');
        tempoDisplay.classList.remove('scroll-down');
    } else {
        // Scrolling down - decreasing tempo
        tempoDisplay.classList.add('scrolling', 'scroll-down');
        tempoDisplay.classList.remove('scroll-up');
    }
    
    // Apply scrolling effect to all digit containers
    document.querySelectorAll('.digit-container').forEach(container => {
        container.classList.add('scrolling');
        if (direction > 0) {
            container.classList.add('scroll-up');
            container.classList.remove('scroll-down');
        } else {
            container.classList.add('scroll-down');
            container.classList.remove('scroll-up');
        }
    });
    
    
    // Set new tempo with a step of 1, respecting only absolute limits
    let newTempo = tempo + direction;
    
    commitTempo(newTempo);
    
    // Remove scrolling classes after animation completes
    setTimeout(() => {
        tempoDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        document.querySelectorAll('.digit-container').forEach(container => {
            container.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        });
    }, 300);
}

// Update increment value (now can be negative)
function updateIncrementValue() {
    incrementValue = parseInt(incrementValueInput.value);
    
    // Ensure the value is between -20 and 20
    incrementValue = Math.max(-20, Math.min(20, incrementValue));
    incrementValueInput.value = incrementValue;
}

// Start the metronome
function startMetronome() {
    if (!isPlaying) {
        console.log('Starting metronome...');
        
        // Initialize context if needed
        initAudioContext();
        
        // Resume audio context (might be suspended)
        if (audioContext.state === 'suspended') {
            console.log('Audio context is suspended, resuming...');
            audioContext.resume().then(() => {
                console.log('Audio context resumed successfully');
                // Make sure samples are loaded - might have failed the first time
                if (!audioSamplesLoaded) {
                    console.log('Audio samples not loaded, attempting to load now...');
                    loadAudioSamples();
                }
            }).catch(error => {
                console.error('Failed to resume audio context:', error);
            });
        } else {
            console.log('Audio context state:', audioContext.state);
        }
        
        isPlaying = true;
        currentBeat = 0;
        currentBar = 0;
        
        // Reset all visual indicators
        document.querySelectorAll('.accent-button').forEach(button => {
            button.classList.remove('active');
        });
        litBeatButton = null;
        
        // Schedule first beat immediately
        scheduleNextBeat();
        
        // Set up interval for subsequent beats
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
        
        // Update UI
        startStopBtn.textContent = 'STOP';
        startStopBtn.classList.remove('start');
        startStopBtn.classList.add('stop');
    }
}

// Stop the metronome
function stopMetronome() {
    endModifier();

    if (isPlaying) {
        isPlaying = false;
        clearInterval(metronomeInterval);
        
        // Reset all visual indicators
        document.querySelectorAll('.accent-button').forEach(button => {
            button.classList.remove('active');
        });
        litBeatButton = null;
        
        // Update UI
        startStopBtn.textContent = 'START';
        startStopBtn.classList.remove('stop');
        startStopBtn.classList.add('start');
    }
}

// Pull the slot machine handle with animation
function pullHandle() {
    if (slotHandle.classList.contains('pulled') || slotHandle.classList.contains('releasing')) {
        return; // Already animating
    }

    sfxLeverPull();

    // Animate the handle pull with a more realistic motion
    slotHandle.classList.add('pulled');

    // Add a slight shake effect
    let shakeCount = 0;
    const maxShakes = 3;
    const shakeInterval = setInterval(() => {
        shakeCount++;
        if (shakeCount > maxShakes) {
            clearInterval(shakeInterval);
            return;
        }

        // Alternate between slightly different rotations for shake effect
        const rotationAdjust = shakeCount % 2 === 0 ? 2 : -2;
        slotHandle.style.transform = `rotate(${45 + rotationAdjust}deg)`;
    }, 50);

    // Spin the reels, and only start the metronome once they have all settled.
    // The old code started it on a fixed 1350ms timeout, which cut across the
    // spin at slow tempos and lagged behind it at fast ones.
    spinRollers(() => {
        if (!isPlaying) {
            startMetronome();
        } else {
            rescheduleTransport();
        }
    });

    // Release the handle
    setTimeout(() => {
        clearInterval(shakeInterval); // Ensure interval is cleared
        slotHandle.style.transform = ''; // Remove inline transform
        slotHandle.classList.remove('pulled');
        slotHandle.classList.add('releasing');

        setTimeout(sfxLeverRelease, 100);

        // Add bounce effect at the end of release animation
        setTimeout(() => {
            slotHandle.classList.add('bounce');

            setTimeout(() => {
                slotHandle.classList.remove('releasing');
                slotHandle.classList.remove('bounce');
            }, 600);
        }, 400);
    }, 350);
}

// Create spinning animation for the rollers
function spinRollers(onComplete) {
    // Get tempo bounds for reference only
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // Calculate a new tempo
    if (minTempo === maxTempo) {
        tempo = minTempo; // Regular metronome mode
    } else if (changeType === 'random' || !isPlaying) {
        // Generate a random tempo within the min-max range, regardless of current tempo
        tempo = Math.floor(Math.random() * (maxTempo - minTempo + 1)) + minTempo;
        
        // Check if at min/max for animation
        if (tempo <= minTempo) {
            isAtMinLimit = true;
        } else if (tempo >= maxTempo) {
            isAtMaxLimit = true;
        }
    } else if (changeType === 'increment') {
        // Increment the tempo by the increment value
        tempo += parseInt(incrementValue);
        
        // Only enforce the absolute limits (10-500)
        if (tempo < 10) {
            tempo = 10;
            isAtMinLimit = true;
        } else if (tempo > 500) {
            tempo = 500;
            isAtMaxLimit = true;
        }
        
        // If limit is enabled, then enforce the min-max range
        if (isLimitIncrement) {
            if (tempo < minTempo) {
                tempo = minTempo;
                isAtMinLimit = true;
            } else if (tempo > maxTempo) {
                tempo = maxTempo;
                isAtMaxLimit = true;
            }
        } else {
            // When not limiting, only show visual indicators if we just crossed the boundary
            if (tempo <= minTempo && previousTempo > minTempo) {
                isAtMinLimit = true;
            } else if (tempo >= maxTempo && previousTempo < maxTempo) {
                isAtMaxLimit = true;
            }
            
            // Leaving the min/max range releases the Limit constraint
            if (tempo < minTempo || tempo > maxTempo) {
                releaseLimitConstraint();
            }
        }
    }
    
    // Hand the reels to the animator; it lands them on `tempo` and calls back
    // when the last one stops. A symbol landing, if one is due, resolves
    // before the callback fires.
    animateReels(tempo, onComplete, rollForSymbol());
}

// A symbol has landed. Hold it long enough to register, fire the modifier,
// then nudge the reel on to the digit it was always going to show. The tempo
// was decided before the spin, so this is purely the reveal catching up.
function resolveSymbolLanding(reel, landing, onComplete, token) {
    const symbol = landing.symbol;

    reel.roller.parentElement.classList.add('symbol-hit');
    sfxSymbolHit();

    symbolHoldTimer = setTimeout(() => {
        symbolHoldTimer = null;
        if (token !== spinToken) return;   // a newer pull took over mid-hold

        const loop = reel.loop;
        const from = parseInt(reel.roller.dataset.symbolIndex) * DIGIT_HEIGHT;
        // Forward to the real digit, wrapping through the strip rather than
        // rewinding — a reel only ever turns one way.
        const distance = (((reel.target * DIGIT_HEIGHT) - from) % loop + loop) % loop;
        const nudgeMs = 260 + distance * 0.45;

        reel.roller.classList.add('spinning');
        const startedAt = performance.now();

        const step = (now) => {
            if (token !== spinToken) return;
            const progress = Math.min(1, (now - startedAt) / nudgeMs);
            const eased = 1 - Math.pow(1 - progress, 3);
            const position = (from + distance * eased) % loop;
            reel.roller.style.transform = `translateY(${-position}px)`;

            if (progress < 1) {
                reelSpinFrame = requestAnimationFrame(step);
                return;
            }

            reelSpinFrame = null;
            reel.roller.classList.remove('spinning');
            reel.roller.parentElement.classList.remove('symbol-hit');
            sfxReelStop(2);
            updateTempoDisplay(tempo);

            // Only now announce the prize — during the nudge the banner would
            // have been sitting on top of the reveal it exists to celebrate.
            startModifier(symbol);
            recordSymbolFound(symbol);
            if (onComplete) onComplete();
        };

        reelSpinFrame = requestAnimationFrame(step);
    }, SYMBOL_SLOT_HOLD_MS);
}

const DIGIT_HEIGHT = 80;   // must match .digit height in the stylesheet
let reelSpinFrame = null;
let symbolHoldTimer = null;
// Bumped on every spin. A symbol hold outlives the spin that started it, so
// anything scheduled across that gap has to check it is still the current one.
let spinToken = 0;

// Where a reel currently sits, as a positive scroll offset in pixels.
function currentReelOffset(roller) {
    const transform = getComputedStyle(roller).transform;
    if (transform === 'none') return 0;
    const y = parseFloat(transform.split(',')[5]);
    return Number.isFinite(y) ? -y : 0;
}

// Spin the reels and land them on the digits of `finalTempo`.
//
// Driven by requestAnimationFrame instead of the old chain of nested
// setTimeouts, which redrew random values every ~50ms while the CSS transition
// underneath was still 500ms long. The reels never finished a move before the
// next one started, so they wobbled back and forth — measured at 8-11 direction
// reversals per pull — instead of turning. They also always took ~1950ms
// regardless of tempo or meter, and stopped in a random order.
//
// Now each reel turns one way only, decelerates into its detent, and they stop
// left to right. The whole spin lasts one measure, which is what the original
// brief asked for.
function animateReels(finalTempo, onComplete, landing = null) {
    if (reelSpinFrame) cancelAnimationFrame(reelSpinFrame);
    if (symbolHoldTimer) clearTimeout(symbolHoldTimer);
    document.querySelectorAll('.digit-container.symbol-hit')
        .forEach(el => el.classList.remove('symbol-hit'));
    const token = ++spinToken;

    // One bar at the *incoming* tempo. Clamped so a very slow or very fast
    // setting still feels like a slot machine rather than a stall or a blink.
    const barMs = (60 / Math.max(tempo, 1)) * timeSignature.numerator * 1000;
    const duration = Math.min(4200, Math.max(900, barMs));

    const reels = [
        { roller: hundredsRoller, target: Math.floor(finalTempo / 100) },
        { roller: tensRoller, target: Math.floor((finalTempo % 100) / 10) },
        { roller: onesRoller, target: finalTempo % 10 }
    ].map((reel, i) => {
        // The loop spans digits + the symbol slot; the trailing face repeats slot 0
        const slots = parseInt(reel.roller.dataset.loopSlots) || reel.roller.children.length - 1;
        const loop = slots * DIGIT_HEIGHT;
        const start = currentReelOffset(reel.roller);

        // A symbol landing parks this reel on the symbol slot instead of its
        // digit; the digit is revealed afterwards by the nudge.
        const landsSymbol = !!landing && landing.reelIndex === i;
        if (landsSymbol) setReelSymbol(reel.roller, landing.symbol);
        const stopSlot = landsSymbol
            ? parseInt(reel.roller.dataset.symbolIndex)
            : reel.target;

        // Distance still to travel once whole revolutions are accounted for
        const remainder = (((stopSlot * DIGIT_HEIGHT) - start) % loop + loop) % loop;
        return {
            ...reel,
            loop,
            start,
            landsSymbol,
            stopAt: duration * [0.62, 0.82, 1][i],
            total: (2 + i) * loop + remainder,
            travelled: start,
            lastDigit: -1,
            stopped: false
        };
    });

    reels.forEach(reel => reel.roller.classList.add('spinning'));

    const startedAt = performance.now();
    let lastTickAt = 0;

    const frame = (now) => {
        const elapsed = now - startedAt;
        let running = false;

        reels.forEach((reel, i) => {
            const progress = Math.min(1, elapsed / reel.stopAt);
            const eased = 1 - Math.pow(1 - progress, 3);   // ease out, like a reel losing momentum
            const travelled = reel.start + reel.total * eased;
            const position = travelled % reel.loop;
            reel.roller.style.transform = `translateY(${-position}px)`;

            // At full speed a reel covers most of a digit per frame, which
            // strobes badly on its own. Blurring in proportion to speed reads
            // as motion instead of as a glitch.
            const speed = travelled - reel.travelled;
            reel.travelled = travelled;
            const blur = Math.min(3.2, Math.max(0, speed / 22));
            reel.roller.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : '';

            const digit = Math.floor(position / DIGIT_HEIGHT);
            if (digit !== reel.lastDigit) {
                // Throttled, so the ticks thin out as the reels slow instead of
                // machine-gunning at full speed.
                if (reel.lastDigit !== -1 && now - lastTickAt > 55) {
                    sfxReelTick();
                    lastTickAt = now;
                }
                reel.lastDigit = digit;
            }

            if (progress < 1) {
                running = true;
            } else if (!reel.stopped) {
                reel.stopped = true;
                sfxReelStop(i);
            }
        });

        if (running) {
            reelSpinFrame = requestAnimationFrame(frame);
            return;
        }

        reelSpinFrame = null;
        reels.forEach(reel => {
            reel.roller.classList.remove('spinning');
            reel.roller.style.filter = '';
        });

        const symbolReel = reels.find(reel => reel.landsSymbol);
        if (symbolReel && landing) {
            resolveSymbolLanding(symbolReel, landing, onComplete, token);
            return;
        }

        // Settle on the live tempo rather than the value captured when the
        // spin began — an auto-change can land on a bar boundary mid-spin, and
        // the reels should agree with the metronome, not with stale input.
        updateTempoDisplay(tempo);
        announce(`${tempo} BPM`);
        if (onComplete) onComplete();
    };

    reelSpinFrame = requestAnimationFrame(frame);
}

// Create accent buttons based on time signature (using quarter note symbols)
function createAccentButtons() {
    accentButtonsContainer.innerHTML = '';
    
    for (let i = 0; i < timeSignature.numerator; i++) {
        // A real <button>, so it is focusable and Enter/Space work for free
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'accent-button';
        button.setAttribute('aria-label', `Accent beat ${i + 1}`);

        // Add accent indicator dot (a span — <button> only takes phrasing content)
        const accentDot = document.createElement('span');
        accentDot.className = 'accent-dot';
        button.appendChild(accentDot);

        // Check if this beat should be accented
        if (accentBeats.includes(i)) {
            button.classList.add('accent');
        }
        button.setAttribute('aria-pressed', String(accentBeats.includes(i)));

        // Add click event to toggle accent
        button.addEventListener('click', () => {
            toggleAccent(i);
        });

        // Set a data attribute to identify the beat
        button.dataset.beatIndex = i;

        accentButtonsContainer.appendChild(button);
    }

    beatButtons = [...accentButtonsContainer.querySelectorAll('.accent-button')];
    litBeatButton = null;
}

// Toggle the accent on one beat, keeping the button's visual and ARIA state
// together. Shared by clicks, Enter/Space and the number-key shortcuts.
function toggleAccent(beatIndex) {
    releaseModifierOwning('accents');
    const button = accentButtonsContainer.querySelector(`.accent-button[data-beat-index="${beatIndex}"]`);
    if (!button) return;

    const isAccented = accentBeats.includes(beatIndex);
    if (isAccented) {
        accentBeats = accentBeats.filter(b => b !== beatIndex);
    } else {
        accentBeats.push(beatIndex);
    }

    sfxToggle(!isAccented);
    button.classList.toggle('accent', !isAccented);
    button.setAttribute('aria-pressed', String(!isAccented));
    announce(`Beat ${beatIndex + 1} accent ${!isAccented ? 'on' : 'off'}`);
}

// Time signature change
function handleTimeSignatureChange() {
    releaseModifierOwning('meter');
    // Get the selected value which now should be a string like "4/4"
    const selectedValue = timeSignatureSelect.value;
    const [numerator, denominator] = selectedValue.split('/').map(num => parseInt(num));
    
    // Validate the time signature
    if (isValidTimeSignature(numerator, denominator)) {
        // Update time signature with the new values
        timeSignature.numerator = numerator;
        timeSignature.denominator = denominator;
        
        // Reset accents to just the first beat
        accentBeats = [0]; 
        createAccentButtons();
        
        // Update time signature display
        updateTimeSignatureDisplay();

        // Always restart the bar. Doing this only while playing left currentBeat
        // pointing past the end of a shorter bar once the meter shrank.
        currentBeat = 0;

        if (isPlaying) {
            // If time signature changed while playing, we need to reset the interval
            // to account for potential changes in beat duration
            clearInterval(metronomeInterval);
            metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
        }
    } else {
        console.error(`Invalid time signature: ${numerator}/${denominator}`);
        
        // Revert to a valid time signature if the current one is invalid
        timeSignatureSelect.value = `${timeSignature.numerator}/${timeSignature.denominator}`;
    }
}

// Function to validate if a time signature combination is valid
function isValidTimeSignature(numerator, denominator) {
    // Validate denominator
    if (![2, 4, 8].includes(denominator)) {
        return false;
    }
    
    // Validate numerator based on denominator
    if (denominator === 2 && [2, 3].includes(numerator)) {
        return true;
    } else if (denominator === 4 && [2, 3, 4, 5, 6].includes(numerator)) {
        return true;
    } else if (denominator === 8 && [3, 4, 5, 6, 7, 9, 12].includes(numerator)) {
        return true;
    }
    
    return false;
}

// Get the next valid time signature when scrolling up or down
function getNextTimeSignature(currentNum, currentDenom, direction) {
    // Direction: 1 for up (increasing), -1 for down (decreasing)
    
    // Define available options for each denominator
    const validOptions = {
        2: [2, 3],
        4: [2, 3, 4, 5, 6],
        8: [3, 4, 5, 6, 7, 9, 12]
    };
    
    // Get the current options for this denominator
    const options = validOptions[currentDenom];
    
    // Find the current index
    const currentIndex = options.indexOf(currentNum);
    
    if (direction > 0) {
        // Going up
        if (currentIndex === options.length - 1) {
            // We're at the end of this denominator's options, move to the next denominator
            const denomIndices = [2, 4, 8];
            const currentDenomIndex = denomIndices.indexOf(currentDenom);
            
            if (currentDenomIndex === denomIndices.length - 1) {
                // We're at the highest denominator, wrap around to the lowest
                return {
                    numerator: validOptions[2][0],
                    denominator: 2
                };
            } else {
                // Move to the next denominator
                const nextDenom = denomIndices[currentDenomIndex + 1];
                return {
                    numerator: validOptions[nextDenom][0],
                    denominator: nextDenom
                };
            }
        } else {
            // Move to the next numerator for this denominator
            return {
                numerator: options[currentIndex + 1],
                denominator: currentDenom
            };
        }
    } else {
        // Going down
        if (currentIndex === 0) {
            // We're at the start of this denominator's options, move to the prev denominator
            const denomIndices = [2, 4, 8];
            const currentDenomIndex = denomIndices.indexOf(currentDenom);
            
            if (currentDenomIndex === 0) {
                // We're at the lowest denominator, wrap around to the highest
                const highestDenom = 8;
                const highestOptions = validOptions[highestDenom];
                return {
                    numerator: highestOptions[highestOptions.length - 1],
                    denominator: highestDenom
                };
            } else {
                // Move to the previous denominator
                const prevDenom = denomIndices[currentDenomIndex - 1];
                const prevOptions = validOptions[prevDenom];
                return {
                    numerator: prevOptions[prevOptions.length - 1],
                    denominator: prevDenom
                };
            }
        } else {
            // Move to the previous numerator for this denominator
            return {
                numerator: options[currentIndex - 1],
                denominator: currentDenom
            };
        }
    }
}

// Update time signature display with current value
function updateTimeSignatureDisplay() {
    timeSignatureDisplay.textContent = `${timeSignature.numerator}/${timeSignature.denominator}`;
}

// Show time signature popup
function showTimeSignaturePopup() {
    // Set the select value to match current time signature
    timeSignatureSelect.value = `${timeSignature.numerator}/${timeSignature.denominator}`;
    
    // Show the popup
    timeSignaturePopup.classList.add('active');
    
    // Focus the select for immediate selection
    setTimeout(() => {
        timeSignatureSelect.focus();
    }, 100);
}

// Hide time signature popup
function hideTimeSignaturePopup() {
    timeSignaturePopup.classList.remove('active');
}

// Apply the selected time signature and hide popup
function applyTimeSignature() {
    handleTimeSignatureChange();
    hideTimeSignaturePopup();
}

// Handle cogwheel drag for tempo adjustment
function handleGearDragStart(e) {
    e.preventDefault();
    isDraggingGear = true;
    lastY = e.clientY || (e.touches && e.touches[0].clientY);
    dragDistance = 0;
    tempoGear.classList.add('active');
    
    // Flag to track if this is just a click vs. a drag
    window.gearWasDragged = false;
    
    document.addEventListener('mousemove', handleGearDrag);
    document.addEventListener('touchmove', handleGearDrag, { passive: false });
    document.addEventListener('mouseup', handleGearDragEnd);
    document.addEventListener('touchend', handleGearDragEnd);
}

function handleGearDrag(e) {
    if (!isDraggingGear) return;
    e.preventDefault();
    
    // Mark as dragged once there's actual movement
    window.gearWasDragged = true;
    
    const currentY = e.clientY || (e.touches && e.touches[0].clientY);
    const deltaY = currentY - lastY;
    
    // Update drag distance
    dragDistance += deltaY;
    
    // Always update rotation for visual feedback (smoother motion)
    gearRotation += (deltaY * 0.5); // Reduced rotation factor for more natural movement
    tempoGear.style.transform = `rotate(${gearRotation}deg)`;
    
    // Only change tempo after threshold is crossed
    if (Math.abs(dragDistance) >= tempoChangeThreshold) {
        // Determine direction - moving down (positive deltaY) decreases tempo
        const direction = dragDistance > 0 ? -1 : 1;
        
        
        
        // Apply tempo change
        let newTempo = tempo + direction;
        
        commitTempo(newTempo);
        
        // Reset drag distance after tempo change
        dragDistance = 0;
        
        // Add extra rotation for satisfying mechanical feel
        gearRotation += direction * gearRotationPerBPM;
        tempoGear.style.transform = `rotate(${gearRotation}deg)`;
    }
    
    // Update last position
    lastY = currentY;
}

function handleGearDragEnd(e) {
    if (e) e.stopPropagation(); // Prevent event from bubbling to tempoDisplay
    
    isDraggingGear = false;
    tempoGear.classList.remove('active');
    document.removeEventListener('mousemove', handleGearDrag);
    document.removeEventListener('touchmove', handleGearDrag);
    document.removeEventListener('mouseup', handleGearDragEnd);
    document.removeEventListener('touchend', handleGearDragEnd);
    
    // Reset the drag flag after a short delay
    setTimeout(() => {
        window.gearWasDragged = false;
    }, 100);
}

// Show the tempo input overlay
function showTempoInputOverlay() {
    // Initialize the input with the current tempo
    directTempoInput.value = tempo;
    
    // Show the overlay
    tempoInputOverlay.classList.add('active');
    
    // Focus the input for immediate typing
    setTimeout(() => {
        directTempoInput.focus();
        directTempoInput.select();
    }, 100);
}

// Hide the tempo input overlay
function hideTempoInputOverlay() {
    tempoInputOverlay.classList.remove('active');
}

// Apply the tempo from the direct input
function applyDirectTempo() {
    
    let newTempo = parseInt(directTempoInput.value);
    
    
    // Only enforce the absolute limits (10-500)
    // Allow setting beyond min-max range
    newTempo = Math.max(10, Math.min(500, newTempo));
    
    commitTempo(newTempo);
    
    // Hide the overlay
    hideTempoInputOverlay();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the UI
    updateTempoDisplay(tempo);
    createAccentButtons();
    updateTimeSignatureDisplay(); // Initialize time signature display
    
    // Add debug message
    console.log('Slotronome loaded - ready to initialize audio');
    
    // Add a one-time click handler to initialize audio on first interaction
    const initAudioOnFirstInteraction = () => {
        console.log('First user interaction detected - initializing audio');
        initAudioContext();
        
        // Try to resume audio context immediately (needed for some browsers)
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('Audio context resumed on first interaction');
                loadAudioSamples(); // Try loading samples right away
            });
        }
    };
    
    // Automatically try to initialize audio on page load
    // Note: This might not work until user interaction due to browser policies
    initAudioContext();
    
    // But also set up the interaction listener as a fallback
    document.addEventListener('click', initAudioOnFirstInteraction, { once: true });
    
    // Remove status overlay code - not needed anymore
    
    // Add a helper to check file availability
    window.checkAudioFiles = function() {
        fetch('./Audio/BassDrum.mp3')
            .then(response => {
                console.log('BassDrum.mp3 fetch status:', response.status, response.statusText);
                return response.ok;
            })
            .catch(err => {
                console.error('Error checking BassDrum.mp3:', err);
                return false;
            });
            
        fetch('./Audio/Snare.wav')
            .then(response => {
                console.log('Snare.wav fetch status:', response.status, response.statusText);
                return response.ok;
            })
            .catch(err => {
                console.error('Error checking Snare.wav:', err);
                return false;
            });
    };
    
    // Log audio context state when available
    function logAudioState() {
        if (audioContext) {
            console.log('Audio context state:', audioContext.state);
        } else {
            console.log('Audio context not yet initialized');
        }
    }
    
    // Check audio state on first user interaction
    document.body.addEventListener('click', function checkAudio() {
        // If audio isn't loaded yet, try to load it
        if (!audioSamplesLoaded && audioContext) {
            // If context is suspended, resume it
            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    loadAudioSamples();
                });
            } else {
                // Otherwise just try loading the samples
                loadAudioSamples();
            }
        }
        
        // Remove this listener after first execution
        document.body.removeEventListener('click', checkAudio);
    }, { once: true });
    
    // Variables to handle click vs. scroll intent
    let scrollIntentTimer = null;
    window.isScrolling = false; // Using window scope to ensure it's accessible everywhere
    
    // Variables for drag functionality
    let isDraggingTempo = false;
    let lastDragY = 0;
    let dragSensitivity = 0.5; // How many pixels to move for 1 BPM change
    let dragDistance = 0;
    
    // Get reference to the limit checkbox
    const limitCheckbox = document.getElementById('limit-increment');
    
    // Initialize limit checkbox to match our default setting
    limitCheckbox.checked = isLimitIncrement;
    
    // Add event listener for limit checkbox
    limitCheckbox.addEventListener('change', () => {
        isLimitIncrement = limitCheckbox.checked;
        
        // If the current tempo is outside the range and limit is checked,
        // we should move the tempo within range
        if (isLimitIncrement) {
            const minTempo = parseInt(minTempoInput.value);
            const maxTempo = parseInt(maxTempoInput.value);
            
            if (tempo < minTempo) {
                tempo = minTempo;
                updateTempoDisplay(tempo);
                
                if (isPlaying) {
                    clearInterval(metronomeInterval);
                    metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                }
            } else if (tempo > maxTempo) {
                tempo = maxTempo;
                updateTempoDisplay(tempo);
                
                if (isPlaying) {
                    clearInterval(metronomeInterval);
                    metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                }
            }
        }
    });
    
    // Modified approach for tempo display interactions
    // Clicking directly on the digits shows the input overlay
    document.querySelectorAll('.digit-container').forEach(container => {
        container.addEventListener('click', (e) => {
            // Prevent bubbling to the tempo display
            e.stopPropagation();
            
            // Only show the overlay if we're not currently scrolling or dragging
            if (!window.isScrolling && !window.gearWasDragged && !isDraggingTempo) {
                showTempoInputOverlay();
            }
        });
        
        // Remove any existing wheel event handlers
        container.removeEventListener('wheel', handleTempoWheel);
        
        // Add new wheel event handlers to each digit container
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent bubbling to avoid duplicate handling
            
            // Set scrolling flag to prevent click from triggering immediately
            window.isScrolling = true;
            
            // Only update the specific digit that's being scrolled
            handleDigitWheel(e, container);
            
            // Clear any existing timer
            if (scrollIntentTimer) {
                clearTimeout(scrollIntentTimer);
            }
            
            // Set a timer to reset the scrolling flag
            scrollIntentTimer = setTimeout(() => {
                window.isScrolling = false;
                // Ensure all scrolling classes are removed when intent period ends
                container.classList.remove('scrolling', 'scroll-up', 'scroll-down');
            }, 500); // 500ms timeout before allowing clicks again
        });
    });
    
    // Wheel event on the entire tempo display area for scrolling
    tempoDisplay.addEventListener('wheel', (e) => {
        // Check if the wheel event occurred on or near the time signature display
        // Get time signature display position
        const timeSignatureRect = timeSignatureDisplay.getBoundingClientRect();
        
        // Define a buffer zone around the time signature display (10px on each side)
        const bufferSize = 20;
        const timeSignatureArea = {
            left: timeSignatureRect.left - bufferSize,
            right: timeSignatureRect.right + bufferSize,
            top: timeSignatureRect.top - bufferSize,
            bottom: timeSignatureRect.bottom + bufferSize
        };
        
        // If the wheel event occurred in the time signature area, ignore it
        // as the time signature display has its own wheel handler
        if (e.clientX >= timeSignatureArea.left && 
            e.clientX <= timeSignatureArea.right && 
            e.clientY >= timeSignatureArea.top && 
            e.clientY <= timeSignatureArea.bottom) {
            return;
        }
        
        e.preventDefault();
        
        // Set scrolling flag to prevent click from triggering immediately
        window.isScrolling = true;
        
        // Handle the tempo change via wheel
        handleTempoWheel(e);
        
        // Clear any existing timer
        if (scrollIntentTimer) {
            clearTimeout(scrollIntentTimer);
        }
        
        // Set a timer to reset the scrolling flag
        scrollIntentTimer = setTimeout(() => {
            window.isScrolling = false;
            // Ensure all scrolling classes are removed when intent period ends
            tempoDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
            document.querySelectorAll('.digit-container').forEach(container => {
                container.classList.remove('scrolling', 'scroll-up', 'scroll-down');
            });
        }, 500); // 500ms timeout before allowing clicks again
    });
    
    // Add mousedown handler to tempo display for drag functionality
    tempoDisplay.addEventListener('mousedown', (e) => {
        // Only initiate drag if clicking directly on the tempo display (not on digit containers)
        if (e.target === tempoDisplay) {
            e.preventDefault();
            isDraggingTempo = true;
            lastDragY = e.clientY;
            dragDistance = 0;
            
            // Add cursor style to indicate dragging
            tempoDisplay.classList.add('dragging');
            
            // Prevent overlay from showing during drag
            window.isScrolling = true;
        }
    });
    
    // Add touch support for mobile devices
    tempoDisplay.addEventListener('touchstart', (e) => {
        // Only initiate drag if touching directly on the tempo display (not on digit containers)
        if (e.target === tempoDisplay) {
            e.preventDefault();
            isDraggingTempo = true;
            lastDragY = e.touches[0].clientY;
            dragDistance = 0;
            
            // Add style to indicate dragging
            tempoDisplay.classList.add('dragging');
            
            // Prevent overlay from showing during drag
            window.isScrolling = true;
        }
    }, { passive: false });
    
    // Add mousemove handler to document for drag functionality
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingTempo) return;
        
        const deltaY = lastDragY - e.clientY;
        dragDistance += deltaY;
        lastDragY = e.clientY;
        
        handleTempoDrag(deltaY);
    });
    
    // Add touchmove handler for mobile devices
    document.addEventListener('touchmove', (e) => {
        if (!isDraggingTempo) return;
        e.preventDefault();
        
        const touchY = e.touches[0].clientY;
        const deltaY = lastDragY - touchY;
        dragDistance += deltaY;
        lastDragY = touchY;
        
        handleTempoDrag(deltaY);
    }, { passive: false });
    
    // Function to handle tempo changes during drag
    function handleTempoDrag(deltaY) {
        // Accumulate drag distance until we reach threshold for 1 BPM change
        if (Math.abs(dragDistance) >= dragSensitivity) {
            // Calculate BPM change (up is increase, down is decrease)
            const direction = dragDistance > 0 ? 1 : -1;
            
            
            // Calculate new tempo
            const newTempo = tempo + direction;

            // Apply visual feedback based on drag direction
            if (direction > 0) {
                // Dragging up - increasing tempo
                tempoDisplay.classList.add('scrolling', 'scroll-up');
                tempoDisplay.classList.remove('scroll-down');
                
                document.querySelectorAll('.digit-container').forEach(container => {
                    container.classList.add('scrolling', 'scroll-up');
                    container.classList.remove('scroll-down');
                });
            } else {
                // Dragging down - decreasing tempo
                tempoDisplay.classList.add('scrolling', 'scroll-down');
                tempoDisplay.classList.remove('scroll-up');
                
                document.querySelectorAll('.digit-container').forEach(container => {
                    container.classList.add('scrolling', 'scroll-down');
                    container.classList.remove('scroll-up');
                });
            }
            
            commitTempo(newTempo);

            // Reset drag accumulator
            dragDistance = 0;
            
            // Remove scrolling classes after animation completes
            setTimeout(() => {
                tempoDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
                document.querySelectorAll('.digit-container').forEach(container => {
                    container.classList.remove('scrolling', 'scroll-up', 'scroll-down');
                });
            }, 300);
        }
    }
    
    // Add mouseup/mouseleave handlers to document for drag functionality
    document.addEventListener('mouseup', endTempoDrag);
    document.addEventListener('mouseleave', endTempoDrag);
    document.addEventListener('touchend', endTempoDrag);
    document.addEventListener('touchcancel', endTempoDrag);
    
    // Function to end tempo dragging
    function endTempoDrag() {
        if (isDraggingTempo) {
            isDraggingTempo = false;
            tempoDisplay.classList.remove('dragging');
            
            // Reset scrolling flag after a short delay
            setTimeout(() => {
                window.isScrolling = false;
            }, 100);
        }
    }
    
    // Add a click handler to the tempo display for better UX
    tempoDisplay.addEventListener('click', (e) => {
        // Only handle clicks directly on the tempo display (not bubbled from digit containers)
        if (e.target === tempoDisplay) {
            // Only show the overlay if we're not currently scrolling
            if (!window.isScrolling && !window.gearWasDragged) {
                // Do nothing - allow scrolling behavior on the empty space
                // This just prevents event bubbling
            }
        }
    });
    
    // Tempo display mouseenter - indicate scrollability
    tempoDisplay.addEventListener('mouseenter', () => {
        tempoDisplay.style.cursor = 'ns-resize';
    });
    
    // Time signature display click to show popup
    timeSignatureDisplay.addEventListener('click', (e) => {
        e.preventDefault();
        showTimeSignaturePopup();
    });
    
    // Time signature select change in popup
    timeSignatureSelect.addEventListener('change', () => {
        applyTimeSignature();
    });
    
    // Close popup when clicking outside
    timeSignaturePopup.addEventListener('click', (e) => {
        // Only close if clicked directly on the popup background
        if (e.target === timeSignaturePopup) {
            hideTimeSignaturePopup();
        }
    });
    
    // Time signature change
    timeSignatureSelect.addEventListener('change', handleTimeSignatureChange);
    
    // Start/Stop button
    startStopBtn.addEventListener('click', () => {
        if (isPlaying) {
            stopMetronome();
        } else {
            startMetronome();
        }
        sfxTransport(isPlaying);
    });
    
    // Slot handle pull
    slotHandle.addEventListener('click', () => {
        pullHandle();
    });
    
    // Change type select
    changeTypeSelect.addEventListener('change', () => {
        changeType = changeTypeSelect.value;
        if (changeType === 'increment') {
            incrementContainer.style.display = 'block';
        } else {
            incrementContainer.style.display = 'none';
        }
    });
    
    // Input value changes
    minTempoInput.addEventListener('change', () => {
        const min = parseInt(minTempoInput.value);
        const max = parseInt(maxTempoInput.value);
        
        // Ensure min <= max
        if (min > max) {
            maxTempoInput.value = min;
        }
        
        // Raising min past the current tempo releases the Limit constraint
        if (tempo < min) {
            releaseLimitConstraint();
        }
    });
    
    maxTempoInput.addEventListener('change', () => {
        const min = parseInt(minTempoInput.value);
        const max = parseInt(maxTempoInput.value);
        
        // Ensure max >= min
        if (max < min) {
            minTempoInput.value = max;
        }
        
        // Lowering max below the current tempo releases the Limit constraint
        if (tempo > max) {
            releaseLimitConstraint();
        }
    });
    
    barsToChangeInput.addEventListener('change', () => {
        barsToChange = parseInt(barsToChangeInput.value);
    });
    
    incrementValueInput.addEventListener('change', updateIncrementValue);
    
    // Plus/minus buttons for inputs
    document.querySelectorAll('.number-input').forEach(container => {
        const input = container.querySelector('input');
        const minusBtn = container.querySelector('.minus');
        const plusBtn = container.querySelector('.plus');
        
        if (minusBtn && plusBtn) {
            minusBtn.addEventListener('click', () => {
                input.value = Math.max(parseInt(input.min), parseInt(input.value) - 1);
                input.dispatchEvent(new Event('change'));
            });
            
            plusBtn.addEventListener('click', () => {
                input.value = Math.min(parseInt(input.max), parseInt(input.value) + 1);
                input.dispatchEvent(new Event('change'));
            });
        }
    });
    
    // For gear interaction
    tempoGear.addEventListener('mousedown', handleGearDragStart);
    tempoGear.addEventListener('touchstart', handleGearDragStart, { passive: false });
    
    // Cancel and Apply buttons for the overlay
    cancelTempoBtn.addEventListener('click', hideTempoInputOverlay);
    applyTempoBtn.addEventListener('click', applyDirectTempo);
    
    // Handle Enter key in the input field
    directTempoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            applyDirectTempo();
        } else if (e.key === 'Escape') {
            hideTempoInputOverlay();
        }
    });
    
    // Handle the plus/minus buttons in the overlay
    const overlayMinusBtn = directTempoInput.previousElementSibling;
    const overlayPlusBtn = directTempoInput.nextElementSibling;
    
    overlayMinusBtn.addEventListener('click', (e) => {
        let step = 1;
        
        // Increase step size based on modifier keys
        if (e.shiftKey) {
            step = 5;
        } else if (e.ctrlKey || e.metaKey) {
            step = 10;
        }
        
        directTempoInput.value = Math.max(10, parseInt(directTempoInput.value) - step);
    });
    
    overlayPlusBtn.addEventListener('click', (e) => {
        let step = 1;
        
        // Increase step size based on modifier keys
        if (e.shiftKey) {
            step = 5;
        } else if (e.ctrlKey || e.metaKey) {
            step = 10;
        }
        
        directTempoInput.value = Math.min(500, parseInt(directTempoInput.value) + step);
    });
    
    // Close overlay when clicking outside the input container
    tempoInputOverlay.addEventListener('click', (e) => {
        // Check if the click was outside the input container
        if (e.target === tempoInputOverlay) {
            hideTempoInputOverlay();
        }
    });
    
    // Update the current time signature select options
    function updateTimeSignatureSelectOptions() {
        // Clear existing options
        timeSignatureSelect.innerHTML = '';
        
        // Add options for each valid time signature
        // For denominator 2
        [2, 3].forEach(num => {
            const option = document.createElement('option');
            option.value = `${num}/2`;
            option.textContent = `${num}/2`;
            timeSignatureSelect.appendChild(option);
        });
        
        // For denominator 4
        [2, 3, 4, 5, 6].forEach(num => {
            const option = document.createElement('option');
            option.value = `${num}/4`;
            option.textContent = `${num}/4`;
            
            // Set the default (4/4) as selected
            if (num === 4) {
                option.selected = true;
            }
            
            timeSignatureSelect.appendChild(option);
        });
        
        // For denominator 8
        [3, 4, 5, 6, 7, 9, 12].forEach(num => {
            const option = document.createElement('option');
            option.value = `${num}/8`;
            option.textContent = `${num}/8`;
            timeSignatureSelect.appendChild(option);
        });
    }
    
    // Call the function to generate all digits
    generateDigits();
    
    // Variables for time signature drag functionality
    let isDraggingTimeSignature = false;
    let lastTimeSigDragY = 0;
    let timeSigDragSensitivity = 8; // How many pixels to move for a change
    let timeSigDragDistance = 0;
    
    // Initialize time signature select options
    updateTimeSignatureSelectOptions();
    
    // Add wheel event to the time signature display
    timeSignatureDisplay.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Set scrolling flag
        window.isScrolling = true;
        
        // Handle the time signature change via wheel
        handleTimeSignatureWheel(e);
        
        // Clear any existing timer
        if (scrollIntentTimer) {
            clearTimeout(scrollIntentTimer);
        }
        
        // Set a timer to reset the scrolling flag
        scrollIntentTimer = setTimeout(() => {
            window.isScrolling = false;
            // Remove scrolling classes
            timeSignatureDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        }, 500);
    });
    
    // Add mousedown handler for time signature drag
    timeSignatureDisplay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent the event from bubbling to the tempo display
        
        isDraggingTimeSignature = true;
        lastTimeSigDragY = e.clientY;
        timeSigDragDistance = 0;
        
        // Add dragging class
        timeSignatureDisplay.classList.add('dragging');
        
        // Prevent popup from showing during drag
        window.isScrolling = true;
    });
    
    // Add touchstart for mobile devices
    timeSignatureDisplay.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent the event from bubbling to the tempo display
        
        isDraggingTimeSignature = true;
        lastTimeSigDragY = e.touches[0].clientY;
        timeSigDragDistance = 0;
        
        // Add dragging class
        timeSignatureDisplay.classList.add('dragging');
        
        // Prevent popup from showing during drag
        window.isScrolling = true;
    }, { passive: false });
    
    // Add mousemove handler for time signature drag
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingTimeSignature) return;
        
        const deltaY = lastTimeSigDragY - e.clientY;
        timeSigDragDistance += deltaY;
        lastTimeSigDragY = e.clientY;
        
        handleTimeSignatureDrag(deltaY);
    });
    
    // Add touchmove handler for mobile devices
    document.addEventListener('touchmove', (e) => {
        if (!isDraggingTimeSignature) return;
        e.preventDefault();
        
        const touchY = e.touches[0].clientY;
        const deltaY = lastTimeSigDragY - touchY;
        timeSigDragDistance += deltaY;
        lastTimeSigDragY = touchY;
        
        handleTimeSignatureDrag(deltaY);
    }, { passive: false });
    
    // Function to handle time signature changes during drag
    function handleTimeSignatureDrag(deltaY) {
        // Only change time signature after drag distance reaches threshold
        if (Math.abs(timeSigDragDistance) >= timeSigDragSensitivity) {
            // Calculate direction (up is increase, down is decrease)
            const direction = timeSigDragDistance > 0 ? 1 : -1;
            
            // Get the next valid time signature
            const newTimeSignature = getNextTimeSignature(
                timeSignature.numerator,
                timeSignature.denominator,
                direction
            );
            
            // Update the time signature
            timeSignature.numerator = newTimeSignature.numerator;
            timeSignature.denominator = newTimeSignature.denominator;
            
            // Update the display
            updateTimeSignatureDisplay();
            
            // Update accent buttons
            accentBeats = [0]; // Reset to first beat accented
            createAccentButtons();
            
            // Also update the time signature select dropdown to match
            const newValue = `${timeSignature.numerator}/${timeSignature.denominator}`;
            timeSignatureSelect.value = newValue;
            
            // If playing, reset the beat to the beginning
            if (isPlaying) {
                currentBeat = 0;
            }
            
            // Apply visual feedback based on drag direction
            if (direction > 0) {
                // Dragging up - increasing time signature
                timeSignatureDisplay.classList.add('scrolling', 'scroll-up');
                timeSignatureDisplay.classList.remove('scroll-down');
            } else {
                // Dragging down - decreasing time signature
                timeSignatureDisplay.classList.add('scrolling', 'scroll-down');
                timeSignatureDisplay.classList.remove('scroll-up');
            }
            
            // Reset drag accumulator
            timeSigDragDistance = 0;
            
            // Remove scrolling classes after animation completes
            setTimeout(() => {
                timeSignatureDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
            }, 300);
        }
    }
    
    // Function to end time signature dragging
    function endTimeSignatureDrag() {
        if (isDraggingTimeSignature) {
            isDraggingTimeSignature = false;
            timeSignatureDisplay.classList.remove('dragging');
            
            // Reset scrolling flag after a short delay
            setTimeout(() => {
                window.isScrolling = false;
            }, 100);
        }
    }
    
    // Add handlers to end time signature dragging
    document.addEventListener('mouseup', endTimeSignatureDrag);
    document.addEventListener('touchend', endTimeSignatureDrag);
    document.addEventListener('touchcancel', endTimeSignatureDrag);
    
    // Update the time signature popup event handler
    timeSignatureDisplay.addEventListener('click', (e) => {
        e.preventDefault();
        // Only show popup if we're not currently scrolling or dragging
        if (!window.isScrolling) {
            showTimeSignaturePopup();
        }
    });
    
    // Add individual digit drag handlers
    document.querySelectorAll('.digit-container').forEach(container => {
        // Add mousedown handler for drag
        container.addEventListener('mousedown', (e) => {
            // Only initiate drag on the container itself (not bubbled)
            if (e.currentTarget === container) {
                handleDigitDrag(e, container);
            }
        });
        
        // Add touch support for mobile
        container.addEventListener('touchstart', (e) => {
            if (e.currentTarget === container) {
                const touch = e.touches[0];
                const touchEvent = { 
                    preventDefault: e.preventDefault.bind(e),
                    stopPropagation: e.stopPropagation.bind(e),
                    clientY: touch.clientY 
                };
                handleDigitDrag(touchEvent, container);
            }
        }, { passive: false });
    });
    
    // Add document-level move handlers
    document.addEventListener('mousemove', handleDigitDragMove);
    document.addEventListener('touchmove', (e) => {
        if (isDraggingDigit && e.touches.length > 0) {
            const touch = e.touches[0];
            const touchEvent = { clientY: touch.clientY };
            handleDigitDragMove(touchEvent);
        }
    }, { passive: false });
    
    // Add document-level end handlers
    document.addEventListener('mouseup', handleDigitDragEnd);
    document.addEventListener('touchend', handleDigitDragEnd);
    document.addEventListener('touchcancel', handleDigitDragEnd);
    
    // Add min/max tempo drag handlers
    const minTempoLabel = document.querySelector('label[for="min-tempo"]');
    const maxTempoLabel = document.querySelector('label[for="max-tempo"]');

    if (minTempoLabel) {
        minTempoLabel.style.cursor = 'ns-resize';
        minTempoLabel.addEventListener('mousedown', handleMinTempoDragStart);
        minTempoLabel.addEventListener('touchstart', handleMinTempoDragStart, { passive: false });
    }

    if (maxTempoLabel) {
        maxTempoLabel.style.cursor = 'ns-resize';
        maxTempoLabel.addEventListener('mousedown', handleMaxTempoDragStart);
        maxTempoLabel.addEventListener('touchstart', handleMaxTempoDragStart, { passive: false });
    }

    minTempoInput.style.cursor = 'ns-resize';
    maxTempoInput.style.cursor = 'ns-resize';
    
    minTempoInput.addEventListener('mousedown', handleMinTempoDragStart);
    maxTempoInput.addEventListener('mousedown', handleMaxTempoDragStart);
    
    minTempoInput.addEventListener('touchstart', handleMinTempoDragStart, { passive: false });
    maxTempoInput.addEventListener('touchstart', handleMaxTempoDragStart, { passive: false });
    
    document.addEventListener('mousemove', handleMinMaxTempoDragMove);
    document.addEventListener('touchmove', (e) => {
        if ((isDraggingMinTempo || isDraggingMaxTempo) && e.touches.length > 0) {
            const touch = e.touches[0];
            const touchEvent = { clientY: touch.clientY, preventDefault: () => e.preventDefault() };
            handleMinMaxTempoDragMove(touchEvent);
        }
    }, { passive: false });
    
    document.addEventListener('mouseup', handleMinMaxTempoDragEnd);
    document.addEventListener('touchend', handleMinMaxTempoDragEnd);
    document.addEventListener('touchcancel', handleMinMaxTempoDragEnd);
});

// Generate all digits for the rollers
// Build the reel strips. This is called from inside the DOMContentLoaded
// handler, so it must run now — it used to register a *second* DOMContentLoaded
// listener from within the first, which never fired. The reels were therefore
// stuck with the placeholder faces in index.html, where the hundreds strip only
// goes up to 3: anything from 400 BPM displayed a blank window.
function generateDigits() {
    // Hundreds only ever reaches 5 (500 BPM ceiling); tens and ones are 0-9
    buildReel(hundredsRoller, 6);
    buildReel(tensRoller, 10);
    buildReel(onesRoller, 10);
    updateTempoDisplay(tempo);
}

// Fill one reel: its digits, then a symbol slot, then a repeat of the first
// digit. The strip reads [0..9][symbol][0].
//
// The trailing duplicate is what makes the spin loop seamlessly — the strip can
// scroll past the last slot into an identical copy of the first before wrapping,
// instead of dragging a blank gap through the window.
//
// The symbol sits *after* the digits, so updateTempoDisplay's -(digit * 80)
// arithmetic is untouched and no ordinary tempo change can ever land on it.
// Only a deliberate spin target can stop there — but the symbol still whirs
// past on every pull, which is how you learn the reels have more than numbers.
function buildReel(roller, count) {
    roller.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const digit = document.createElement('div');
        digit.className = 'digit';
        digit.textContent = i;
        roller.appendChild(digit);
    }

    const symbol = document.createElement('div');
    symbol.className = 'digit digit-symbol';
    roller.appendChild(symbol);

    const wrap = document.createElement('div');
    wrap.className = 'digit';
    wrap.textContent = '0';
    roller.appendChild(wrap);

    roller.dataset.digitCount = count;      // digit faces only
    roller.dataset.symbolIndex = count;     // where the symbol slot sits
    roller.dataset.loopSlots = count + 1;   // digits + symbol; the wrap face repeats slot 0

    setReelSymbol(roller, randomSymbol());
}

// Add this new function to handle individual digit dragging
function handleDigitDrag(e, digitContainer) {
    e.preventDefault();
    e.stopPropagation();
    
    // Set dragging state
    isDraggingDigit = true;
    currentDraggedDigit = digitContainer;
    digitDragStartY = e.clientY;
    
    // Add visual class to indicate dragging
    digitContainer.classList.add('digit-selected');
    
    // Prevent other drag/scroll interactions
    window.isScrolling = true;
}

// Add this function to handle digit drag move
function handleDigitDragMove(e) {
    if (!isDraggingDigit || !currentDraggedDigit) return;
    
    const deltaY = digitDragStartY - e.clientY;
    
    // Only change value when dragged enough
    if (Math.abs(deltaY) >= digitDragSensitivity) {
        stepDigit(currentDraggedDigit, deltaY > 0 ? 1 : -1);

        // Reset the start position
        digitDragStartY = e.clientY;
    }
}

// Add this function to handle digit drag end
function handleDigitDragEnd() {
    if (isDraggingDigit && currentDraggedDigit) {
        // Remove selected class
        currentDraggedDigit.classList.remove('digit-selected');
        
        // Reset dragging state
        isDraggingDigit = false;
        currentDraggedDigit = null;
        
        // Reset scrolling flag after a short delay
        setTimeout(() => {
            window.isScrolling = false;
        }, 100);
    }
}

// Handle time signature wheel events (scrolling)
function handleTimeSignatureWheel(e) {
    e.preventDefault();
    
    // Determine direction (positive is down/decrease, negative is up/increase)
    const direction = e.deltaY > 0 ? -1 : 1;
    
    // Apply visual feedback based on scroll direction
    if (direction > 0) {
        // Scrolling up - increasing time signature
        timeSignatureDisplay.classList.add('scrolling', 'scroll-up');
        timeSignatureDisplay.classList.remove('scroll-down');
    } else {
        // Scrolling down - decreasing time signature
        timeSignatureDisplay.classList.add('scrolling', 'scroll-down');
        timeSignatureDisplay.classList.remove('scroll-up');
    }
    
    // Get the next valid time signature
    const newTimeSignature = getNextTimeSignature(
        timeSignature.numerator,
        timeSignature.denominator,
        direction
    );
    
    // Update the time signature
    timeSignature.numerator = newTimeSignature.numerator;
    timeSignature.denominator = newTimeSignature.denominator;
    
    // Update the display
    updateTimeSignatureDisplay();
    
    // Update accent buttons
    accentBeats = [0]; // Reset to first beat accented
    createAccentButtons();
    
    // Also update the time signature select dropdown to match
    const newValue = `${timeSignature.numerator}/${timeSignature.denominator}`;
    timeSignatureSelect.value = newValue;
    
    // If playing, reset the beat to the beginning
    if (isPlaying) {
        currentBeat = 0;
    }
    
    // Remove scrolling classes after animation completes
    setTimeout(() => {
        timeSignatureDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
    }, 300);
}

// How much one notch of a given reel is worth. Each place carries into the
// next like an odometer, so nudging the tens of 090 up reads 100, not 000.
function digitPlaceStep(digitContainer) {
    if (digitContainer.querySelector('#hundreds-roller')) return 100;
    if (digitContainer.querySelector('#tens-roller')) return 10;
    if (digitContainer.querySelector('#ones-roller')) return 1;
    return 0;
}

// Step one reel and flash its scroll indicator. Shared by the wheel, the drag
// and the arrow keys so all three stay in step.
function stepDigit(digitContainer, direction) {
    const step = digitPlaceStep(digitContainer);
    if (!step) return;

    digitContainer.classList.add('scrolling');
    digitContainer.classList.toggle('scroll-up', direction > 0);
    digitContainer.classList.toggle('scroll-down', direction < 0);

    commitTempo(tempo + direction * step);

    // Capture the element — a drag release nulls currentDraggedDigit before
    // this fires, which used to throw and strand the indicator lit.
    setTimeout(() => {
        digitContainer.classList.remove('scrolling', 'scroll-up', 'scroll-down');
    }, 300);
}

function handleDigitWheel(e, digitContainer) {
    // deltaY is positive scrolling down, which lowers the tempo
    stepDigit(digitContainer, e.deltaY > 0 ? -1 : 1);
}

// Min/max tempo dragging

function handleMinTempoDragStart(e) {
    e.preventDefault();
    e.stopPropagation();

    isDraggingMinTempo = true;
    minTempoStartY = e.clientY || (e.touches && e.touches[0].clientY);

    // Add visual indicator
    minTempoInput.classList.add('dragging');
}

function handleMaxTempoDragStart(e) {
    e.preventDefault();
    e.stopPropagation();

    isDraggingMaxTempo = true;
    maxTempoStartY = e.clientY || (e.touches && e.touches[0].clientY);
    
    // Add visual indicator
    maxTempoInput.classList.add('dragging');
}

function handleMinMaxTempoDragMove(e) {
    if (!isDraggingMinTempo && !isDraggingMaxTempo) return;
    
    if (typeof e.preventDefault === 'function') {
        e.preventDefault();
    }
    
    const currentY = e.clientY;
    let deltaY = 0;
    
    if (isDraggingMinTempo) {
        deltaY = minTempoStartY - currentY;
        
        if (Math.abs(deltaY) >= minMaxDragSensitivity) {
            // Direction: positive for up/increase, negative for down/decrease
            const direction = deltaY > 0 ? 1 : -1;
            
            // Calculate new min tempo
            let newMinTempo = parseInt(minTempoInput.value) + direction;
            
            // Enforce limits
            newMinTempo = Math.max(10, Math.min(500, newMinTempo));
            
            // Ensure min <= max
            const maxTempo = parseInt(maxTempoInput.value);
            if (newMinTempo > maxTempo) {
                maxTempoInput.value = newMinTempo;
            }
            
            // Update input
            minTempoInput.value = newMinTempo;
            
            // Reset start position
            minTempoStartY = currentY;
            
            // Trigger change event to update any related state
            minTempoInput.dispatchEvent(new Event('change'));
        }
    }
    
    if (isDraggingMaxTempo) {
        deltaY = maxTempoStartY - currentY;
        
        if (Math.abs(deltaY) >= minMaxDragSensitivity) {
            // Direction: positive for up/increase, negative for down/decrease
            const direction = deltaY > 0 ? 1 : -1;
            
            // Calculate new max tempo
            let newMaxTempo = parseInt(maxTempoInput.value) + direction;
            
            // Enforce limits
            newMaxTempo = Math.max(10, Math.min(500, newMaxTempo));
            
            // Ensure max >= min
            const minTempo = parseInt(minTempoInput.value);
            if (newMaxTempo < minTempo) {
                minTempoInput.value = newMaxTempo;
            }
            
            // Update input
            maxTempoInput.value = newMaxTempo;
            
            // Reset start position
            maxTempoStartY = currentY;
            
            // Trigger change event to update any related state
            maxTempoInput.dispatchEvent(new Event('change'));
        }
    }
}

function handleMinMaxTempoDragEnd() {
    if (isDraggingMinTempo) {
        isDraggingMinTempo = false;
        minTempoInput.classList.remove('dragging');
    }
    
    if (isDraggingMaxTempo) {
        isDraggingMaxTempo = false;
        maxTempoInput.classList.remove('dragging');
    }
} 
/* ==========================================================================
   Keyboard control
   Everything here is additive: the pointer paths above are untouched, these
   just give the same actions a keyboard route. Every interactive element now
   carries a role and is reachable with Tab.
   ========================================================================== */

// True while the user is typing in a field, so shortcuts stay out of the way.
function isTypingTarget(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
        || el.isContentEditable;
}

function isDialogOpen() {
    return tempoInputOverlay.classList.contains('active')
        || timeSignaturePopup.classList.contains('active');
}

// Enter/Space on an element with role="button"
function activateOnKey(element, action) {
    element.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        action();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // --- sound effects + symbols toggles --------------------------------------
    loadSfxPreference();
    loadModifiersPreference();
    renderCollection();

    const luckToggle = document.getElementById('luck-toggle');
    if (luckToggle) {
        luckToggle.addEventListener('click', () => {
            setModifiersEnabled(!modifiersEnabled);
            sfxToggle(modifiersEnabled);
            announce(`Reel symbols ${modifiersEnabled ? 'on' : 'off'}`);
        });
    }
    // Named sfxButton, not sfxToggle — a const of that name here would shadow the
    // sfxToggle() effect function for everything else in this scope.
    const sfxButton = document.getElementById('sfx-toggle');
    if (sfxButton) {
        sfxButton.addEventListener('click', () => {
            setSfxEnabled(!sfxEnabled);
            // Confirm audibly when switching on; switching off should be silent
            if (sfxEnabled) sfxToggle_confirm();
            announce(`Sound effects ${sfxEnabled ? 'on' : 'off'}`);
        });
    }

    // --- reels: role="spinbutton" ------------------------------------------
    document.querySelectorAll('.digit-container').forEach((container) => {
        container.addEventListener('keydown', (e) => {
            const step = digitPlaceStep(container);
            if (!step) return;

            switch (e.key) {
                case 'ArrowUp':   stepDigit(container, 1); break;
                case 'ArrowDown': stepDigit(container, -1); break;
                case 'PageUp':    commitTempo(tempo + step * 5); break;
                case 'PageDown':  commitTempo(tempo - step * 5); break;
                case 'Home':      commitTempo(parseInt(minTempoInput.value)); break;
                case 'End':       commitTempo(parseInt(maxTempoInput.value)); break;
                case 'Enter':
                case ' ':         showTempoInputOverlay(); break;
                default: return;
            }
            e.preventDefault();
            announce(`${tempo} BPM`);
        });
    });

    // --- cogwheel: role="slider" -------------------------------------------
    tempoGear.addEventListener('keydown', (e) => {
        const nudge = e.shiftKey ? 5 : 1;
        let target;

        switch (e.key) {
            case 'ArrowUp':
            case 'ArrowRight': target = tempo + nudge; break;
            case 'ArrowDown':
            case 'ArrowLeft':  target = tempo - nudge; break;
            case 'PageUp':     target = tempo + 10; break;
            case 'PageDown':   target = tempo - 10; break;
            case 'Home':       target = parseInt(minTempoInput.value); break;
            case 'End':        target = parseInt(maxTempoInput.value); break;
            default: return;
        }
        e.preventDefault();

        const before = tempo;
        const after = commitTempo(target);

        // Turn the cog by the same amount a drag would, so the pixels agree
        // with the value the slider is reporting.
        gearRotation += (after - before) * gearRotationPerBPM;
        tempoGear.style.transform = `rotate(${gearRotation}deg)`;
        announce(`${after} BPM`);
    });

    // --- time signature plate and lever: role="button" ----------------------
    activateOnKey(timeSignatureDisplay, showTimeSignaturePopup);
    activateOnKey(slotHandle, pullHandle);

    // --- global shortcuts ---------------------------------------------------
    document.addEventListener('keydown', (e) => {
        // Escape always closes whichever dialog is open
        if (e.key === 'Escape') {
            if (tempoInputOverlay.classList.contains('active')) {
                hideTempoInputOverlay();
                e.preventDefault();
            } else if (timeSignaturePopup.classList.contains('active')) {
                hideTimeSignaturePopup();
                e.preventDefault();
            }
            return;
        }

        if (isDialogOpen() || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

        // Let a focused control handle its own arrows/activation first
        const onOwnControl = e.target.closest?.('.digit-container, .tempo-gear, .time-sig-display, .slot-handle, .accent-button, button');

        switch (e.key) {
            case ' ':
            case 'Spacebar':
                if (onOwnControl) return;
                e.preventDefault();
                if (isPlaying) stopMetronome(); else startMetronome();
                sfxTransport(isPlaying);
                announce(isPlaying ? 'Playing' : 'Stopped');
                break;

            case 'l':
            case 'L':
                e.preventDefault();
                pullHandle();
                break;

            case 'm':
            case 'M':
                e.preventDefault();
                setSfxEnabled(!sfxEnabled);
                if (sfxEnabled) sfxToggle_confirm();
                announce(`Sound effects ${sfxEnabled ? 'on' : 'off'}`);
                break;

            case 'ArrowUp':
                if (onOwnControl) return;
                e.preventDefault();
                commitTempo(tempo + (e.shiftKey ? 5 : 1));
                announce(`${tempo} BPM`);
                break;

            case 'ArrowDown':
                if (onOwnControl) return;
                e.preventDefault();
                commitTempo(tempo - (e.shiftKey ? 5 : 1));
                announce(`${tempo} BPM`);
                break;

            default:
                // 1-9 toggle the accent on that beat
                if (/^[1-9]$/.test(e.key)) {
                    const beat = parseInt(e.key) - 1;
                    if (beat < timeSignature.numerator) {
                        e.preventDefault();
                        toggleAccent(beat);
                    }
                }
        }
    });
});
