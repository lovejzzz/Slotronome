# Slotronome

A musical slot machine metronome designed to help music learners adapt to different tempos in practice. The metronome features an interactive slot machine interface with real rolling animations, providing a fun and engaging way to practice with tempo changes.

## Features

- **Interactive Slot Machine Interface**: Pull the handle to randomize a tempo within your specified range
- **Digit-By-Digit Tempo Control**: Individually drag or scroll each digit for precise tempo adjustments
- **Visual Time Signature Display**: Click directly on the time signature display to change it
- **Customizable Tempo Range**: Set minimum and maximum tempo values using draggable inputs
- **Multiple Time Signatures**: Choose from a wide range including 2/2, 3/2, 2/4, 3/4, 4/4, 5/4, 6/4, and various 8th-note based signatures
- **Beat Accents**: Click on any beat to toggle accents, helping you emphasize specific beats
- **Auto-Changing Tempo**: Option to change tempo automatically after a specified number of bars
- **Two Change Modes**:
  - Random: Generates a random tempo within the specified range
  - Increment: Adds a specific value to the current tempo after the specified number of bars
- **Limit Toggle**: Option to limit incremental changes within your min/max tempo range
- **Interactive Gear Control**: Drag the cogwheel to fine-tune the tempo

## How to Use

1. **Adjust Tempo**:
   - Direct interaction: Click and drag individual digits in the tempo display
   - Scroll over digits: Use mouse wheel on specific digits to adjust values
   - Cogwheel: Drag the gear on the right of the display for smooth adjustments

2. **Set Tempo Range**:
   - Use the Min Tempo and Max Tempo controls to set your desired range
   - Drag these inputs up/down for quick adjustments
   - Setting both to the same value will create a regular metronome

3. **Change Time Signature**:
   - Click directly on the time signature display on the left side of the tempo
   - Scroll over the time signature to cycle through options
   - Select from a wide range of time signatures in the popup

4. **Configure Accent Beats**:
   - Click on any numbered beat to toggle an accent
   - By default, the first beat is accented

5. **Set Auto-Change Options** (optional):
   - "Change Tempo Every" - Set how many bars before the tempo changes
   - "Change Type" - Choose between Random or Increment
   - If using Increment, set the increment value and toggle the "Limit" checkbox to keep changes within your min/max range

6. **Start the Metronome**:
   - Click the "START" button or pull the slot handle to begin
   - The metronome will click according to your settings
   - Pull the handle at any time to manually change the tempo

7. **Stop the Metronome**:
   - Click the "STOP" button to stop playback

## Interaction Improvements

- **Isolated Scroll Areas**: Tempo and time signature areas respond independently to mouse wheel events
- **Visual Feedback**: Hover effects and animations provide clear indication of interactive elements
- **Draggable Controls**: Many inputs can be dragged for intuitive adjustment
- **Custom Styling**: Checkbox controls and inputs have custom styling to match the retro theme

## About the Project

This project features a pixel art style inspired by retro gaming consoles and slot machines. It aims to make practicing with a metronome more engaging and gamelike while helping musicians develop the ability to adapt to tempo changes.

## Technical Information

The Slotronome is built using:
- HTML5
- CSS3 with custom animations and pixel-perfect styling
- Vanilla JavaScript
- Web Audio API for accurate timing and audio generation

No external libraries or frameworks are required - just open index.html in a modern web browser to use the application.

## Compatibility

Slotronome works best in modern browsers with support for:
- CSS Grid Layout
- Web Audio API
- Modern JavaScript (ES6+)

## License

This project is available for educational and personal use. 