'use strict';
/**
 * Evidence-pack builders: a human-readable Markdown report and a signed,
 * self-describing JSON bundle suitable for editorial records.
 */
const crypto = require('crypto');

const bar = (v, width = 20) => {
  const filled = Math.max(0, Math.min(width, Math.round((v / 100) * width)));
  return '`' + '█'.repeat(filled) + '░'.repeat(width - filled) + '` ' + v + '/100';
};

const pct = (n) => `${Math.round(n * 100)}%`;

function signalTable(signals) {
  const rows = signals
    .filter((s) => s.applicable)
    .sort((a, b) => b.weight * b.aiScore - a.weight * a.aiScore)
    .map((s) => `| ${s.name} | ${s.group} | ${s.display} | ${s.aiScore.toFixed(2)} | ${s.weight}${s.weightMultiplier !== 1 ? ` (${s.baseWeight}×${s.weightMultiplier})` : ''} | ${s.contribution} |`);
  return ['| Signal | Group | Measurement | AI-lean | Weight | Points |',
    '|---|---|---|---|---|---|', ...rows].join('\n');
}

function buildMarkdown(report, meta = {}) {
  const r = report;
  const L = [];
  const when = new Date(meta.generatedAt || Date.now()).toISOString();

  L.push('# TellTale evidence pack');
  L.push('');
  L.push(`- Generated: ${when}`);
  L.push(`- Engine: TellTale ${r.engineVersion || 'n/a'}`);
  if (meta.scanId) L.push(`- Scan id: \`${meta.scanId}\``);
  if (meta.label) L.push(`- Label: ${meta.label}`);
  L.push('');

  L.push('## Verdict');
  L.push('');
  L.push(`**AI-likelihood: ${r.score}/100** — ${r.verdict.label}`);
  L.push('');
  L.push(bar(r.score));
  L.push('');
  L.push(`- Raw (unshrunk) score: ${r.rawScore}`);
  L.push(`- Confidence: ${r.confidence.label} (${pct(r.confidence.factor)}) — ${r.confidence.note}`);
  if (r.sensitivity && r.sensitivity.maxImpact) {
    L.push(`- Volatility: withdrawing the strongest single signal moves the raw score by ~${r.sensitivity.maxImpact} pts`);
  }
  L.push(`- ${r.verdict.blurb}`);
  L.push('');

  if (r.register) {
    L.push('## Register');
    L.push('');
    L.push(`- Profile: **${r.register.label}** (${r.register.quality}, ${r.register.source})`);
    L.push(`- ${r.register.reason}`);
    L.push(`- ${r.register.qualityNote}`);
    if (r.register.relaxedPhrases && r.register.relaxedPhrases.length) {
      L.push(`- Genre-neutral phrases discounted: ${r.register.relaxedPhrases.join(', ')}`);
    }
    if (r.calibration) {
      L.push(`- Calibration: uncalibrated ${r.calibration.uncalibratedScore} → calibrated ${r.score} (${r.calibration.delta > 0 ? '+' : ''}${r.calibration.delta})`);
      L.push(`- ${r.calibration.note}`);
    }
    L.push('');
  }

  L.push('## Document statistics');
  L.push('');
  L.push(`Words: ${r.stats.words} · Sentences: ${r.stats.sentences} · Paragraphs: ${r.stats.paragraphs}`);
  L.push(`Average sentence: ${r.stats.avgSentence} words (median ${r.stats.medianSentence}, σ ${r.stats.sentenceSd})`);
  L.push(`Burstiness (sentence-length CV): ${r.stats.burstiness}`);
  L.push(`Lexical variety: ${pct(r.stats.ttr)} · Em dashes: ${r.stats.emDashes}`);
  L.push('');

  L.push('## Signal breakdown');
  L.push('');
  L.push(signalTable(r.signals));
  L.push('');
  if (r.sensitivity && r.sensitivity.items.length) {
    L.push('Sensitivity (raw-score movement if the signal is withdrawn): ' +
      r.sensitivity.items.map((s) => `${s.name} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(', '));
    L.push('');
  }

  if (r.paragraphs && r.paragraphs.paragraphs.length > 1) {
    L.push('## Paragraph-level report');
    L.push('');
    L.push(`Shape: **${r.paragraphs.shape}** · spread ${r.paragraphs.spread} pts · ${r.paragraphs.machineParagraphs} machine-leaning, ${r.paragraphs.humanParagraphs} human-leaning paragraph(s)`);
    L.push('');
    L.push('| # | Words | Score | Verdict | Flagged sentences | Phrases |');
    L.push('|---|---|---|---|---|---|');
    for (const p of r.paragraphs.paragraphs) {
      L.push(`| ${p.index} | ${p.words} | ${p.score === null ? '—' : p.score} | ${p.verdict || 'too short to score'} | ${p.flagged}/${p.sentences} | ${p.markers.join(', ') || '—'} |`);
    }
    L.push('');
  }

  if (r.findings.markers.length) {
    L.push('## Flagged phrases');
    L.push('');
    L.push(r.findings.markers.map((m) => `\`${m.phrase}\` ×${m.count}${m.relaxed ? ' (discounted for register)' : ''}`).join(', '));
    L.push('');
  }
  if (r.findings.discourse.length) {
    L.push('## Transitional openers');
    L.push('');
    L.push(r.findings.discourse.map((d) => `\`${d.opener}\` ×${d.count}`).join(', '));
    L.push('');
  }

  if (r.topSignals.length) {
    L.push('## Machine-leaning signals (top)');
    L.push('');
    for (const s of r.topSignals) L.push(`- **${s.name}** — ${s.display} (AI-lean ${s.aiScore.toFixed(2)}, weight ${s.weight})`);
    L.push('');
  }
  if (r.humanSignals.length) {
    L.push('## Human-leaning signals (top)');
    L.push('');
    for (const s of r.humanSignals) L.push(`- **${s.name}** — ${s.display} (human-lean ${s.humanScore.toFixed(2)})`);
    L.push('');
  }

  if (r.spans && r.spans.ai.length) {
    L.push('## Machine-leaning passages');
    L.push('');
    for (const s of r.spans.ai) L.push(`> ${s.text}`);
    L.push('');
  }

  if (r.recommendations && r.recommendations.length) {
    L.push('## What to change');
    L.push('');
    for (const rec of r.recommendations) L.push(`- **${rec.title}** _(${rec.severity})_ — ${rec.detail}`);
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(r.disclaimer);
  L.push('');
  return L.join('\n');
}

/** SHA-256 over the deterministic payload, so a bundle can be shown unmodified later. */
function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildBundle(report, meta = {}) {
  const payload = {
    generator: 'TellTale',
    engineVersion: report.engineVersion || null,
    schema: meta.schema || 'telltale.evidence/v1',
    generatedAt: new Date(meta.generatedAt || Date.now()).toISOString(),
    scanId: meta.scanId || null,
    label: meta.label || null,
    bytesAnalysed: report.stats.chars,
    verdict: report.verdict,
    score: report.score,
    rawScore: report.rawScore,
    confidence: report.confidence,
    register: report.register || null,
    calibration: report.calibration || null,
    stats: report.stats,
    signals: report.signals.map((s) => ({
      id: s.id, name: s.name, group: s.group, display: s.display,
      aiScore: s.aiScore, humanScore: s.humanScore, weight: s.weight,
      baseWeight: s.baseWeight, weightMultiplier: s.weightMultiplier, contribution: s.contribution
    })),
    sensitivity: report.sensitivity || null,
    paragraphs: report.paragraphs ? {
      shape: report.paragraphs.shape, spread: report.paragraphs.spread, mixed: report.paragraphs.mixed,
      entries: report.paragraphs.paragraphs.map((p) => ({
        index: p.index, words: p.words, sentences: p.sentences, score: p.score,
        verdict: p.verdict, flaggedSentences: p.flagged, markers: p.markers
      }))
    } : null,
    findings: report.findings,
    spans: report.spans,
    recommendations: report.recommendations || [],
    disclaimer: report.disclaimer
  };
  payload.integrity = { algorithm: 'sha256', scope: 'payload-minus-integrity', digest: hashPayload(payload) };
  return payload;
}

function verifyBundle(bundle) {
  if (!bundle || !bundle.integrity || !bundle.integrity.digest) return { valid: false, reason: 'No integrity block found' };
  const clone = JSON.parse(JSON.stringify(bundle));
  const expected = clone.integrity.digest;
  delete clone.integrity;
  const actual = hashPayload(clone);
  return { valid: actual === expected, expected, actual };
}

module.exports = { buildMarkdown, buildBundle, verifyBundle, hashPayload };
