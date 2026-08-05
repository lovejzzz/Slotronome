/**
 * Tempo adjustment: every route that can change the BPM.
 *
 * These started as a differential harness against the previous build. The
 * expectations below are those measured values, pinned — so a regression shows
 * up as a concrete wrong number rather than "something moved".
 */

const setup = (page, t, mn, mx, lim = true) => page.evaluate(([t, mn, mx, lim]) => {
    tempo = t;
    updateTempoDisplay(t);
    document.getElementById('min-tempo').value = mn;
    document.getElementById('max-tempo').value = mx;
    const cb = document.getElementById('limit-increment');
    cb.checked = lim;
    isLimitIncrement = lim;
    isAtMinLimit = false;
    isAtMaxLimit = false;
}, [t, mn, mx, lim]);

const snap = page => page.evaluate(() => ({
    tempo, atMin: isAtMinLimit, atMax: isAtMaxLimit, limit: isLimitIncrement
}));

async function wheelReel(page, index, up) {
    await page.locator('.digit-container').nth(index).hover();
    await page.mouse.wheel(0, up ? -120 : 120);
    await page.waitForTimeout(120);
}

module.exports = {
    name: 'tempo',
    async run(page, t) {
        await page.evaluate(() => setModifiersEnabled(false, { persist: false }));

        // --- each reel steps its own place, and carries -----------------------
        const carry = [
            ['hundreds up from 90', 0, true, 190],
            ['hundreds down from 90 clamps', 0, false, 10],
            ['tens up from 90 carries to 100', 1, true, 100],
            ['tens down from 90', 1, false, 80],
            ['ones up from 90', 2, true, 91],
            ['ones down from 90', 2, false, 89]
        ];
        for (const [name, reel, up, want] of carry) {
            await setup(page, 90, 10, 500);
            await wheelReel(page, reel, up);
            t.is(name, (await snap(page)).tempo, want);
        }

        // the carry cases that were wrong before: 9 rolling over
        for (const [name, from, reel, up, want] of [
            ['99 ones up carries', 99, 2, true, 100],
            ['100 ones down borrows', 100, 2, false, 99],
            ['195 tens up carries', 195, 1, true, 205],
            ['205 tens down borrows', 205, 1, false, 195]
        ]) {
            await setup(page, from, 10, 500);
            await wheelReel(page, reel, up);
            t.is(name, (await snap(page)).tempo, want);
        }

        // --- absolute range --------------------------------------------------
        await setup(page, 10, 10, 500);
        await wheelReel(page, 2, false);
        t.is('floor holds at 10', (await snap(page)).tempo, 10);

        await setup(page, 500, 10, 500);
        await wheelReel(page, 2, true);
        t.is('ceiling holds at 500', (await snap(page)).tempo, 500);

        // every digit of the display is reachable, including 400-500 which was
        // blank while the reels used the placeholder faces from index.html
        t.is('all tempos display the digits they should', await page.evaluate(async () => {
            const bad = [];
            for (const value of [10, 45, 90, 99, 137, 208, 359, 420, 500]) {
                updateTempoDisplay(value);
                await new Promise(r => setTimeout(r, 620));
                const shown = ['hundreds-roller', 'tens-roller', 'ones-roller'].map(id => {
                    const roller = document.getElementById(id);
                    const tr = getComputedStyle(roller).transform;
                    const slot = Math.round(-(tr === 'none' ? 0 : parseFloat(tr.split(',')[5])) / 80);
                    const face = roller.children[slot];
                    return face && !face.classList.contains('digit-symbol') ? face.textContent : 'BLANK';
                }).join('');
                if (shown !== String(value).padStart(3, '0')) bad.push({ value, shown });
            }
            return bad;
        }), []);

        // --- at-limit indicators ---------------------------------------------
        await setup(page, 61, 60, 120);
        await wheelReel(page, 2, false);
        t.is('crossing min raises the flag', await snap(page), { tempo: 60, atMin: true, atMax: false, limit: true });

        await setup(page, 119, 60, 120);
        await wheelReel(page, 2, true);
        t.is('crossing max raises the flag', await snap(page), { tempo: 120, atMin: false, atMax: true, limit: true });

        // --- Limit releases when the tempo leaves the window ------------------
        await setup(page, 90, 60, 90);
        await wheelReel(page, 1, true);
        t.is('leaving the window releases Limit', await snap(page), { tempo: 100, atMin: false, atMax: false, limit: false });

        await setup(page, 80, 60, 120);
        await wheelReel(page, 1, true);
        t.is('staying inside keeps Limit', (await snap(page)).limit, true);

        t.is('checkbox and flag stay in step', await page.evaluate(
            () => document.getElementById('limit-increment').checked === isLimitIncrement), true);

        // --- other routes to the same place ----------------------------------
        // The glass has two scroll zones: the time-signature plate (plus a 20px
        // buffer) changes the meter, everything else changes the tempo. Check
        // the boundary holds, since the plate moved inside the display during
        // the visual remaster and silently widened the meter zone.
        await setup(page, 90, 60, 120);
        const plate = await page.locator('#time-sig-display').boundingBox();
        const firstReel = await page.locator('.digit-container').first().boundingBox();
        const display = await page.locator('.tempo-display').boundingBox();
        const emptyGlass = (plate.x + plate.width + 20 + firstReel.x) / 2;

        await page.mouse.move(emptyGlass, display.y + display.height / 2);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(150);
        t.is('scrolling empty glass steps the tempo by one', (await snap(page)).tempo, 91);

        await setup(page, 90, 60, 120);
        await page.evaluate(() => { timeSignature = { numerator: 4, denominator: 4 }; updateTimeSignatureDisplay(); });
        await page.mouse.move(plate.x + plate.width / 2, plate.y + plate.height / 2);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(200);
        t.is('scrolling the plate changes the meter, not the tempo', await page.evaluate(
            () => ({ tempo, meter: `${timeSignature.numerator}/${timeSignature.denominator}` })),
            { tempo: 90, meter: '5/4' });
        await page.evaluate(() => {
            timeSignature = { numerator: 4, denominator: 4 };
            updateTimeSignatureDisplay();
            createAccentButtons();
        });

        await setup(page, 90, 60, 120);
        const gear = await page.locator('.tempo-gear').boundingBox();
        await page.mouse.move(gear.x + gear.width / 2, gear.y + gear.height / 2);
        await page.mouse.down();
        await page.mouse.move(gear.x + gear.width / 2, gear.y + gear.height / 2 - 60, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        t.is('dragging the cog raises the tempo', (await snap(page)).tempo, 96);

        await setup(page, 90, 60, 120);
        const reel = await page.locator('.digit-container').nth(1).boundingBox();
        await page.mouse.move(reel.x + reel.width / 2, reel.y + reel.height / 2);
        await page.mouse.down();
        await page.mouse.move(reel.x + reel.width / 2, reel.y + reel.height / 2 - 40, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        t.is('dragging the tens reel carries too', (await snap(page)).tempo, 140);

        await setup(page, 90, 60, 120);
        await page.evaluate(() => document.getElementById('tempo-input-overlay').classList.add('active'));
        await page.fill('#direct-tempo-input', '175');
        await page.click('#apply-tempo-btn');
        await page.waitForTimeout(200);
        t.is('the Set BPM dialog applies', (await snap(page)).tempo, 175);

        // --- automatic changes -------------------------------------------------
        await setup(page, 88, 60, 90, true);
        await page.evaluate(() => { changeType = 'increment'; incrementValue = 5; changeMetronomeTempo(); });
        t.is('increment respects Limit', await snap(page), { tempo: 90, atMin: false, atMax: true, limit: true });

        await setup(page, 88, 60, 90, false);
        await page.evaluate(() => { changeType = 'increment'; incrementValue = 5; changeMetronomeTempo(); });
        t.is('increment overshoots without Limit', (await snap(page)).tempo, 93);

        // --- range edits --------------------------------------------------------
        await setup(page, 90, 60, 120);
        await page.locator('#min-tempo').locator('xpath=../button[@class="plus"]').click();
        t.is('the min stepper works', await page.$eval('#min-tempo', e => e.value), '61');

        await setup(page, 70, 60, 120);
        await page.fill('#min-tempo', '95');
        await page.dispatchEvent('#min-tempo', 'change');
        await page.waitForTimeout(120);
        t.is('raising min past the tempo releases Limit', (await snap(page)).limit, false);
    }
};
