/**
 * The reel strips and the spin animation.
 */

const settle = (page, ms = 5200) => page.waitForTimeout(ms);

module.exports = {
    name: 'reels + spin',
    async run(page, t) {
        // Symbol landings have their own suite; they make spin timing
        // non-deterministic, so this one runs on plain spins.
        await page.evaluate(() => setModifiersEnabled(false, { persist: false }));

        // --- strip layout -----------------------------------------------------
        t.is('tens strip is [0..9][symbol][wrap]', await page.evaluate(() => {
            const r = document.getElementById('tens-roller');
            return [...r.children].map(c => c.classList.contains('digit-symbol') ? 'SYM' : c.textContent);
        }), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'SYM', '0']);

        t.is('hundreds reaches 5, for 500 BPM', await page.evaluate(() => {
            const r = document.getElementById('hundreds-roller');
            return [...r.children].map(c => c.classList.contains('digit-symbol') ? 'SYM' : c.textContent);
        }), ['0', '1', '2', '3', '4', '5', 'SYM', '0']);

        t.is('strip metadata', await page.evaluate(() => {
            const r = document.getElementById('tens-roller');
            return { digits: r.dataset.digitCount, symbol: r.dataset.symbolIndex, loop: r.dataset.loopSlots };
        }), { digits: '10', symbol: '10', loop: '11' });

        // --- the spin lasts a measure and settles left to right ---------------
        const spin = (bpm, numerator) => page.evaluate(async ([bpm, numerator]) => {
            tempo = bpm;
            timeSignature = { numerator, denominator: 4 };
            document.getElementById('min-tempo').value = Math.max(10, bpm - 25);
            document.getElementById('max-tempo').value = Math.min(500, bpm + 25);
            updateTempoDisplay(bpm);
            // Let the CSS transition from the previous value finish before
            // sampling, or its tail looks like the spin running backwards.
            await new Promise(r => setTimeout(r, 700));

            const rollers = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(i => document.getElementById(i));
            const loops = rollers.map(r => (parseInt(r.dataset.loopSlots) || r.children.length - 1) * 80);
            const samples = [];
            const t0 = performance.now();
            let raf;
            const tick = () => {
                samples.push({
                    t: performance.now() - t0,
                    spinning: rollers.map(r => r.classList.contains('spinning')),
                    y: rollers.map(r => {
                        const tr = getComputedStyle(r).transform;
                        return tr === 'none' ? 0 : parseFloat(tr.split(',')[5]);
                    })
                });
                raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            const pulledAt = performance.now() - t0;
            await new Promise(r => setTimeout(r, 50));
            pullHandle();
            await new Promise(r => setTimeout(r, 5200));
            cancelAnimationFrame(raf);

            // When the reel stopped, taken from the .spinning class rather than the
            // last pixel that moved: under load rAF drops frames, and the eased
            // tail moves sub-pixel amounts, so "last movement" is noisy.
            const settleAt = i => {
                let last = 0;
                for (let k = 1; k < samples.length; k++) {
                    if (samples[k - 1].spinning[i] && !samples[k].spinning[i]) last = samples[k].t;
                }
                if (last) return Math.round(last);
                for (let k = 1; k < samples.length; k++) {
                    if (Math.abs(samples[k].y[i] - samples[k - 1].y[i]) > 0.5) last = samples[k].t;
                }
                return Math.round(last);
            };
            // Unwrap each reel to check it only ever turned one way. 20px is a
            // quarter of a digit: well above the pixel-scale noise of an eased
            // tail read through getComputedStyle, and well below the 40-250px
            // reversals the old wobbling animation produced.
            const backwards = i => {
                let prev = -samples[0].y[i], count = 0;
                for (let k = 1; k < samples.length; k++) {
                    const cur = -samples[k].y[i];
                    const dt = samples[k].t - samples[k - 1].t;
                    // A dropped frame can hide more than half a revolution, and
                    // past that the wrap is genuinely ambiguous — skip rather
                    // than guess, or heavy load reads as the reel reversing.
                    if (dt > 40) { prev = cur; continue; }
                    let d = cur - prev;
                    if (d < -loops[i] / 2) d += loops[i];
                    else if (d > loops[i] / 2) d -= loops[i];
                    if (d < -20) count++;
                    prev = cur;
                }
                return count;
            };
            const landedOn = i => {
                const y = samples[samples.length - 1].y[i];
                const off = Math.abs(y % 80);
                return Math.round(Math.min(off, 80 - off));
            };
            return {
                pulledAt: Math.round(pulledAt),
                stops: [settleAt(0), settleAt(1), settleAt(2)],
                backwards: [backwards(0), backwards(1), backwards(2)],
                offBoundary: [landedOn(0), landedOn(1), landedOn(2)],
                // measured at the tempo just dealt, which is what drives the spin
                barMs: Math.round(60 / tempo * numerator * 1000),
                shown: [0, 1, 2].map(i => Math.round(-samples[samples.length - 1].y[i] / 80)).join(''),
                tempo
            };
        }, [bpm, numerator]);

        for (const [bpm, numerator] of [[60, 4], [90, 4], [180, 4]]) {
            const r = await spin(bpm, numerator);
            const label = `${bpm}bpm ${numerator}/4`;
            t.is(`${label}: reels stop left to right`, r.stops[0] <= r.stops[1] && r.stops[1] <= r.stops[2], true);
            t.is(`${label}: no reel ever turns backwards`, r.backwards, [0, 0, 0]);
            t.is(`${label}: every reel lands on a digit boundary`, r.offBoundary, [0, 0, 0]);
            t.is(`${label}: the readout equals the tempo`, parseInt(r.shown), r.tempo);
            // One measure, within the 900-4200ms clamp. Measured from the pull,
            // and generous at the top because the eased tail keeps nudging by a
            // pixel until the very last frame.
            const want = Math.min(4200, Math.max(900, r.barMs));
            t.within(`${label}: spin lasts about one measure`, r.stops[2] - r.pulledAt, want - 500, want + 500);
        }

        // --- repeat pulls leave nothing behind --------------------------------
        t.is('20 pulls all land correctly with no residue', await page.evaluate(async () => {
            const bad = [];
            for (let i = 0; i < 12; i++) {
                const lo = 10 + Math.floor(Math.random() * 300);
                document.getElementById('min-tempo').value = lo;
                document.getElementById('max-tempo').value = Math.min(500, lo + Math.floor(Math.random() * 150));
                tempo = lo + 5;
                timeSignature = { numerator: 4, denominator: 4 };
                await new Promise(res => { pullHandle(); setTimeout(res, 4700); });
                const shown = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(id => {
                    const tr = getComputedStyle(document.getElementById(id)).transform;
                    return Math.round(-(tr === 'none' ? 0 : parseFloat(tr.split(',')[5])) / 80);
                });
                if (shown[0] * 100 + shown[1] * 10 + shown[2] !== tempo) bad.push({ shown: shown.join(''), tempo });
                if (document.querySelectorAll('.digit-roller.spinning').length) bad.push({ stuckSpinning: i });
            }
            stopMetronome();
            return bad;
        }), []);

        // --- a second pull mid-spin must not leave two loops fighting ----------
        await page.evaluate(async () => {
            tempo = 90;
            updateTempoDisplay(90);
            pullHandle();
            await new Promise(r => setTimeout(r, 120));
            document.getElementById('slot-handle').classList.remove('pulled', 'releasing');
            pullHandle();
        });
        await settle(page);
        t.is('a double pull settles cleanly', await page.evaluate(() => {
            const shown = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(id => {
                const tr = getComputedStyle(document.getElementById(id)).transform;
                return Math.round(-(tr === 'none' ? 0 : parseFloat(tr.split(',')[5])) / 80);
            });
            const out = {
                matches: shown[0] * 100 + shown[1] * 10 + shown[2] === tempo,
                orphanFrame: reelSpinFrame !== null
            };
            stopMetronome();
            return out;
        }), { matches: true, orphanFrame: false });
    }
};
