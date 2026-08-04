# Slotronome

A pixel-art slot machine that happens to be a metronome. Set a tempo range, pull
the lever, and it deals you a tempo to practise at — the point being to get
comfortable playing the same material at whatever speed comes up, instead of
grooving one comfortable BPM into your hands.

Vanilla HTML, CSS and JavaScript. No build step, no dependencies, no network
calls at runtime.

## Features

- **Slot machine reels** — three amber reels behind glass, with a lever that
  spins up a new tempo from your range. The spin lasts exactly one measure at
  the current tempo and meter, and the reels stop left to right
- **Synthesised sound effects** — lever ratchet, reel ticks and detent thunks,
  transport and toggle blips, all generated through the Web Audio API, with a
  mute that leaves the metronome alone
- **Digit-by-digit tempo control** — scroll, drag or arrow-key any single reel;
  places carry into each other like an odometer, so nudging the tens of `090`
  reads `100`
- **Cogwheel fine-tune** — drag (or arrow-key) the brass cog for smooth ±1 BPM
- **Tempo range** — set min and max; set them to the same value and you have an
  ordinary fixed metronome
- **Time signatures** — 2/2, 3/2, 2/4, 3/4, 4/4, 5/4, 6/4, 3/8, 4/8, 5/8, 6/8,
  7/8, 9/8, 12/8
- **Beat accents** — every beat is a quarter-note key you can toggle; beat 1 is
  accented by default
- **Auto-changing tempo** — re-deal every *n* bars, either randomly or by adding
  a fixed increment
- **Rare reel symbols** — roughly one pull in twelve lands a symbol instead of
  a digit, granting a short practice modifier; each one you find lights up
  permanently on the cabinet plate
- **Limit toggle** — keeps incremental changes inside your min/max window
- **Fully keyboard operable**, with visible focus and screen-reader labels

## Using it

### Tempo

| What | How |
| --- | --- |
| Fine adjust | Drag the cogwheel, or scroll anywhere on the display |
| One digit | Scroll, drag, or focus a reel and press <kbd>↑</kbd>/<kbd>↓</kbd> |
| Type a value | Click the display to open **Set BPM** |
| Deal a new tempo | Pull the lever, or press <kbd>L</kbd> |

Each reel steps its own place — hundreds by 100, tens by 10, ones by 1 — and
carries into the next place, so the number always moves by the amount you'd
expect. Everything is clamped to 10–500 BPM.

### Range, meter and accents

- **Min / max tempo** — use the ± buttons, type a value, or drag the field
  vertically. Equal values give you a plain metronome.
- **Time signature** — click the plate on the left of the display (or scroll it)
  to pick a meter.
- **Accents** — click any beat to toggle it, or press its number key. Accented
  beats get the deeper sound and a brass marker.

### Auto-changing tempo

Set **Change Every** to a number of bars, then pick a **Change Type**:

- **Random** — deals a fresh tempo from your range
- **Increment** — adds the increment value each time (it can be negative)

**Limit** keeps increments inside your min/max window. Moving the tempo outside
that window by any other means releases the constraint automatically — the
checkbox flashes when this happens — and ticking it again pulls the tempo back
into range.

## Symbols

Every reel strip carries one symbol slot among its digits. Most pulls it just
whirs past — about one in twelve it lands, holds for a beat while the machine
lets you see it, then the reel nudges on to reveal the digit it was always
going to show. It never lands twice in a row.

| Symbol | Modifier | Why |
| --- | --- | --- |
| Cherry | Half time for 2 bars | The common one, and the gentlest |
| Bell | Accent moves to another beat for 8 bars | Gets you off the crutch of beat 1 |
| Bar | One silent bar, then it returns | The classic test of whether you're keeping time or following it |
| Seven | 7/8 for 4 bars | Odd meter, dropped on you without warning |
| Diamond | Two bars with no sound *and* no beat lights | The rarest, and the only one that takes the visual reference away too |

Every modifier is a real practice technique, reverts itself, and stops when you
stop the metronome. The tempo is chosen before the reels ever move, so a symbol
can't corrupt it — the landing is theatre plus a trigger.

The first time you land each one it lights up on the maker's plate at the foot
of the cabinet and stays lit. There's no score and no streak; the plate just
slowly fills in. The **LUCK** button turns the whole thing off if you'd rather
have a plain metronome.

## Keyboard

Everything on the cabinet is reachable with <kbd>Tab</kbd>.

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Start / stop |
| <kbd>L</kbd> | Pull the lever |
| <kbd>↑</kbd> <kbd>↓</kbd> | Tempo ±1 (<kbd>Shift</kbd> for ±5) |
| <kbd>1</kbd>–<kbd>9</kbd> | Toggle the accent on that beat |
| <kbd>M</kbd> | Mute / unmute the cabinet sound effects |
| <kbd>Esc</kbd> | Close a dialog |

With a control focused:

| Control | Keys |
| --- | --- |
| Reel | <kbd>↑</kbd> <kbd>↓</kbd> step, <kbd>PgUp</kbd> <kbd>PgDn</kbd> step ×5, <kbd>Home</kbd> <kbd>End</kbd> jump to min/max, <kbd>Enter</kbd> opens Set BPM |
| Cogwheel | <kbd>↑</kbd> <kbd>↓</kbd> ±1 (<kbd>Shift</kbd> ±5), <kbd>PgUp</kbd> <kbd>PgDn</kbd> ±10 |
| Time signature, lever, beats | <kbd>Enter</kbd> or <kbd>Space</kbd> |

Shortcuts stay out of the way while you're typing in a field or a dialog is open.

## Accessibility

- Reels are `spinbutton`s, the cogwheel is a `slider`, and beats are real
  `<button>`s carrying `aria-pressed` — all with live values and labels
- Visible focus rings tuned per control, using `:focus-visible` so they only
  appear for keyboard users
- A polite live region announces tempo changes and accent toggles
- `prefers-reduced-motion` disables the reel, bulb and flash animations

## Sound

Two sampled sounds carry the beat — `BassDrum.mp3` on accented beats, `Snare.wav`
on the rest — with an oscillator fallback if either fails to decode.

Everything else is synthesised at runtime from oscillators and filtered noise:
the lever ratchet and its release, a tick as each digit rolls past the window,
a pitched thunk as each reel drops into its detent (descending left to right),
transport and accent blips, and a chirp when the Limit constraint lets go. They
run on their own gain bus, mixed under the metronome so the click stays the
loudest thing in the room. No audio files beyond the two samples.

A symbol landing gets its own bright arpeggio over the detent thunk.

The **SFX** button next to START (or <kbd>M</kbd>) silences those effects.
It never touches the metronome — the click is the point of the app — and the
choice is remembered between sessions.

## The spin

Pulling the lever runs one measure of animation before the click starts — the
length the original brief asked for, so it scales with tempo and time signature
rather than being a fixed delay. It is driven by `requestAnimationFrame`: each
reel turns one way only, decelerates into its detent on an ease-out curve, and
blurs in proportion to its speed. The reels stop in sequence at roughly 62%,
82% and 100% of the measure.

Each strip runs `[0..9][symbol][0]` — the trailing repeat is what lets the loop
wrap without dragging a blank gap through the window, and the symbol sits past
the digits so ordinary tempo changes can never land on it.

## Design

Stardew-Valley-flavoured pixel art: an oak cabinet with brass trim and rivets, a
lit marquee, and an amber CRT display with scanlines and glass glare. It is all
CSS — gradients, shadows and clip paths — with no image assets beyond the two
audio samples and an inline SVG favicon.

The layout stays usable from 320px up. On narrow screens the lever moves into a
reserved gutter inside the cabinet and the cog scales down, rather than either
being hidden — both are controls, not decoration.

## Running it

Open `index.html` in a browser. That's the whole story — it works straight off
disk over `file://`, no server needed.

To serve it locally instead:

```sh
python3 -m http.server 8000    # then visit http://localhost:8000
```

## Project layout

```
index.html          markup
css/styles.css      the entire visual system, including @font-face
js/app.js           metronome scheduling, input handling, keyboard layer
fonts/              self-hosted woff2 subsets + their licences
Audio/              BassDrum.mp3, Snare.wav
```

## Fonts

Press Start 2P and Silkscreen are bundled as latin/latin-ext `woff2` subsets
(~60KB total) rather than pulled from a CDN, so the pixel-art identity survives
offline, behind network blockers, and with no third-party request at runtime.

Both are licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL);
the full licence text for each ships in `fonts/`.

## Browser support

Any current browser. Uses the Web Audio API, CSS grid, `clip-path` and
`:focus-visible`.

## Licence

Available for educational and personal use. Bundled fonts are OFL 1.1 as noted
above; the audio samples are included with the project.
