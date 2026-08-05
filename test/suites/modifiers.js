/**
 * Reel symbols and the modifiers they grant.
 *
 * The interaction cases matter more than the happy path here: a modifier that
 * restores a snapshot will happily undo something the user did in the meantime,
 * which is how three of these started life as bugs.
 */

module.exports = {
    name: 'modifiers',
    async run(page, t) {
        await page.evaluate(() => setModifiersEnabled(true, { persist: false }));

        // --- each one does something, then puts it back -----------------------
        const cycles = await page.evaluate(() => REEL_SYMBOLS.map(symbol => {
            endModifier();
            tempo = 120;
            timeSignature = { numerator: 4, denominator: 4 };
            accentBeats = [0];
            createAccentButtons();
            updateTempoDisplay(120);

            const before = {
                tempo, num: timeSignature.numerator, den: timeSignature.denominator,
                accents: [...accentBeats].sort((a, b) => a - b)
            };
            startModifier(symbol);
            const during = {
                tempo, num: timeSignature.numerator,
                accents: [...accentBeats].sort((a, b) => a - b),
                blackout: !!activeModifier.blackout,
                lightsOut: !!activeModifier.lightsOut
            };
            for (let i = 0; i < symbol.bars; i++) tickModifier();
            const after = {
                tempo, num: timeSignature.numerator, den: timeSignature.denominator,
                accents: [...accentBeats].sort((a, b) => a - b)
            };
            return {
                id: symbol.id,
                changed: JSON.stringify(before) !== JSON.stringify(during) || during.blackout,
                reverted: JSON.stringify(before) === JSON.stringify(after),
                cleared: activeModifier === null,
                blackout: during.blackout,
                lightsOut: during.lightsOut
            };
        }));

        for (const c of cycles) {
            t.ok(`${c.id}: changes something`, c.changed);
            t.ok(`${c.id}: reverts`, c.reverted);
            t.ok(`${c.id}: expires`, c.cleared);
        }
        const bar = cycles.find(c => c.id === 'bar');
        const diamond = cycles.find(c => c.id === 'diamond');
        t.is('Bar silences audio but keeps the lights', [bar.blackout, bar.lightsOut], [true, false]);
        t.is('Diamond takes the lights too', [diamond.blackout, diamond.lightsOut], [true, true]);

        // --- blackout keeps the pulse and the bar count honest ----------------
        t.is('a silent bar costs no beats and no bars', await page.evaluate(() => {
            initAudioContext();
            endModifier();
            tempo = 120;
            timeSignature = { numerator: 4, denominator: 4 };
            isPlaying = true;
            currentBeat = 0;
            currentBar = 0;
            let sounded = 0;
            const original = playClick;
            playClick = (...a) => { sounded++; return original(...a); };
            startModifier(REEL_SYMBOLS.find(s => s.id === 'diamond'));   // 2 bars
            for (let i = 0; i < 16; i++) scheduleNextBeat();              // 4 bars
            playClick = original;
            const out = { sounded, bars: currentBar, ended: activeModifier === null };
            isPlaying = false;
            endModifier();
            return out;
        }), { sounded: 8, bars: 4, ended: true });

        // --- user intent beats a running modifier ------------------------------
        t.is('changing the meter during Seven sticks', await page.evaluate(() => {
            endModifier();
            timeSignature = { numerator: 4, denominator: 4 };
            startModifier(REEL_SYMBOLS.find(s => s.id === 'seven'));
            timeSignatureSelect.value = '3/4';
            handleTimeSignatureChange();
            const chosen = `${timeSignature.numerator}/${timeSignature.denominator}`;
            for (let i = 0; i < 4; i++) tickModifier();
            return { chosen, afterExpiry: `${timeSignature.numerator}/${timeSignature.denominator}` };
        }), { chosen: '3/4', afterExpiry: '3/4' });

        t.is('editing accents during Bell sticks', await page.evaluate(() => {
            endModifier();
            timeSignature = { numerator: 4, denominator: 4 };
            accentBeats = [0];
            createAccentButtons();
            startModifier(REEL_SYMBOLS.find(s => s.id === 'bell'));
            const bellBeat = accentBeats[0];
            const userBeat = [1, 2, 3].find(b => b !== bellBeat);
            toggleAccent(userBeat);
            const during = [...accentBeats].sort((a, b) => a - b).join(',');
            for (let i = 0; i < 8; i++) tickModifier();
            return during === [...accentBeats].sort((a, b) => a - b).join(',');
        }), true);

        t.is('setting a tempo during Cherry sticks', await page.evaluate(() => {
            endModifier();
            tempo = 120;
            updateTempoDisplay(120);
            startModifier(REEL_SYMBOLS.find(s => s.id === 'cherry'));
            const halved = tempo;
            commitTempo(150);
            tickModifier();
            tickModifier();
            return { halved, afterExpiry: tempo };
        }), { halved: 60, afterExpiry: 150 });

        // --- boundaries ---------------------------------------------------------
        t.is('Cherry restores exactly at the ceiling', await page.evaluate(() => {
            endModifier();
            tempo = 500;
            updateTempoDisplay(500);
            startModifier(REEL_SYMBOLS.find(s => s.id === 'cherry'));
            const during = tempo;
            tickModifier(); tickModifier();
            return { during, restored: tempo };
        }), { during: 250, restored: 500 });

        // --- lifecycle ------------------------------------------------------------
        t.is('stopping clears a modifier', await page.evaluate(() => {
            endModifier();
            timeSignature = { numerator: 4, denominator: 4 };
            startModifier(REEL_SYMBOLS.find(s => s.id === 'seven'));
            const during = timeSignature.numerator;
            stopMetronome();
            return { during, after: timeSignature.numerator, cleared: activeModifier === null };
        }), { during: 7, after: 4, cleared: true });

        t.is('turning LUCK off clears a modifier', await page.evaluate(() => {
            endModifier();
            timeSignature = { numerator: 4, denominator: 4 };
            startModifier(REEL_SYMBOLS.find(s => s.id === 'seven'));
            const during = timeSignature.numerator;
            setModifiersEnabled(false, { persist: false });
            const after = timeSignature.numerator;
            setModifiersEnabled(true, { persist: false });
            return { during, after, cleared: activeModifier === null };
        }), { during: 7, after: 4, cleared: true });

        // --- how often it happens -------------------------------------------------
        const rate = await page.evaluate(() => {
            symbolCooldown = 0;
            let hits = 0, backToBack = 0, previous = false;
            for (let i = 0; i < 20000; i++) {
                if (rollForSymbol()) {
                    hits++;
                    if (previous) backToBack++;
                    previous = true;
                } else {
                    previous = false;
                }
            }
            return { pct: hits / 20000 * 100, backToBack };
        });
        t.within('lands on roughly one pull in five', rate.pct, 13, 23);
        t.is('never lands twice running', rate.backToBack, 0);

        t.is('LUCK off suppresses landings entirely', await page.evaluate(() => {
            setModifiersEnabled(false, { persist: false });
            let hits = 0;
            for (let i = 0; i < 5000; i++) if (rollForSymbol()) hits++;
            setModifiersEnabled(true, { persist: false });
            return hits;
        }), 0);
    }
};
