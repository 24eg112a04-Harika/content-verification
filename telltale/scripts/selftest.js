'use strict';
/** Quick calibration harness: node scripts/selftest.js */
const { analyze } = require('../src/detector');
const { SAMPLES } = require('../src/samples');

const extra = {
  'short casual': 'yeah i dunno, it was fine i guess. nothing special. probably wont go back tbh',
  'single sentence': 'The cat sat on the mat and looked at the window for a long time.',
  'empty-ish': 'ok',
  'listy machine': `Here are the key benefits:
- Improved efficiency across workflows
- Enhanced collaboration between teams
- Greater scalability for growing organizations
- Robust security and compliance features
- Seamless integration with existing tools`,
  'pompous AI': `In the realm of modern education, technology serves as a pivotal catalyst for transformation. Educators must leverage innovative tools to foster engagement and enhance learning outcomes. Moreover, a comprehensive framework is essential to ensure equitable access for all learners. Ultimately, a holistic approach will unlock the full potential of every student.`
};

const rows = [];
for (const [key, s] of Object.entries(SAMPLES)) rows.push([key, s.text]);
for (const [key, t] of Object.entries(extra)) rows.push([key, t]);

for (const [label, text] of rows) {
  const r = analyze(text);
  if (r.error) { console.log(`${label.padEnd(16)} ERROR ${r.error}`); continue; }
  const top = r.topSignals.slice(0, 3).map((s) => `${s.id}:${s.aiScore}`).join(' ');
  console.log(
    `${label.padEnd(16)} score=${String(r.score).padStart(3)} raw=${String(r.rawScore).padStart(5)} conf=${r.confidence.id.padEnd(9)} words=${String(r.stats.words).padStart(4)} burst=${String(r.stats.burstiness).padStart(5)} verdict=${r.verdict.label}`
  );
  console.log(`${' '.repeat(17)}top → ${top}`);
  console.log(`${' '.repeat(17)}markers=${r.findings.markerTotal} recs=${r.recommendations.map((x) => x.id).join(',')}`);
}

// edge cases
console.log('\n--- edge cases ---');
for (const t of ['', '   ', '!!!???', '3.14159 2.71828', '\n\n\n', 'a'.repeat(5000)]) {
  const r = analyze(t);
  console.log(JSON.stringify(t.slice(0, 12)), '→', r.error ? `error: ${r.error}` : `score ${r.score}, sentences ${r.stats.sentences}`);
}

// segmentation check
const { segment } = require('../src/detector');
const seg = segment('Dr. Smith went home. He arrived at 3.5 p.m. "Hello!" she said. Was it fine? Yes... mostly.');
console.log('\nsentences:', seg.filter((s) => s.kind === 'sentence').map((s) => s.text));
