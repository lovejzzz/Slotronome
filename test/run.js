#!/usr/bin/env node
/**
 * Slotronome test runner.
 *
 *   node test/run.js                 run everything
 *   node test/run.js tempo reels     run only the named suites
 *   node test/run.js --slow          include the slow suites (timing, soak)
 *   node test/run.js --headed        watch it happen in a real window
 *
 * Serves the repo over http and drives it with Playwright. No build step, and
 * nothing here ships with the app — the page itself still has no dependencies.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITE_DIR = path.join(__dirname, 'suites');

// Playwright may be a local devDependency or installed globally; accept either
// so the suite runs without a mandatory `npm install` in throwaway environments.
function loadPlaywright() {
    const candidates = [
        'playwright',
        '/opt/node22/lib/node_modules/playwright',
        '/usr/lib/node_modules/playwright',
        '/usr/local/lib/node_modules/playwright'
    ];
    for (const id of candidates) {
        try {
            return require(id);
        } catch {
            /* try the next one */
        }
    }
    console.error('Could not find Playwright.\n  npm install --no-save playwright\nthen re-run.');
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.svg': 'image/svg+xml'
};

function serve() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT)) {
            res.writeHead(403).end();
            return;
        }
        fs.readFile(file, (err, body) => {
            if (err) {
                res.writeHead(404).end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        });
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// Assertion collector handed to each suite.
function makeAsserts() {
    const results = [];
    const t = {
        is(name, actual, expected) {
            const ok = JSON.stringify(actual) === JSON.stringify(expected);
            results.push({ name, ok, actual, expected });
            return ok;
        },
        ok(name, value) {
            return t.is(name, !!value, true);
        },
        // For measurements that are inherently a range rather than a value.
        within(name, actual, min, max) {
            const ok = typeof actual === 'number' && actual >= min && actual <= max;
            results.push({ name, ok, actual, expected: `${min}..${max}` });
            return ok;
        },
        results
    };
    return t;
}

async function main() {
    const args = process.argv.slice(2);
    const slow = args.includes('--slow');
    const headed = args.includes('--headed');
    const only = args.filter(a => !a.startsWith('--'));

    const { chromium } = loadPlaywright();
    const { server, port } = await serve();
    const baseURL = `http://127.0.0.1:${port}/index.html`;

    let suites = fs.readdirSync(SUITE_DIR).filter(f => f.endsWith('.js')).sort()
        .map(f => ({ file: f, mod: require(path.join(SUITE_DIR, f)) }));

    if (only.length) suites = suites.filter(s => only.some(o => s.file.includes(o)));
    if (!slow) suites = suites.filter(s => !s.mod.slow);

    const browser = await chromium.launch({ headless: !headed });
    let failed = 0, total = 0;
    const started = Date.now();

    for (const { mod } of suites) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
        page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

        await page.goto(baseURL, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);

        const t = makeAsserts();
        const label = mod.name.padEnd(22);
        try {
            await mod.run(page, t);
        } catch (err) {
            t.results.push({ name: 'suite threw', ok: false, actual: err.message.split('\n')[0], expected: 'no throw' });
        }

        // An uncaught page error is a failure even if every assertion passed.
        const unexpected = pageErrors.filter(e => !(mod.ignoreErrors || []).some(p => e.includes(p)));
        if (unexpected.length) {
            t.results.push({ name: 'no uncaught page errors', ok: false, actual: [...new Set(unexpected)], expected: [] });
        }

        const bad = t.results.filter(r => !r.ok);
        total += t.results.length;
        failed += bad.length;
        console.log(`${bad.length ? 'FAIL' : ' ok '}  ${label} ${t.results.length - bad.length}/${t.results.length}`);
        for (const r of bad) {
            console.log(`        ${r.name}`);
            console.log(`          actual   ${JSON.stringify(r.actual)}`);
            console.log(`          expected ${JSON.stringify(r.expected)}`);
        }
        await context.close();
    }

    await browser.close();
    server.close();

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n${total - failed}/${total} assertions passed in ${secs}s${slow ? '' : '   (--slow adds the timing and soak suites)'}`);
    process.exit(failed ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
