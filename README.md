# Slotronome

A pixel-art slot machine that happens to be a metronome. Set a tempo range, pull
the lever, and it deals you a tempo to practise at — the point being to get
comfortable playing the same material at whatever speed comes up, instead of
grooving one comfortable BPM into your hands.

Vanilla HTML, CSS and JavaScript. No build step, no dependencies, no network
calls at runtime.

## Features

- **Slot machine reels** — three amber reels behind glass, with a lever that
  spins up a new tempo from your range
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

## Keyboard

Everything on the cabinet is reachable with <kbd>Tab</kbd>.

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Start / stop |
| <kbd>L</kbd> | Pull the lever |
| <kbd>↑</kbd> <kbd>↓</kbd> | Tempo ±1 (<kbd>Shift</kbd> for ±5) |
| <kbd>1</kbd>–<kbd>9</kbd> | Toggle the accent on that beat |
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
