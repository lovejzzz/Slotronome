/**
 * Metronome timing accuracy.  --slow
 *
 * The one thing a metronome cannot get wrong.
 *
 * Beats are placed on the AudioContext clock ahead of time, so the moment a
 * click is *scheduled* says nothing about when it is *heard* — the scheduler
 * places them in bursts every 25ms. What the listener gets is the `time`
 * argument handed to playClick, because the audio thread honours that
 * regardless of what the main thread was doing. So that is what this measures.
 */

module.exports = {
    name: 'timing accuracy',
    slow: true,
    async run(page, t) {
        await page.evaluate(() => setModifiersEnabled(false, { persist: false }));

        for (const bpm of [60, 90, 120, 180, 240]) {
            const r = await page.evaluate(async (bpm) => {
                initAudioContext();
                if (audioContext.state === 'suspended') await audioContext.resume();
                tempo = bpm;
                timeSignature = { numerator: 4, denominator: 4 };
                updateTempoDisplay(bpm);

                const placed = [];   // AudioContext times the clicks were placed at
                const original = playClick;
                playClick = (time, accent) => { placed.push(time); return original(time, accent); };
                startMetronome();
                await new Promise(res => setTimeout(res, 10000));
                stopMetronome();
                playClick = original;

                const expected = 60 / bpm;                      // seconds
                const gaps = [];
                for (let i = 1; i < placed.length; i++) gaps.push((placed[i] - placed[i - 1]) * 1000);
                const mean = gaps.reduce((a, c) => a + c, 0) / gaps.length;
                const worst = gaps.reduce((m, g) => Math.max(m, Math.abs(g - expected * 1000)), 0);
                const span = (placed[placed.length - 1] - placed[0]) * 1000;

                return {
                    beats: gaps.length,
                    meanMs: mean,
                    expectedMs: expected * 1000,
                    worstMs: worst,
                    cumulativeMs: Math.abs(span - expected * 1000 * (placed.length - 1)),
                    // beats sounding more than 5ms from where they belong
                    ragged: gaps.filter(g => Math.abs(g - expected * 1000) > 5).length
                };
            }, bpm);

            t.ok(`${bpm} BPM: sounded a plausible number of beats`, r.beats > 5);
            t.within(`${bpm} BPM: mean interval is exact`, Math.abs(r.meanMs - r.expectedMs), 0, 0.5);
            t.within(`${bpm} BPM: worst beat is placed within a millisecond`, r.worstMs, 0, 1);
            t.is(`${bpm} BPM: no ragged beats`, r.ragged, 0);
            t.within(`${bpm} BPM: no cumulative drift`, r.cumulativeMs, 0, 1);
        }

        // The condition the old scheduler failed under. A bare setInterval
        // fires late whenever the main thread is busy and that lateness went
        // straight into the audio: measured at 21 of 24 beats more than 5ms
        // off, worst 50ms. The lookahead window should absorb it completely.
        const janked = await page.evaluate(async () => {
            initAudioContext();
            if (audioContext.state === 'suspended') await audioContext.resume();
            tempo = 120;
            timeSignature = { numerator: 4, denominator: 4 };
            updateTempoDisplay(120);

            const placed = [];
            const original = playClick;
            playClick = (time, accent) => { placed.push(time); return original(time, accent); };

            // block for 45ms every 110ms, the way a busy page does
            const jank = setInterval(() => {
                const until = performance.now() + 45;
                while (performance.now() < until) { /* burn */ }
            }, 110);

            startMetronome();
            await new Promise(res => setTimeout(res, 9000));
            clearInterval(jank);
            stopMetronome();
            playClick = original;

            const expected = 500;
            const gaps = [];
            for (let i = 1; i < placed.length; i++) gaps.push((placed[i] - placed[i - 1]) * 1000);
            return {
                beats: gaps.length,
                ragged: gaps.filter(g => Math.abs(g - expected) > 5).length,
                worst: gaps.reduce((m, g) => Math.max(m, Math.abs(g - expected)), 0)
            };
        });

        t.ok('kept sounding beats through the jank', janked.beats > 5);
        t.is('a busy main thread does not reach the audio', janked.ragged, 0);
        t.within('worst beat under load still within a millisecond', janked.worst, 0, 1);
    }
};
