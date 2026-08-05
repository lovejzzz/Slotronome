/**
 * A symbol landing, driven end to end through a real lever pull: it shows in
 * the window, the reel nudges on to the true digit, the modifier starts, and
 * the collection plate records it.
 */

module.exports = {
    name: 'symbol landing',
    async run(page, t) {
        await page.evaluate(() => setModifiersEnabled(true, { persist: false }));

        for (const id of ['cherry', 'bell', 'bar', 'seven', 'diamond']) {
            const r = await page.evaluate(async (id) => {
                tempo = 90;
                timeSignature = { numerator: 4, denominator: 4 };
                document.getElementById('min-tempo').value = 100;
                document.getElementById('max-tempo').value = 170;
                updateTempoDisplay(90);
                endModifier();

                const symbol = REEL_SYMBOLS.find(s => s.id === id);
                const realRoll = rollForSymbol;
                rollForSymbol = () => ({ symbol, reelIndex: 1 });     // always the tens reel

                let symbolShown = false, bannerShown = false;
                pullHandle();
                const watch = setInterval(() => {
                    if (document.getElementById('modifier-banner').classList.contains('visible')) bannerShown = true;
                    const roller = document.getElementById('tens-roller');
                    const tr = getComputedStyle(roller).transform;
                    const slot = Math.round(-(tr === 'none' ? 0 : parseFloat(tr.split(',')[5])) / 80);
                    if (slot === parseInt(roller.dataset.symbolIndex)) symbolShown = true;
                }, 40);
                await new Promise(res => setTimeout(res, 6500));
                clearInterval(watch);
                rollForSymbol = realRoll;

                const roller = document.getElementById('tens-roller');
                const tr = getComputedStyle(roller).transform;
                const finalSlot = Math.round(-(tr === 'none' ? 0 : parseFloat(tr.split(',')[5])) / 80);
                const shown = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(i => {
                    const x = getComputedStyle(document.getElementById(i)).transform;
                    return Math.round(-(x === 'none' ? 0 : parseFloat(x.split(',')[5])) / 80);
                }).join('');

                const out = {
                    symbolShown,
                    bannerShown,
                    nudgedToDigit: finalSlot === Math.floor((tempo % 100) / 10),
                    readoutMatchesTempo: parseInt(shown) === tempo,
                    playing: isPlaying,
                    collected: JSON.parse(localStorage.getItem('slotronome.collection') || '[]').includes(id)
                };
                stopMetronome();
                return out;
            }, id);

            t.ok(`${id}: shows in the reel window`, r.symbolShown);
            t.ok(`${id}: announces itself`, r.bannerShown);
            t.ok(`${id}: nudges on to the real digit`, r.nudgedToDigit);
            t.ok(`${id}: the readout ends equal to the tempo`, r.readoutMatchesTempo);
            t.ok(`${id}: the metronome starts`, r.playing);
            t.ok(`${id}: lands on the collection plate`, r.collected);
        }

        t.is('the plate shows all five as found', await page.evaluate(() => {
            renderCollection();
            return [...document.querySelectorAll('.collection-slot')]
                .map(s => s.dataset.symbol + (s.classList.contains('found') ? ':found' : ':dim'));
        }), ['cherry:found', 'bell:found', 'bar:found', 'seven:found', 'diamond:found']);

        // --- a fresh pull during the hold must not fire a stale reveal ---------
        t.is('a second pull during the hold resolves cleanly', await page.evaluate(async () => {
            tempo = 90;
            timeSignature = { numerator: 4, denominator: 4 };
            document.getElementById('min-tempo').value = 120;
            document.getElementById('max-tempo').value = 150;
            updateTempoDisplay(90);
            endModifier();

            const symbol = REEL_SYMBOLS.find(s => s.id === 'seven');
            const realRoll = rollForSymbol;
            rollForSymbol = () => ({ symbol, reelIndex: 1 });
            pullHandle();
            await new Promise(r => setTimeout(r, 3000));      // spin done, symbol holding
            rollForSymbol = () => null;
            document.getElementById('slot-handle').classList.remove('pulled', 'releasing');
            pullHandle();
            await new Promise(r => setTimeout(r, 5000));
            rollForSymbol = realRoll;

            const shown = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(i => {
                const x = getComputedStyle(document.getElementById(i)).transform;
                return Math.round(-(x === 'none' ? 0 : parseFloat(x.split(',')[5])) / 80);
            }).join('');
            const out = {
                readoutMatchesTempo: parseInt(shown) === tempo,
                orphanFrame: reelSpinFrame !== null,
                pendingHold: symbolHoldTimer !== null,
                stuckHighlight: document.querySelectorAll('.digit-container.symbol-hit').length
            };
            stopMetronome();
            return out;
        }), { readoutMatchesTempo: true, orphanFrame: false, pendingHold: false, stuckHighlight: 0 });

        // --- stopping mid-reveal must not arm a modifier with no beats left ----
        t.is('stopping mid-reveal strands nothing', await page.evaluate(async () => {
            endModifier();
            tempo = 90;
            updateTempoDisplay(90);
            const symbol = REEL_SYMBOLS.find(s => s.id === 'bell');
            const realRoll = rollForSymbol;
            rollForSymbol = () => ({ symbol, reelIndex: 1 });
            pullHandle();
            await new Promise(r => setTimeout(r, 3000));      // holding the symbol
            stopMetronome();
            await new Promise(r => setTimeout(r, 3000));
            rollForSymbol = realRoll;
            return {
                strandedModifier: activeModifier !== null,
                pendingHold: symbolHoldTimer !== null,
                orphanFrame: reelSpinFrame !== null
            };
        }), { strandedModifier: false, pendingHold: false, orphanFrame: false });
    }
};
