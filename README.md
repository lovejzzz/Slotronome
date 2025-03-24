# Slotronome

A musical slot machine metronome designed to help music learners adapt to different tempos in practice. The metronome looks and works like a slot machine, with real rolling animations.

## Features

- **Slot Machine Interface**: Pull the handle to randomize a tempo within your specified range
- **Customizable Tempo Range**: Set minimum and maximum tempo values (using the same value for both creates a regular metronome)
- **Multiple Time Signatures**: Choose from 2/4, 3/4, 4/4, 5/4, 6/8, and 7/8
- **Beat Accents**: Click on any beat to toggle accents, helping you emphasize specific beats
- **Auto-Changing Tempo**: Option to change tempo automatically after a specified number of bars
- **Two Change Modes**:
  - Random: Generates a random tempo within the specified range
  - Increment: Adds a specific value to the current tempo after the specified number of bars

## How to Use

1. **Set Your Tempo Range**:
   - Use the Min Tempo and Max Tempo controls to set your desired range
   - Setting both to the same value will create a regular metronome

2. **Set Time Signature**:
   - Select from the dropdown menu (4/4 is default)

3. **Configure Accent Beats**:
   - Click on any numbered beat to toggle an accent
   - By default, the first beat is accented

4. **Set Auto-Change Options** (optional):
   - "Change Tempo Every" - Set how many bars before the tempo changes
   - "Change Type" - Choose between Random or Increment
   - If using Increment, set the increment value

5. **Start the Metronome**:
   - Click the "START" button or pull the slot handle to begin
   - The metronome will click according to your settings
   - Pull the handle at any time to manually change the tempo

6. **Stop the Metronome**:
   - Click the "STOP" button to stop playback

## About the Project

This project is designed with a pixel art style inspired by Stardew Valley. It aims to make practicing with a metronome more engaging and gamelike while helping musicians develop the ability to adapt to tempo changes.

## Technical Information

The Slotronome is built using:
- HTML5
- CSS3
- JavaScript
- Web Audio API

No external libraries or frameworks are required - just open index.html in a modern web browser to use the application.

## License

This project is available for educational and personal use. 