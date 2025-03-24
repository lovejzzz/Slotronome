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

// For gear interaction
let isDraggingGear = false;
let lastY = 0;
let gearRotation = 0;
let dragDistance = 0;
let tempoChangeThreshold = 8; // Pixels needed to move before changing BPM
let gearRotationPerBPM = 8; // Degrees to rotate per BPM change

// For digit adjustment
let selectedDigit = null; // Which digit is being adjusted (hundreds/tens/ones)
let initialClickY = 0; // Starting Y position for digit adjustment
let lastClickTime = 0; // For detecting double-clicks

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

// Initialize Audio Context (on user interaction)
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Generate a click sound
function playClick(time, isAccent) {
    const clickOscillator = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    
    // Different frequency for accented beat
    clickOscillator.frequency.value = isAccent ? 1500 : 1000;
    
    clickGain.gain.value = 0.3;
    clickOscillator.connect(clickGain);
    clickGain.connect(audioContext.destination);
    
    clickOscillator.start(time);
    clickOscillator.stop(time + 0.02);
    
    // Visual feedback is now handled in scheduleNextBeat
}

// Schedule the next beat
function scheduleNextBeat() {
    const beatTime = audioContext.currentTime;
    const isAccent = accentBeats.includes(currentBeat);
    
    // Play the click
    playClick(beatTime, isAccent);
    
    // Update visual indicators - first reset all accent buttons from active state
    document.querySelectorAll('.accent-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Activate current beat's button
    const currentBeatButton = document.querySelector(`.accent-button[data-beat-index="${currentBeat}"]`);
    if (currentBeatButton) {
        currentBeatButton.classList.add('active');
    }
    
    // Advance to next beat
    currentBeat = (currentBeat + 1) % timeSignature.numerator;
    
    // If we've completed a bar
    if (currentBeat === 0) {
        currentBar++;
        
        // Check if we need to change tempo (only if barsToChange > 0)
        if (barsToChange > 0 && currentBar % barsToChange === 0) {
            changeMetronomeTempo();
        }
    }
}

// Change the metronome tempo based on settings
function changeMetronomeTempo() {
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
            
            // If tempo exceeds range, uncheck the limit checkbox
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox && (tempo < minTempo || tempo > maxTempo)) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
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
}

// Set tempo directly without animation
function setTempoDirectly(newTempo) {
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
    tempo = parseInt(newTempo);
    tempo = Math.max(10, Math.min(500, tempo)); // Clamp between 10 and 500
    
    // Check for min/max for visual indicators
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // Show the limit animation only when crossing boundaries
    if (tempo <= minTempo && previousTempo > minTempo) {
        isAtMinLimit = true;
    } else if (tempo >= maxTempo && previousTempo < maxTempo) {
        isAtMaxLimit = true;
    }
    
    // If tempo exceeds range, uncheck the limit checkbox
    if (isLimitIncrement && (tempo < minTempo || tempo > maxTempo)) {
        const limitCheckbox = document.getElementById('limit-increment');
        if (limitCheckbox) {
            limitCheckbox.checked = false;
            isLimitIncrement = false;
        }
    }
    
    updateTempoDisplay(tempo);
    
    if (isPlaying) {
        clearInterval(metronomeInterval);
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
    }
}

// Enhanced mouse wheel handling for tempo display
function handleTempoWheel(e) {
    e.preventDefault();
    
    // Determine direction (positive is down/decrease, negative is up/increase)
    const direction = e.deltaY > 0 ? -1 : 1;
    
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
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
    
    // Get the min and max tempos for visual indicators only
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Set new tempo with a step of 1, respecting only absolute limits
    let newTempo = tempo + direction;
    
    // Only enforce the absolute limits
    if (newTempo < 10) {
        newTempo = 10;
    } else if (newTempo > 500) {
        newTempo = 500;
    }
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // Show the limit animation only when crossing boundaries
    if (newTempo <= minTempo && previousTempo > minTempo) {
        isAtMinLimit = true;
    } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
        isAtMaxLimit = true;
    }
    
    // If tempo exceeds range, uncheck the limit checkbox
    if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
        const limitCheckbox = document.getElementById('limit-increment');
        if (limitCheckbox) {
            limitCheckbox.checked = false;
            isLimitIncrement = false;
        }
    }
    
    // Apply the new tempo directly
    tempo = newTempo;
    updateTempoDisplay(tempo);
    
    if (isPlaying) {
        clearInterval(metronomeInterval);
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
    }
    
    // Remove scrolling classes after animation completes
    setTimeout(() => {
        tempoDisplay.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        document.querySelectorAll('.digit-container').forEach(container => {
            container.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        });
    }, 300);
}

// Handle click on a digit container - now shows the overlay instead of individual adjustment
function handleDigitClick(e) {
    e.preventDefault();
    
    // Simply show the tempo input overlay
    showTempoInputOverlay();
    
    // No need to determine which specific digit was clicked
    // or set up drag handlers since we're using the overlay
}

// Handle double-click on a digit (no longer used, replaced by the overlay)
function handleDigitDoubleClick(digitContainer) {
    // Simply use the overlay instead
    showTempoInputOverlay();
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
        // Initialize context if needed
        initAudioContext();
        
        // Resume audio context (might be suspended)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        isPlaying = true;
        currentBeat = 0;
        currentBar = 0;
        
        // Reset all visual indicators
        document.querySelectorAll('.accent-button').forEach(button => {
            button.classList.remove('active');
        });
        
        // No longer pull the handle when clicking start
        // Just use the current tempo
        
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
    if (isPlaying) {
        isPlaying = false;
        clearInterval(metronomeInterval);
        
        // Reset all visual indicators
        document.querySelectorAll('.accent-button').forEach(button => {
            button.classList.remove('active');
        });
        
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
    
    // Play mechanical sound effect
    const clickSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAYGBgYGBgYGBgYGBgYGBgYGBgj4+Pj4+Pj4+Pj4+Pj4+Pj4+PwMDAwMDAwMDAwMDAwMDAwMDA/////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAANmAKIWUEQAGHDJACTjQAAwghMGPtMHYwVDCQMFYxczBiMXcwxzEiMJ0wITEFNB8wpjM//+n/9P/6f9J/+oAEv9Z2X1dp6VVrSLPokMEhEUEAAhwJ5Y2HWpPR0mL2BWX5QLLw+/+MYxA8WAH62tBmGGJQl8BbOgQxJUPwfL32l7lrvt5SJ5qSfG2Y2wAAAlgWCMCMXkDKjlAMZqTGVcZcpmMMaVgRoHAO1o9xkGb9v/m/f7/9v/v+f+///d5aCIJ6gDo2Mb+HYfVZUwBv/K/+MYxAgWcFrJVhnGSJBcZPDIxLYEbYHqA88BRILDCkWCr8PLT/97/+//v/+f/////uFJBEEtQCSH5IY9xZ9d7Pf7TG/s3/6f2pAYzh6aV6jHAZABAYzgoYMgAkCAKKAwkDnCAA6Avo4//+MYxAcSwFrVFgBG0N1/6X//X//p+3///12nGJBEMRCQnOMYoY+ij9BukJf6pqy5JIQFAYahCYYBXYYhmNABGAYLBUYJgUYXA+AgEGJnWe+v9f/X/9PN5G+/2t1eZx41IAJIaUpf+/P/+MYxAsT8F7dVgBG0W3/5v+P4/98f3//tQwwTLDBM0GxQMBvKBgA6PASFg+JjQX+oYS3/X/9f/9P6H99Xv8yf9aGMgaCQYoACBAAYEDCYCgWLKDkpycDhmPnP6+39fb3Nj+nTzd9f/+MYxA4WUH7NFhmG/Tfzf87f3P/9v7vT/+OggJFPmAKoEgD6nQ8GZCGdRZVaHwzHev63/f+6Sz2c5/eXm7fL5fkBDzj1tSqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
    clickSound.volume = 0.3;
    clickSound.play();
    
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
    
    // Generate the spinning animation for the rollers
    spinRollers();
    
    // After a short delay, release the handle
    setTimeout(() => {
        clearInterval(shakeInterval); // Ensure interval is cleared
        slotHandle.style.transform = ''; // Remove inline transform
        slotHandle.classList.remove('pulled');
        slotHandle.classList.add('releasing');
        
        // Play release sound with slight delay
        setTimeout(() => {
            const releaseSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAYGBgYGBgYGBgYGBgYGBgYGBgj4+Pj4+Pj4+Pj4+Pj4+Pj4+PwMDAwMDAwMDAwMDAwMDAwMDA/////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAP2AqQWUEQAqBG49gWSJAfMAaIJBFBYQDUNkgsF8A2FJB1H2kQLMf/9a1bA/1CAO5XvEAsD/8DgQNqf/i/+qqq4H+wF8DZ/+MYxAgWMHbmVhmGVQAHpd8H4HQqqgCAIwVV5dWq7/1VV6v/OAgCkILW//mVX/KAGP+NAAAAL/8zM9v/zMzMz/ZVVAQmAIgMoDoGUGcAgFY/+MYxAoUuGrIADDMlPWqlV3/1UDRBgqCmr//sBME0JBYqp/9RgdAuAtxSWZ/5g/mIVU/+uf/qWvYpmAIAMGMMUBABGACAYKgEALCcq4Xw+Pj4PAZ//+v/+u/+MYxA8WwG7IABmGTP+9X/r///4/E2/+YPsIDiACAVGJGUFh+f/LpNCIzP///M3//lIKJiMzP/8oPiRigKJECFBcUJjg0PDw8PDwAgeHh4fjw8PDw9Bgc/+MYxA4VmH7QABGGlPwPh4PCgeHh4eEBAQDhAMCAgP///wPDw8IH/ywfNDQ0eGhoSEhoaGiTQ0NDQ0NExwiQyf+kxERDHh4aGv/+Gf//8yJiIiH/6TEVERn///MiYuLi4iIf/+MYxA8WEIK4AAmGmOIi4uL//iIiIiIh//ERcXFxcRDIOD4+Ii4v//iIuLi4iIgGBAQBb/x/H+P//H///8QEBAMDgYEAwQEA4QEAMHh4OwgICAcIBgYEAwICAYEBAQDBAQEA');
            releaseSound.volume = 0.2;
            releaseSound.play();
        }, 100);
        
        // Add bounce effect at the end of release animation
        setTimeout(() => {
            slotHandle.classList.add('bounce');
            
            // Remove classes after animation completes
            setTimeout(() => {
                slotHandle.classList.remove('releasing');
                slotHandle.classList.remove('bounce');
                
                // After handle animation completes, start the metronome
                if (!isPlaying) {
                    startMetronome();
                } else {
                    // If already playing, just update the interval with new tempo
                    clearInterval(metronomeInterval);
                    metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                }
            }, 600);
        }, 400);
    }, 350);
}

// Create spinning animation for the rollers
function spinRollers() {
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
            
            // If tempo exceeds range, uncheck the limit checkbox
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox && (tempo < minTempo || tempo > maxTempo)) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
            }
        }
    }
    
    // Create spinning effect by rapidly changing digits with acceleration and deceleration
    let spins = 0;
    const maxSpins = 15; // Increased for longer animation
    let spinDuration = 50; // Start fast
    
    const spinInterval = setInterval(() => {
        spins++;
        
        // Generate random numbers for the spin animation - display can show any value
        // but only for animation purposes
        const displayMin = Math.max(10, minTempo - 20);
        const displayMax = Math.min(500, maxTempo + 20);
        const randomTempo = Math.floor(Math.random() * (displayMax - displayMin + 1)) + displayMin;
        updateTempoDisplay(randomTempo);
        
        // Gradually slow down the spinning
        if (spins > maxSpins / 2) {
            spinDuration += 15; // Slow down gradually
            clearInterval(spinInterval);
            
            // Continue with new interval duration
            if (spins < maxSpins) {
                setTimeout(() => {
                    const newRandomTempo = Math.floor(Math.random() * (displayMax - displayMin + 1)) + displayMin;
                    updateTempoDisplay(newRandomTempo);
                    
                    // Schedule next spin with increased duration
                    if (spins < maxSpins - 1) {
                        setTimeout(function continueSpinning() {
                            spins++;
                            spinDuration += 20;
                            
                            const finalRandomTempo = Math.floor(Math.random() * (displayMax - displayMin + 1)) + displayMin;
                            updateTempoDisplay(finalRandomTempo);
                            
                            if (spins < maxSpins) {
                                setTimeout(continueSpinning, spinDuration);
                            } else {
                                // Final tempo display
                                setTimeout(() => {
                                    updateTempoDisplay(tempo);
                                    
                                    // If playing, update the interval
                                    if (isPlaying) {
                                        clearInterval(metronomeInterval);
                                        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                                    }
                                }, 200);
                            }
                        }, spinDuration);
                    } else {
                        // Final tempo display
                        setTimeout(() => {
                            updateTempoDisplay(tempo);
                            
                            // If playing, update the interval
                            if (isPlaying) {
                                clearInterval(metronomeInterval);
                                metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                            }
                        }, 200);
                    }
                }, spinDuration);
            } else {
                // Final tempo display
                updateTempoDisplay(tempo);
                
                // If playing, update the interval
                if (isPlaying) {
                    clearInterval(metronomeInterval);
                    metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
                }
            }
        }
    }, spinDuration);
}

// Create accent buttons based on time signature (using quarter note symbols)
function createAccentButtons() {
    accentButtonsContainer.innerHTML = '';
    
    for (let i = 0; i < timeSignature.numerator; i++) {
        const button = document.createElement('div');
        button.className = 'accent-button';
        
        // Add accent indicator dot
        const accentDot = document.createElement('div');
        accentDot.className = 'accent-dot';
        button.appendChild(accentDot);
        
        // Check if this beat should be accented
        if (accentBeats.includes(i)) {
            button.classList.add('accent');
        }
        
        // Add click event to toggle accent
        button.addEventListener('click', () => {
            const beatIndex = i;
            
            if (accentBeats.includes(beatIndex)) {
                // Remove accent
                accentBeats = accentBeats.filter(b => b !== beatIndex);
                button.classList.remove('accent');
            } else {
                // Add accent
                accentBeats.push(beatIndex);
                button.classList.add('accent');
            }
        });
        
        // Set a data attribute to identify the beat
        button.dataset.beatIndex = i;
        
        accentButtonsContainer.appendChild(button);
    }
}

// Time signature change
function handleTimeSignatureChange() {
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
        
        if (isPlaying) {
            currentBeat = 0; // Reset current beat
            
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
        
        // Save previous tempo to check if we're crossing boundaries
        const previousTempo = tempo;
        
        // Get the min and max tempos for visual indicators only
        const minTempo = parseInt(minTempoInput.value);
        const maxTempo = parseInt(maxTempoInput.value);
        
        // Apply tempo change
        let newTempo = tempo + direction;
        
        // Only enforce the absolute limits
        if (newTempo < 10) {
            newTempo = 10;
        } else if (newTempo > 500) {
            newTempo = 500;
        }
        
        // Reset limit flags
        isAtMinLimit = false;
        isAtMaxLimit = false;
        
        // Show the limit animation only when crossing boundaries
        if (newTempo <= minTempo && previousTempo > minTempo) {
            isAtMinLimit = true;
        } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
            isAtMaxLimit = true;
        }
        
        // If tempo exceeds range, uncheck the limit checkbox
        if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
            }
        }
        
        // Apply the new tempo directly
        tempo = newTempo;
        updateTempoDisplay(tempo);
        
        if (isPlaying) {
            clearInterval(metronomeInterval);
            metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
        }
        
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
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
    let newTempo = parseInt(directTempoInput.value);
    
    // Get the min/max values for visual indicators only
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Only enforce the absolute limits (10-500)
    // Allow setting beyond min-max range
    newTempo = Math.max(10, Math.min(500, newTempo));
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // Show the limit animation only when crossing boundaries
    if (newTempo <= minTempo && previousTempo > minTempo) {
        isAtMinLimit = true;
    } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
        isAtMaxLimit = true;
    }
    
    // If tempo exceeds range, uncheck the limit checkbox
    if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
        const limitCheckbox = document.getElementById('limit-increment');
        if (limitCheckbox) {
            limitCheckbox.checked = false;
            isLimitIncrement = false;
        }
    }
    
    // Apply the new tempo without clamping to min/max range
    tempo = newTempo;
    updateTempoDisplay(tempo);
    
    if (isPlaying) {
        clearInterval(metronomeInterval);
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
    }
    
    // Hide the overlay
    hideTempoInputOverlay();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the UI
    updateTempoDisplay(tempo);
    createAccentButtons();
    updateTimeSignatureDisplay(); // Initialize time signature display
    
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
        const tempoDisplayRect = tempoDisplay.getBoundingClientRect();
        
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
            
            // Save previous tempo to check if we're crossing boundaries
            const previousTempo = tempo;
            
            // Get the min and max tempos for visual indicators only
            const minTempo = parseInt(minTempoInput.value);
            const maxTempo = parseInt(maxTempoInput.value);
            
            // Calculate new tempo
            let newTempo = tempo + direction;
            
            // Only enforce the absolute limits
            if (newTempo < 10) {
                newTempo = 10;
            } else if (newTempo > 500) {
                newTempo = 500;
            }
            
            // Reset limit flags
            isAtMinLimit = false;
            isAtMaxLimit = false;
            
            // Show the limit animation only when crossing boundaries
            if (newTempo <= minTempo && previousTempo > minTempo) {
                isAtMinLimit = true;
            } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
                isAtMaxLimit = true;
            }
            
            // If tempo exceeds range, uncheck the limit checkbox
            if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
                const limitCheckbox = document.getElementById('limit-increment');
                if (limitCheckbox) {
                    limitCheckbox.checked = false;
                    isLimitIncrement = false;
                }
            }
            
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
            
            // Apply the new tempo directly
            tempo = newTempo;
            updateTempoDisplay(tempo);
            
            if (isPlaying) {
                clearInterval(metronomeInterval);
                metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
            }
            
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
        
        // If tempo is now below min and limit is checked, uncheck the limit checkbox
        if (isLimitIncrement && tempo < min) {
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
            }
        }
    });
    
    maxTempoInput.addEventListener('change', () => {
        const min = parseInt(minTempoInput.value);
        const max = parseInt(maxTempoInput.value);
        
        // Ensure max >= min
        if (max < min) {
            minTempoInput.value = max;
        }
        
        // If tempo is now above max and limit is checked, uncheck the limit checkbox
        if (isLimitIncrement && tempo > max) {
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
            }
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
function generateDigits() {
    // Only call once the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        // Generate digits for hundreds (0-5 for up to 500 BPM)
        hundredsRoller.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const digitDiv = document.createElement('div');
            digitDiv.className = 'digit';
            digitDiv.textContent = i;
            hundredsRoller.appendChild(digitDiv);
        }
        
        // Generate digits for tens and ones (0-9)
        tensRoller.innerHTML = '';
        onesRoller.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            const tenDigitDiv = document.createElement('div');
            tenDigitDiv.className = 'digit';
            tenDigitDiv.textContent = i;
            tensRoller.appendChild(tenDigitDiv);
            
            const oneDigitDiv = document.createElement('div');
            oneDigitDiv.className = 'digit';
            oneDigitDiv.textContent = i;
            onesRoller.appendChild(oneDigitDiv);
        }
    });
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
        // Determine which digit we're adjusting
        const isHundreds = currentDraggedDigit.querySelector('#hundreds-roller') !== null;
        const isTens = currentDraggedDigit.querySelector('#tens-roller') !== null;
        const isOnes = currentDraggedDigit.querySelector('#ones-roller') !== null;
        
        // Save previous tempo to check if we're crossing boundaries
        const previousTempo = tempo;
        
        // Direction: positive for up/increase, negative for down/decrease
        const direction = deltaY > 0 ? 1 : -1;
        
        // Calculate new tempo based on which digit is being dragged
        let newTempo = tempo;
        
        if (isHundreds) {
            // Adjust hundreds place
            newTempo = tempo + (direction * 100);
        } else if (isTens) {
            // Adjust tens place, but keep within valid range for the tens digit (0-9)
            const currentTens = Math.floor((tempo % 100) / 10);
            const newTens = (currentTens + direction + 10) % 10; // Ensure it wraps around 0-9
            newTempo = tempo - (currentTens * 10) + (newTens * 10);
        } else if (isOnes) {
            // Adjust ones place, but keep within valid range for the ones digit (0-9)
            const currentOnes = tempo % 10;
            const newOnes = (currentOnes + direction + 10) % 10; // Ensure it wraps around 0-9
            newTempo = tempo - currentOnes + newOnes;
        }
        
        // Apply visual feedback based on drag direction
        if (direction > 0) {
            // Dragging up - increasing digit
            currentDraggedDigit.classList.add('scrolling', 'scroll-up');
            currentDraggedDigit.classList.remove('scroll-down');
        } else {
            // Dragging down - decreasing digit
            currentDraggedDigit.classList.add('scrolling', 'scroll-down');
            currentDraggedDigit.classList.remove('scroll-up');
        }
        
        // Get the min and max tempos for limit checks
        const minTempo = parseInt(minTempoInput.value);
        const maxTempo = parseInt(maxTempoInput.value);
        
        // Only enforce the absolute limits
        if (newTempo < 10) {
            newTempo = 10;
        } else if (newTempo > 500) {
            newTempo = 500;
        }
        
        // Reset limit flags
        isAtMinLimit = false;
        isAtMaxLimit = false;
        
        // Show the limit animation only when crossing boundaries
        if (newTempo <= minTempo && previousTempo > minTempo) {
            isAtMinLimit = true;
        } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
            isAtMaxLimit = true;
        }
        
        // If tempo exceeds range, uncheck the limit checkbox
        if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
            const limitCheckbox = document.getElementById('limit-increment');
            if (limitCheckbox) {
                limitCheckbox.checked = false;
                isLimitIncrement = false;
            }
        }
        
        // Apply the new tempo directly
        tempo = newTempo;
        updateTempoDisplay(tempo);
        
        if (isPlaying) {
            clearInterval(metronomeInterval);
            metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
        }
        
        // Reset the start position
        digitDragStartY = e.clientY;
        
        // Remove scrolling classes after animation completes
        setTimeout(() => {
            currentDraggedDigit.classList.remove('scrolling', 'scroll-up', 'scroll-down');
        }, 300);
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

// Add a new function to handle individual digit wheel events
function handleDigitWheel(e, digitContainer) {
    // Determine direction (positive is down/decrease, negative is up/increase)
    const direction = e.deltaY > 0 ? -1 : 1;
    
    // Save previous tempo to check if we're crossing boundaries
    const previousTempo = tempo;
    
    // Determine which digit we're adjusting
    const isHundreds = digitContainer.querySelector('#hundreds-roller') !== null;
    const isTens = digitContainer.querySelector('#tens-roller') !== null;
    const isOnes = digitContainer.querySelector('#ones-roller') !== null;
    
    // Apply visual feedback based on scroll direction
    if (direction > 0) {
        // Scrolling up - increasing tempo
        digitContainer.classList.add('scrolling', 'scroll-up');
        digitContainer.classList.remove('scroll-down');
    } else {
        // Scrolling down - decreasing tempo
        digitContainer.classList.add('scrolling', 'scroll-down');
        digitContainer.classList.remove('scroll-up');
    }
    
    // Calculate new tempo based on which digit is being scrolled
    let newTempo = tempo;
    
    if (isHundreds) {
        // Adjust hundreds place
        newTempo = tempo + (direction * 100);
    } else if (isTens) {
        // Adjust tens place, but keep within valid range for the tens digit (0-9)
        const currentTens = Math.floor((tempo % 100) / 10);
        const newTens = (currentTens + direction + 10) % 10; // Ensure it wraps around 0-9
        newTempo = tempo - (currentTens * 10) + (newTens * 10);
    } else if (isOnes) {
        // Adjust ones place, but keep within valid range for the ones digit (0-9)
        const currentOnes = tempo % 10;
        const newOnes = (currentOnes + direction + 10) % 10; // Ensure it wraps around 0-9
        newTempo = tempo - currentOnes + newOnes;
    }
    
    // Get the min and max tempos for limit checks
    const minTempo = parseInt(minTempoInput.value);
    const maxTempo = parseInt(maxTempoInput.value);
    
    // Only enforce the absolute limits
    if (newTempo < 10) {
        newTempo = 10;
    } else if (newTempo > 500) {
        newTempo = 500;
    }
    
    // Reset limit flags
    isAtMinLimit = false;
    isAtMaxLimit = false;
    
    // Show the limit animation only when crossing boundaries
    if (newTempo <= minTempo && previousTempo > minTempo) {
        isAtMinLimit = true;
    } else if (newTempo >= maxTempo && previousTempo < maxTempo) {
        isAtMaxLimit = true;
    }
    
    // If tempo exceeds range, uncheck the limit checkbox
    if (isLimitIncrement && (newTempo < minTempo || newTempo > maxTempo)) {
        const limitCheckbox = document.getElementById('limit-increment');
        if (limitCheckbox) {
            limitCheckbox.checked = false;
            isLimitIncrement = false;
        }
    }
    
    // Apply the new tempo directly
    tempo = newTempo;
    updateTempoDisplay(tempo);
    
    if (isPlaying) {
        clearInterval(metronomeInterval);
        metronomeInterval = setInterval(scheduleNextBeat, (60 / tempo) * 1000);
    }
    
    // Remove scrolling classes after animation completes
    setTimeout(() => {
        digitContainer.classList.remove('scrolling', 'scroll-up', 'scroll-down');
    }, 300);
} 

// Add these new functions to handle min/max tempo dragging

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