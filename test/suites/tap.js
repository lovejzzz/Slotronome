/**
 * Tap-along timing scoring.
 */

module.exports = {
    name: 'tap scoring',
    async run(page, t) {
        // --- the error maths, against a synthetic beat clock -------------------
        t.is('error to the nearest beat, across the whole beat', await page.evaluate(() => {
            tempo = 120;                       // 500ms period
            lastBeatAt = 10000;
            const at = x => Math.round(tapErrorMs(x));
            return {
                onBeat: at(10000),
                late30: at(10030),
                early30: at(9970),
                lateIntoNext: at(10520),       // 20ms past the following beat
                earlyOfNext: at(10460),        // 40ms before the following beat
                threeBeatsLate: at(11515),     // still 15ms late, three beats on
                halfway: Math.abs(at(10250))
            };
        }), { onBeat: 0, late30: 30, early30: -30, lateIntoNext: 20, earlyOfNext: -40, threeBeatsLate: 15, halfway: 250 });

        // --- grading and streaks ------------------------------------------------
        t.is('grading, and a miss breaking the streak', await page.evaluate(() => {
            tempo = 120;
            isPlaying = true;
            resetTapScoring();
            localStorage.removeItem('slotronome.beststreak');
            loadBestStreak();
            const grades = [];
            const feed = offset => {
                lastBeatAt = performance.now() - offset;
                registerTap();
                grades.push(document.getElementById('tap-verdict').className.replace('tap-verdict ', ''));
            };
            feed(5); feed(10); feed(30); feed(200); feed(8);
            const out = { grades, streak: tapStreak, best: tapBestStreak };
            isPlaying = false;
            return out;
        }), { grades: ['perfect', 'perfect', 'good', 'off', 'perfect'], streak: 1, best: 3 });

        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        t.is('the best streak survives a reload', await page.evaluate(() => tapBestStreak), 3);

        // --- guards ---------------------------------------------------------------
        t.is('tapping while stopped is not scored', await page.evaluate(() => {
            isPlaying = false;
            lastBeatAt = 0;
            resetTapScoring();
            registerTap();
            return { text: document.getElementById('tap-verdict').textContent, scored: tapErrors.length };
        }), { text: 'Start the metronome first', scored: 0 });

        // --- the whole point: scoring continues through a silent bar -------------
        t.is('taps are still scored during a blackout', await page.evaluate(() => {
            initAudioContext();
            tempo = 120;
            timeSignature = { numerator: 4, denominator: 4 };
            isPlaying = true;
            currentBeat = 0;
            resetTapScoring();
            setModifiersEnabled(true, { persist: false });
            startModifier(REEL_SYMBOLS.find(s => s.id === 'bar'));

            let sounded = 0;
            const original = playClick;
            playClick = (...a) => { sounded++; return original(...a); };
            scheduleNextBeat();                       // silent, but still stamps the clock
            const stamped = lastBeatAt > 0;
            lastBeatAt = performance.now() - 12;
            registerTap();
            playClick = original;

            const out = {
                sounded,
                stamped,
                scored: tapErrors.length,
                gradedPerfect: document.getElementById('tap-verdict').className.includes('perfect')
            };
            isPlaying = false;
            endModifier();
            return out;
        }), { sounded: 0, stamped: true, scored: 1, gradedPerfect: true });

        // --- the needle travels, and the right way --------------------------------
        t.is('needle: early left, late right, on-beat centred', await page.evaluate(async () => {
            tempo = 120;
            const needle = document.getElementById('tap-needle');
            const track = needle.parentElement;
            const offset = async error => {
                setTapNeedle(error);
                await new Promise(r => setTimeout(r, 200));
                const n = needle.getBoundingClientRect();
                const k = track.getBoundingClientRect();
                return (n.left + n.width / 2) - (k.left + k.width / 2);
            };
            const width = track.getBoundingClientRect().width;
            const early = await offset(-100), centre = await offset(0), late = await offset(100);
            return {
                early: early < -width * 0.3,
                late: late > width * 0.3,
                centred: Math.abs(centre) < 2
            };
        }), { early: true, late: true, centred: true });

        // --- both input routes ------------------------------------------------------
        await page.evaluate(() => { isPlaying = true; lastBeatAt = performance.now(); resetTapScoring(); });
        await page.click('#tap-pad');
        await page.waitForTimeout(120);
        t.is('the pad scores a tap', await page.evaluate(() => tapErrors.length), 1);

        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('t');
        await page.waitForTimeout(120);
        t.is('T scores a tap', await page.evaluate(() => tapErrors.length), 2);

        await page.locator('#min-tempo').focus();
        await page.keyboard.press('t');
        await page.waitForTimeout(120);
        t.is('T stands down while typing', await page.evaluate(() => tapErrors.length), 2);
        await page.evaluate(() => { isPlaying = false; });
    }
};
