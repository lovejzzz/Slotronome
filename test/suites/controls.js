/**
 * Click and keyboard coverage of every control on the cabinet.
 *
 * The point is breadth, not depth: a handler that throws the first time anyone
 * touches it should never reach a commit. The LUCK button shipped broken
 * because every other test called its function directly instead of clicking it.
 */

module.exports = {
    name: 'controls + keyboard',
    async run(page, t) {
        // --- every clickable thing, in turn -----------------------------------
        const actions = [
            ['LUCK toggle', () => page.click('#luck-toggle')],
            ['LUCK toggle again', () => page.click('#luck-toggle')],
            ['SFX toggle', () => page.click('#sfx-toggle')],
            ['SFX toggle again', () => page.click('#sfx-toggle')],
            ['TAP pad', () => page.click('#tap-pad')],
            ['an accent beat', () => page.locator('.accent-button').nth(1).click()],
            ['min plus', () => page.locator('#min-tempo').locator('xpath=../button[@class="plus"]').click()],
            ['min minus', () => page.locator('#min-tempo').locator('xpath=../button[@class="minus"]').click()],
            ['max plus', () => page.locator('#max-tempo').locator('xpath=../button[@class="plus"]').click()],
            ['bars plus', () => page.locator('#bars-to-change').locator('xpath=../button[@class="plus"]').click()],
            ['change type', () => page.selectOption('#change-type', 'increment')],
            ['increment plus', () => page.locator('#increment-value').locator('xpath=../button[@class="plus"]').click()],
            ['Limit checkbox', () => page.click('#limit-increment')],
            ['open the meter picker', () => page.click('#time-sig-display')],
            ['choose 5/4', () => page.selectOption('#time-signature', '5/4')],
            ['open Set BPM', () => page.evaluate(() => showTempoInputOverlay())],
            ['bpm plus', () => page.locator('#direct-tempo-input').locator('xpath=../button[@class="plus"]').click()],
            ['apply bpm', () => page.click('#apply-tempo-btn')],
            ['open Set BPM again', () => page.evaluate(() => showTempoInputOverlay())],
            ['cancel bpm', () => page.click('#cancel-tempo-btn')],
            ['the lever', () => page.click('#slot-handle')],
            ['start', () => page.click('#start-stop-btn')],
            ['stop', () => page.click('#start-stop-btn')],
            ['scroll a reel', async () => {
                await page.locator('.digit-container').nth(1).hover();
                await page.mouse.wheel(0, -120);
            }],
            ['scroll the meter plate', async () => {
                await page.locator('#time-sig-display').hover();
                await page.mouse.wheel(0, -120);
            }],
            ['scroll the cog', async () => {
                await page.locator('.tempo-gear').hover();
                await page.mouse.wheel(0, -120);
            }]
        ];

        for (const [label, act] of actions) {
            let threw = null;
            try {
                await act();
            } catch (err) {
                threw = err.message.split('\n')[0];
            }
            await page.waitForTimeout(label === 'the lever' ? 4600 : 200);
            t.is(`clicking ${label}`, threw, null);
        }

        await page.evaluate(() => { stopMetronome(); setModifiersEnabled(false, { persist: false }); });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        await page.evaluate(() => setModifiersEnabled(false, { persist: false }));

        // --- Tab reaches everything ---------------------------------------------
        const order = [];
        for (let i = 0; i < 34; i++) {   // enough to reach the end of the cabinet
            await page.keyboard.press('Tab');
            order.push(await page.evaluate(() => {
                const a = document.activeElement;
                return a.id || a.className.split(' ')[0] || a.tagName;
            }));
        }
        t.ok('Tab reaches the meter plate', order.some(o => o.includes('time-sig-display')));
        t.ok('Tab reaches all three reels', order.filter(o => o.includes('digit-container')).length >= 3);
        t.ok('Tab reaches the cog', order.some(o => o.includes('tempo-gear')));
        t.ok('Tab reaches the lever', order.some(o => o.includes('slot-handle')));
        t.ok('Tab reaches every beat', order.filter(o => o.includes('accent-button')).length >= 4);
        t.ok('Tab reaches start', order.some(o => o.includes('start-stop-btn')));
        t.ok('Tab reaches the tap pad', order.some(o => o.includes('tap-pad')));

        // --- shortcuts -------------------------------------------------------------
        const tempoNow = () => page.evaluate(() => tempo);
        await page.evaluate(() => { tempo = 90; updateTempoDisplay(90); document.activeElement.blur(); });

        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);
        t.is('ArrowUp nudges the tempo', await tempoNow(), 91);

        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        t.is('Shift+ArrowDown moves by five', await tempoNow(), 86);

        await page.keyboard.press('Space');
        await page.waitForTimeout(400);
        t.is('Space starts', await page.evaluate(() => isPlaying), true);
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        t.is('Space stops', await page.evaluate(() => isPlaying), false);

        const accents = () => page.evaluate(() => [...accentBeats].sort((a, b) => a - b));
        await page.keyboard.press('3');
        await page.waitForTimeout(100);
        t.is('a number key adds an accent', await accents(), [0, 2]);
        await page.keyboard.press('3');
        await page.waitForTimeout(100);
        t.is('and removes it again', await accents(), [0]);
        await page.keyboard.press('9');
        await page.waitForTimeout(100);
        t.is('a beat outside the bar is ignored', await accents(), [0]);

        t.is('aria-pressed tracks the accents', await page.$$eval('.accent-button',
            els => els.map(e => e.getAttribute('aria-pressed')).join(',')), 'true,false,false,false');

        await page.click('#time-sig-display');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        t.is('Escape closes the meter picker', await page.$eval('#time-signature-popup',
            e => e.classList.contains('active')), false);

        await page.evaluate(() => document.getElementById('tempo-input-overlay').classList.add('active'));
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        t.is('Escape closes Set BPM', await page.$eval('#tempo-input-overlay',
            e => e.classList.contains('active')), false);

        await page.evaluate(() => { tempo = 90; updateTempoDisplay(90); });
        await page.locator('#min-tempo').focus();
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);
        t.is('shortcuts stand down inside a field', await tempoNow(), 90);

        // --- focused controls ------------------------------------------------------
        await page.evaluate(() => { tempo = 90; updateTempoDisplay(90); });
        await page.locator('.digit-container').nth(1).focus();
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(150);
        t.is('ArrowUp on the tens reel carries', await tempoNow(), 100);
        await page.keyboard.press('Home');
        await page.waitForTimeout(150);
        t.is('Home jumps a reel to the minimum', await tempoNow(), await page.evaluate(
            () => parseInt(document.getElementById('min-tempo').value)));

        await page.evaluate(() => { tempo = 90; updateTempoDisplay(90); });
        await page.locator('.tempo-gear').focus();
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(120);
        t.is('ArrowUp on the cog steps by one', await tempoNow(), 91);
    }
};
