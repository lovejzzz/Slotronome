/**
 * Randomised soak.  --slow
 *
 * Drives 400 arbitrary actions with symbols forced to land far more often than
 * they really do, checking a handful of invariants after every one. This is
 * what caught the beat index pointing past the end of a shortened bar, and a
 * modifier left armed after the transport stopped.
 */

module.exports = {
    name: 'soak (randomised)',
    slow: true,
    async run(page, t) {
        const report = await page.evaluate(async () => {
            const problems = [];
            const rnd = n => Math.floor(Math.random() * n);

            const realRoll = rollForSymbol;
            rollForSymbol = () => Math.random() < 0.45
                ? { symbol: REEL_SYMBOLS[rnd(REEL_SYMBOLS.length)], reelIndex: rnd(3) }
                : null;

            const actions = [
                () => { document.getElementById('slot-handle').classList.remove('pulled', 'releasing'); pullHandle(); },
                () => { if (isPlaying) stopMetronome(); else startMetronome(); },
                () => commitTempo(10 + rnd(491)),
                () => toggleAccent(rnd(timeSignature.numerator)),
                () => {
                    const meters = ['2/2', '3/4', '4/4', '5/4', '7/8', '12/8'];
                    timeSignatureSelect.value = meters[rnd(meters.length)];
                    handleTimeSignatureChange();
                },
                () => { minTempoInput.value = 10 + rnd(200); minTempoInput.dispatchEvent(new Event('change')); },
                () => { maxTempoInput.value = 60 + rnd(300); maxTempoInput.dispatchEvent(new Event('change')); },
                () => { barsToChange = rnd(5); },
                () => { changeType = Math.random() < 0.5 ? 'random' : 'increment'; },
                () => setModifiersEnabled(Math.random() < 0.5, { persist: false }),
                () => setSfxEnabled(Math.random() < 0.5, { persist: false }),
                () => changeMetronomeTempo(),
                () => registerTap(),
                () => { for (let i = 0; i < 8; i++) if (isPlaying) scheduleNextBeat(); }
            ];

            for (let i = 0; i < 400; i++) {
                try {
                    actions[rnd(actions.length)]();
                } catch (err) {
                    problems.push(`action ${i} threw: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 12));

                if (!Number.isFinite(tempo) || tempo < 10 || tempo > 500) {
                    problems.push(`step ${i}: tempo out of range (${tempo})`);
                }
                if (currentBeat < 0 || currentBeat >= timeSignature.numerator) {
                    problems.push(`step ${i}: beat ${currentBeat} outside 0..${timeSignature.numerator - 1}`);
                }
                if (accentBeats.some(b => b < 0 || b >= timeSignature.numerator)) {
                    problems.push(`step ${i}: accent outside the bar (${JSON.stringify(accentBeats)})`);
                }
                if (document.getElementById('limit-increment').checked !== isLimitIncrement) {
                    problems.push(`step ${i}: Limit checkbox out of sync with its flag`);
                }
                if (activeModifier && activeModifier.barsLeft < 0) {
                    problems.push(`step ${i}: modifier ran past its expiry`);
                }
                if (document.querySelectorAll('.accent-button').length !== timeSignature.numerator) {
                    problems.push(`step ${i}: wrong number of beat buttons for the meter`);
                }
                if (problems.length > 10) break;
            }

            rollForSymbol = realRoll;
            stopMetronome();
            await new Promise(r => setTimeout(r, 6000));   // let anything in flight land

            return {
                problems,
                settled: {
                    orphanFrame: reelSpinFrame !== null,
                    pendingHold: symbolHoldTimer !== null,
                    strandedModifier: activeModifier !== null,
                    stuckHighlight: document.querySelectorAll('.digit-container.symbol-hit').length,
                    stuckSpinning: document.querySelectorAll('.digit-roller.spinning').length
                }
            };
        });

        t.is('no invariant broken over 400 random actions', report.problems, []);
        t.is('nothing left in flight once it settles', report.settled, {
            orphanFrame: false,
            pendingHold: false,
            strandedModifier: false,
            stuckHighlight: 0,
            stuckSpinning: 0
        });
    }
};
