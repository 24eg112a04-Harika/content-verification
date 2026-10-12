'use strict';
/** Register + paragraph + sensitivity validation. node scripts/calibration-test.js */
const { analyze, detectRegister } = require('../src/detector');

const CASES = [
  {
    label: 'AI-ish essay (should stay high)',
    expect: 'ai',
    text: `In today's fast-paced digital landscape, organizations must leverage robust frameworks to unlock their full potential. Furthermore, it is important to note that seamless integration fosters meaningful impact across a myriad of dimensions. Moreover, stakeholders should embrace a holistic approach that underscores the transformative power of innovation. Ultimately, a comprehensive strategy ensures sustainable growth and lasting competitive advantage for the enterprise.`
  },
  {
    label: 'Human academic paper excerpt',
    expect: 'human',
    text: `We set out to test whether retrieval-augmented drafting changes how editors evaluate machine-written paragraphs. Thirty-two editors at two regional newspapers took part over six weeks. Each participant saw 480 paragraphs — half written by colleagues, half produced by three different models — with the source labels removed.

Our first experiment, run in March 2024, produced the result we expected: editors spotted the model paragraphs about 61% of the time. The second experiment did not. Once we allowed participants to see the retrieved sources alongside each paragraph, accuracy fell to 54%, though confidence rose. That combination worries us more than the raw accuracy number, because confident-but-wrong judgments are the ones that reach print.

The methodology has obvious limitations. Our sample skews toward mid-career editors, and we could not control for fatigue across the two sessions. However, the pattern in the data is difficult to explain away: participants lean on fluency as a proxy for accuracy, and fluency is precisely what generators optimize for. We argue that this finding has implications for every newsroom deploying these tools without a verification step.`
  },
  {
    label: 'Legal boilerplate (human, should not be flagged hard)',
    expect: 'human',
    text: `The parties hereby agree that the provisions of this agreement shall be governed by the laws of the State of Telangana, and that any dispute arising hereunder shall be subject to the exclusive jurisdiction of the courts at Hyderabad. The Service Provider shall indemnify and hold harmless the Client against all claims, losses and liabilities arising from any breach of the obligations set out herein. Notwithstanding the foregoing, neither party shall be liable for any indirect or consequential loss, including but not limited to loss of profits, data or business opportunity. This clause survives termination of the agreement.`
  },
  {
    label: 'Technical documentation (human, should not be flagged hard)',
    expect: 'human',
    text: `To configure the cache, edit config/cache.json and set the max_entries parameter. By default the server reads this file once at startup, so restart the process after any change.

The endpoint returns a JSON object with three fields: status, data and latency_ms. If the token has expired you will receive HTTP 401 and an error field describing the failure. Logging is enabled with the LOG_LEVEL environment variable; set it to debug to log every cache miss.

When the queue is full, the server rejects new requests instead of blocking. This default is deliberate: blocking under load causes thread starvation, and a slow response is worse than a fast error for most clients.`
  },
  {
    label: 'Casual message (human, personal register)',
    expect: 'human',
    text: `hey — thanks for sending the draft over, i read it on the train this morning. the middle section is much stronger now but i got lost around the pricing bit. can we cut it down to one table? also ran it past priya and she thinks the tone should be less formal. i'll call you after lunch (probably 2ish) and we can sort it out.`
  }
];

let failures = 0;
for (const c of CASES) {
  const r = analyze(c.text);
  const reg = r.register;
  const ok = c.expect === 'ai' ? r.score >= 58 : r.score < 58;
  if (!ok) failures++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${c.label}`);
  console.log(`      score ${r.score} (raw ${r.rawScore}) · ${r.verdict.label} · conf ${r.confidence.id}`);
  console.log(`      register: ${reg.label} [${reg.quality}/${reg.source}] — ${reg.reason}`);
  if (r.calibration) {
    console.log(`      calibration: ${r.calibration.delta > 0 ? '+' : ''}${r.calibration.delta} (${r.calibration.uncalibratedScore} without profile → ${r.score} with)`);
    console.log(`      relaxed phrases: ${r.register.relaxedPhrases.slice(0, 6).join(', ') || 'none'}`);
  }
  console.log(`      sensitivity: ${r.sensitivity.items.slice(0, 2).map((s) => `${s.id} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(', ')} (max impact ${r.sensitivity.maxImpact})`);
}

// ---- paragraph mixed-authorship check
const blended = [
  `In today's fast-paced digital landscape, organizations must leverage robust frameworks to unlock their full potential. Furthermore, it is important to note that seamless integration fosters meaningful impact across a myriad of dimensions. Moreover, stakeholders should embrace a holistic approach that underscores the transformative power of innovation. Ultimately, a comprehensive strategy ensures sustainable growth and lasting competitive advantage.`,
  `ok so i finally tried the new ramen place near the station and honestly? underwhelming. the broth was fine but 340 rupees for two slices of pork the size of postage stamps is criminal. my friend ordered the spicy version and called it "aggressively mid", which is the most accurate review ive heard all year. i'll probably go back anyway because its a 5 minute walk and theyre open till 2am.`,
  `behind payments, they said already seven of which no wait i told him no.`,
  `The quarterly report reflects a strong performance trajectory across all operating segments. Revenue growth of 14 percent was driven primarily by the enterprise division, while margins remained stable despite currency headwinds. Management expects these trends to continue through the remainder of the fiscal year.`
].join('\n\n');

const pr = analyze(blended);
console.log(`\n=== MIXED DOCUMENT ===`);
console.log(`verdict ${pr.score} · ${pr.verdict.label}`);
console.log(`shape: ${pr.paragraphs.shape} · spread ${pr.paragraphs.spread} · machine paras ${pr.paragraphs.machineParagraphs} · human paras ${pr.paragraphs.humanParagraphs}`);
for (const p of pr.paragraphs.paragraphs) {
  console.log(`  ¶${p.index} ${String(p.words).padStart(3)}w score=${p.score === null ? '—' : String(p.score).padStart(3)} ${p.verdict || 'too short'} ${p.markers.length ? '· ' + p.markers.slice(0, 2).join(', ') : ''}`);
}
if (!pr.paragraphs.mixed) { failures++; console.log('  FAIL: expected mixed authorship to be detected'); }

// ---- full-document high spread should surface a recommendation
const hasMixedRec = pr.recommendations.some((r) => r.id === 'mixed');
console.log(`mixed-authorship recommendation present: ${hasMixedRec}`);
if (!hasMixedRec) failures++;

// ---- manual profile override
const forced = analyze(CASES[1].text, { register: 'personal' });
console.log(`\nmanual override → personal: score ${forced.score} (auto was ${analyze(CASES[1].text).score}), quality ${forced.register.quality}/${forced.register.source}`);
if (forced.register.quality !== 'assumed') { failures++; console.log('  FAIL: override should be flagged as assumed'); }

// ---- plain detection sanity
console.log('\nplain-text detection:', JSON.stringify(detectRegister('The cat sat on the mat. It was a warm afternoon and nothing much happened.')));
console.log('\nacademic detection:', JSON.stringify({ ...detectRegister(CASES[1].text), profile: undefined }));

console.log(failures ? `\n${failures} failure(s)` : '\nall calibration checks passed');
process.exit(failures ? 1 : 0);
