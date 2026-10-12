'use strict';
/**
 * Prints the numbers quoted in the documentation tables (how-it-works.html,
 * README.md) straight from the engine, so published figures stay honest.
 *   node scripts/docs-numbers.js
 */
const { analyze } = require('../src/detector');

const ACADEMIC = `We set out to test whether retrieval-augmented drafting changes how editors evaluate machine-written paragraphs. Thirty-two editors at two regional newspapers took part over six weeks. Each participant saw 480 paragraphs — half written by colleagues, half produced by three different models — with the source labels removed.

Our first experiment, run in March 2024, produced the result we expected: editors spotted the model paragraphs about 61% of the time. The second experiment did not. Once we allowed participants to see the retrieved sources alongside each paragraph, accuracy fell to 54%, though confidence rose. That combination worries us more than the raw accuracy number, because confident-but-wrong judgments are the ones that reach print.

The methodology has obvious limitations. Our sample skews toward mid-career editors, and we could not control for fatigue across the two sessions. However, the pattern in the data is difficult to explain away: participants lean on fluency as a proxy for accuracy, and fluency is precisely what generators optimize for. We argue that this finding has implications for every newsroom deploying these tools without a verification step.`;

const LEGAL = `The parties hereby agree that the provisions of this agreement shall be governed by the laws of the State of Telangana, and that any dispute arising hereunder shall be subject to the exclusive jurisdiction of the courts at Hyderabad. The Service Provider shall indemnify and hold harmless the Client against all claims, losses and liabilities arising from any breach of the obligations set out herein. Notwithstanding the foregoing, neither party shall be liable for any indirect or consequential loss, including but not limited to loss of profits, data or business opportunity. This clause survives termination of the agreement.`;

const TECH = `To configure the cache, edit config/cache.json and set the max_entries parameter. By default the server reads this file once at startup, so restart the process after any change.

The endpoint returns a JSON object with three fields: status, data and latency_ms. If the token has expired you will receive HTTP 401 and an error field describing the failure. Logging is enabled with the LOG_LEVEL environment variable; set it to debug to log every cache miss.

When the queue is full, the server rejects new requests instead of blocking. This default is deliberate: blocking under load causes thread starvation, and a slow response is worse than a fast error for most clients.`;

const AI_ACADEMIC = `In today's rapidly evolving academic landscape, it is important to note that researchers must leverage robust methodologies to unlock comprehensive insights. Furthermore, the integration of multifaceted theoretical frameworks underscores the transformative potential of interdisciplinary scholarship. Moreover, stakeholders across the academic community should embrace holistic approaches that foster meaningful collaboration. Ultimately, a nuanced understanding of these dynamic systems ensures sustainable advancement of knowledge production.`;

const AI_LEGAL = `It is important to note that this agreement shall hereby govern all aspects of the relationship between the parties. Furthermore, each party shall leverage robust frameworks to ensure comprehensive compliance with applicable provisions. Moreover, the parties should embrace holistic approaches that foster meaningful collaboration. Ultimately, notwithstanding any provision herein, seamless integration of these obligations ensures sustainable outcomes.`;

const ROWS = [
  ['Human academic paper excerpt', ACADEMIC, 'human'],
  ['Legal boilerplate (human)', LEGAL, 'human'],
  ['Technical documentation (human)', TECH, 'human'],
  ['AI text wearing an academic costume', AI_ACADEMIC, 'ai'],
  ['AI text wearing a legal costume', AI_LEGAL, 'ai']
];

console.log('| Text | Universal | With profile | Register | Effect |');
console.log('|---|---|---|---|---|');
for (const [label, text, expect] of ROWS) {
  const r = analyze(text);
  const universal = r.calibration ? r.calibration.uncalibratedScore : r.score;
  const delta = r.calibration ? r.calibration.delta : 0;
  const effect = delta > 0 ? `discounted ${delta} pts of genre-normal style`
    : delta < 0 ? `raised ${Math.abs(delta)} pts — genre makes this phrasing more suspicious`
    : 'no change';
  console.log(`| ${label} | ${universal} | ${r.score} (${r.verdict.label}) | ${r.register.label} [${r.register.quality}] | ${effect} |`);
  if (expect === 'human' && r.score >= 58) console.log(`   ^^ WARNING: expected human, scored ${r.score}`);
  if (expect === 'ai' && r.score < 58) console.log(`   ^^ WARNING: expected AI, scored ${r.score}`);
}

console.log('\n--- sample corpus ---');
const { SAMPLES } = require('../src/samples');
for (const [k, v] of Object.entries(SAMPLES)) {
  const r = analyze(v.text);
  console.log(`${k.padEnd(6)} ${String(r.score).padStart(3)}  ${r.verdict.label.padEnd(20)} ${r.register.label} [${r.register.quality}]  words ${r.stats.words}`);
}
