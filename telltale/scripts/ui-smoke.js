'use strict';
/**
 * Headless UI smoke test (dev only, needs jsdom installed):
 *   npm install jsdom --no-save && node scripts/ui-smoke.js
 * Loads each page, executes its scripts against the running server, pokes the
 * key interactions, and reports any runtime errors or missing output.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PUBLIC = path.join(__dirname, '..', 'public');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(name, pathname, probe) {
  const html = await (await fetch(BASE + pathname)).text();
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { url: BASE + pathname, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(`window.onerror: ${e.message}`));
  window.fetch = (u, o) => fetch(new URL(u, BASE), o);
  window.confirm = () => true;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  for (const src of srcs) {
    const file = path.join(PUBLIC, src.replace(/^\//, '').split('?')[0]);
    const code = fs.readFileSync(file, 'utf8');
    try { window.eval(code); }
    catch (e) { errors.push(`${src}: ${e.message}`); }
    if (src.endsWith('app.js')) window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }

  await sleep(350);
  let notes = [];
  try { notes = (await probe(window, dom)) || []; }
  catch (e) { errors.push(`probe: ${e.message}`); }

  const status = errors.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${name.padEnd(12)} ${notes.join(' | ') || ''}`);
  errors.forEach((e) => console.log(`     ↳ ${e}`));
  dom.window.close();
  return errors.length;
}

(async () => {
  let fails = 0;
  const words = (t) => (t.match(/[A-Za-z0-9']+/g) || []).length;

  fails += await page('landing', '/', async (w) => {
    const out = [];
    const btn = w.document.querySelector('[data-sample="ai"]');
    if (!btn) throw new Error('sample chip missing');
    w.TT.api('/api/sample?kind=ai').then((s) => {
      const ta = w.document.querySelector('#mini-input');
      ta.value = s.text;
      w.document.querySelector('#mini-go').click();
    });
    await sleep(900);
    const res = w.document.querySelector('#mini-result');
    if (!res.textContent.trim()) throw new Error('quick-check produced no output');
    out.push(`quick-check: ${res.querySelector('.meter-num .n')?.textContent ?? '—'} (${res.textContent.includes('Likely human') ? 'human label' : 'ai-ish label'})`);
    if (!w.document.querySelector('#weights').innerHTML) throw new Error('weights panel empty');
    if (!w.document.querySelector('#bands').innerHTML) throw new Error('bands panel empty');
    return out;
  });

  fails += await page('analyze', '/analyze', async (w) => {
    const out = [];
    const ta = w.document.querySelector('#tt-input');
    const s = await w.TT.api('/api/sample?kind=ai');
    ta.value = s.text;
    ta.dispatchEvent(new w.Event('input'));
    await sleep(500);
    out.push(`counter: ${w.document.querySelector('#count').textContent}`);
    out.push(`mirror marks: ${w.document.querySelectorAll('#layer mark').length}`);
    out.push(`live strip: ${w.document.querySelectorAll('#live .stat').length} cells`);
    w.document.querySelector('#run').click();
    await sleep(1000);
    const r = w.document.querySelector('#results');
    if (!r.querySelector('.meter')) throw new Error('no meter rendered');
    out.push(`report score: ${r.querySelector('.meter-num .n').textContent}`);
    out.push(`signal rows: ${r.querySelectorAll('.signal').length}`);
    out.push(`heatmap: ${r.querySelectorAll('#heat .sent').length} sentences (${r.querySelectorAll('#heat .s-elevated').length} flagged)`);
    out.push(`recs: ${r.querySelectorAll('.rec').length}`);
    if (r.querySelectorAll('.signal').length !== 14) throw new Error('expected 14 signal rows');
    if (!r.querySelector('.rec')) throw new Error('no recommendations');
    if (!w.location.search.includes('id=')) throw new Error('scan id not written to URL');

    // register chips
    const chips = w.document.querySelectorAll('#register-bar .reg-chip');
    out.push(`register chips: ${chips.length}`);
    if (chips.length !== 6) throw new Error('expected 6 register chips');
    if (!r.textContent.includes('Register calibration')) throw new Error('register card missing');

    // paragraph report + sensitivity
    out.push(`paragraph rows: ${r.querySelectorAll('table tbody tr').length}`);
    if (!r.textContent.includes('Paragraph-level report')) throw new Error('paragraph section missing');
    if (!r.textContent.includes('Score sensitivity')) throw new Error('sensitivity card missing');
    if (!r.textContent.includes('Evidence pack')) throw new Error('export card missing');

    // export: markdown built server-side must match what is on screen
    const md = await w.fetch('/api/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ta.value, format: 'md' })
    }).then((x) => x.text());
    const hasSignals = md.includes('## Signal breakdown') && md.includes('## Paragraph-level report');
    out.push(`markdown export: ${md.length} chars, sections ok: ${hasSignals}`);
    if (!hasSignals) throw new Error('markdown export missing sections');

    const bundle = await w.fetch('/api/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ta.value, format: 'json' })
    }).then((x) => x.json());
    const vres = await w.fetch('/api/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle)
    }).then((x) => x.json());
    out.push(`bundle integrity: ${vres.valid ? 'valid' : 'INVALID'} (${bundle.signals.length} signals)`);
    if (!vres.valid) throw new Error('bundle failed integrity verification');

    // manual register override re-runs and labels itself 'assumed'
    const personalChip = Array.from(w.document.querySelectorAll('#register-bar .reg-chip')).find((c) => c.textContent === 'Personal');
    personalChip.click();
    await sleep(1100);
    const r2 = w.document.querySelector('#results');
    const assumed = r2.textContent.includes('assumed');
    out.push(`override → personal: applied=${assumed}`);
    if (!assumed) throw new Error('manual override not labelled assumed');
    return out;
  });

  fails += await page('dashboard', '/dashboard', async (w) => {
    await sleep(700);
    const cards = w.document.querySelectorAll('#stat-cards .stat');
    if (cards.length !== 6) throw new Error(`stat cards: ${cards.length} (expected 6)`);
    const hist = w.document.querySelectorAll('#hist .col');
    if (hist.length !== 5) throw new Error(`histogram cols: ${hist.length}`);
    const rows = w.document.querySelectorAll('#recent tbody tr');
    if (!rows.length) throw new Error('no recent scans rendered');
    const regMix = w.document.body.textContent.includes('Register mix');
    const mixedBadges = w.document.querySelectorAll('tr .pill-ai').length;
    return [`cards: 6`, `histogram: 5`, `recent rows: ${rows.length}`, `feed: ${w.document.querySelectorAll('#feed .feed-item').length}`, `register mix: ${regMix}`, `mixed badges: ${mixedBadges}`];
  });

  fails += await page('compare', '/compare', async (w) => {
    const out = [];
    out.push(`initial slots: ${w.document.querySelectorAll('[data-slot]').length}`);
    w.document.querySelector('#loadsamples').click();
    await sleep(1200);
    const out1 = w.document.querySelector('#out');
    if (!out1.querySelector('.meter')) throw new Error('compare produced no meters');
    out.push(`result cards: ${out1.querySelectorAll('.card').length - 1}`);
    return out;
  });

  for (const p of ['/how-it-works', '/about']) {
    fails += await page(p.replace('/', ''), p, async (w) => [`title: ${w.document.title.slice(0, 24)}`]);
  }

  console.log(fails ? `\n${fails} page(s) with errors` : '\nall pages clean');
  process.exit(fails ? 1 : 0);
})();
