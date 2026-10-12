# TellTale

**AI content verification — stylometric AI-text detection that shows its work.**

Paste text, get an AI-likelihood score built from 14 measurable signals (sentence rhythm,
stock phrasing, register, voice), with a per-signal breakdown, a sentence-level heatmap,
the flagged phrases, and rewrite suggestions.

Since v1.1 it also does the three things a single global score cannot:

* **Register calibration** — academic, legal, technical, journalistic and personal profiles,
  detected from genre markers or set manually, so formal human writing stops being punished
  for being formal. The before/after delta is always disclosed.
* **Paragraph-level reports** — every paragraph re-scored on its own statistics, with
  mixed-authorship detection, so a generated intro on a human body can't hide behind an average.
* **Evidence packs** — Markdown reports for records and JSON bundles with a SHA-256 integrity
  digest (`POST /api/verify` recomputes it), plus score-sensitivity analysis showing how far
  the verdict moves when the strongest signal is withdrawn.

Zero dependencies, one Node process, no third-party APIs.

---

## Run it

```bash
node src/server.js          # → http://localhost:4173
```

Node 18+ required. There is no install step, no build step for the server, and no
configuration. Optional extras:

```bash
node scripts/build-client.js   # regenerate the browser engine bundle (auto-runs on boot)
node scripts/selftest.js       # calibration harness over the built-in samples
```

## Pages

| Route | What's there |
|---|---|
| `/` | Landing page with a working quick-check widget, signal weights, FAQ |
| `/analyze` | The analyser: live highlighting, register profile selector, full report with calibration panel, paragraph table, sensitivity, heatmap, suggestions, export buttons |
| `/compare` | Score 2–4 texts side by side on identical scales |
| `/dashboard` | Scans run, score distribution, recurring phrases, register mix, mixed-authorship documents, delete individual scans or wipe all |
| `/how-it-works` | Full methodology: 14 signals with weights, the arithmetic, register calibration with real before/after numbers, paragraph reports, where it breaks down |
| `/about` | Principles, engineering notes, API reference, ethics |

## API

```bash
POST /api/analyze      { "text": "...", "save": true, "register": "academic" }  → full report
                                                                  # register optional (auto-detect)
POST /api/compare      { "texts": [ {"label","text","register?"}, ... ] }       → 2–4 compact results
POST /api/report       { "text": "...", "format": "md"|"json" }  → evidence pack (unsaved text)
GET  /api/report/:id   ?format=md|json&label=...                 → evidence pack (stored scan)
POST /api/verify       <JSON bundle>                             → SHA-256 integrity check
GET  /api/registers                                              → scoring profiles + adjustments
GET  /api/sample?kind=ai|human|mixed
GET  /api/history?limit=25
GET  /api/scan/:id         DELETE /api/scan/:id
GET  /api/stats            POST   /api/clear
GET  /api/health
```

```bash
curl -s localhost:4173/api/analyze -H 'content-type: application/json' \
  -d '{"text":"It is important to note that teams must leverage robust frameworks."}'
```

Bodies are capped at ~1.5 MB, analyses at 20,000 words, and the API is rate-limited to
90 requests/minute per IP.

## How the score is built

```
raw  = Σ(weightᵢ × aiScoreᵢ) / Σ(weightᵢ)            # weighted mean of applicable signals
adj  = 50 + (raw×100 − 50) × 1.22 × confidenceFactor  # mild decisiveness curve
score = clamp(round(adj), 2, 98)                       # never claims certainty
```

* **14 signals**, grouped into rhythm, vocabulary, punctuation and voice. Signals with no
  data abstain instead of voting (no paragraphs → no paragraph signal).
* **Strongest tells**: stock "LLM voice" phrases (weight 3.4) and sentence-length variance,
  a.k.a. burstiness (2.6).
* **Confidence shrink**: below 80 words the score is pulled 45% back toward 50; below 180
  words, 18%. Short samples cannot support strong claims.
* **Same engine both sides**: the browser scores text live while you type using the bundle
  generated from `src/detector.js`, so previews and reports can never disagree.

### Register calibration

Signals that legitimately differ by genre are re-weighted (formal vocabulary counts 0.45×
in academic text, 0.30× in legal), out-of-register voice signals are muted to 0.25×, and
genre-neutral phrases from the watchlist are discounted — while phrase habits and rhythm
stay near full weight in every register, because no genre explains those away.

| Text | Universal scale | With profile |
|---|---|---|
| Human academic paper excerpt | 30 | **21** |
| Legal boilerplate (human) | 26 | **17** |
| Technical documentation (human) | 39 | **32** |
| AI text wearing an academic costume | 68 | **68** (still flagged) |
| AI text wearing a legal costume | 70 | **68** (still flagged) |

`node scripts/docs-numbers.js` regenerates that table from the engine, so published numbers
can't drift.

### Paragraph reports

Documents are summarised by shape: `mixed` (spread ≥ 28 points — the single score is
misleading by construction), `machine`, `human`, `even`, or `unscored`. Paragraphs under 30
words are listed but not scored.

Calibration on the built-in samples: generated-sounding marketing copy **79**, terse
pompous paragraph **70** (low confidence), bulleted list **60**, edited academic prose
**23** (register-calibrated), casual rambling review **10**. A blended document — machine
paragraph, human paragraph, machine paragraph — averages to **48 · Inconclusive** while the
paragraph report correctly reports `mixed`, spread 45.

## Layout

```
src/server.js       zero-dependency HTTP server + JSON API
src/detector.js     the engine: segmentation, 14 signals, register profiles, paragraph
                    reports, sensitivity, blending, spans, recommendations
src/report.js       evidence packs: Markdown report + SHA-256-signed JSON bundle
src/lexicons.js     phrase/word watchlists with register tags (editable — the taste lives here)
src/store.js        JSON-file persistence (data/scans.json, capped at 400 scans, full evidence kept)
src/samples.js      built-in sample corpus
public/             pages + vanilla JS + one stylesheet (no framework, no CDN)
scripts/            client bundler, calibration harnesses, docs-number generator, UI smoke test
```

## Tests

```bash
node scripts/selftest.js                     # scores, edge cases, segmentation
node scripts/calibration-test.js             # register detection, paragraph reports, overrides
node scripts/docs-numbers.js                 # the numbers quoted in the docs
npm install jsdom --no-save                  # only needed for the UI smoke test
node scripts/ui-smoke.js                     # drives every page against a running server
```

The UI smoke test loads each page in jsdom, executes its real scripts, clicks the sample
chips, runs an analysis, then asserts: 14 signal rows, the heatmap bands, register chips and
override labelling, paragraph table, sensitivity card, Markdown export sections, and JSON
bundle integrity verification.

## Ethics and limits

TellTale measures style. Style is not authorship. Register calibration reduces one known
harm — formal and non-native English writing being flagged for being formal — but it is not a
fix for the others: paraphrased or humanised machine text still slips through, and a weak
register guess is displayed but never applied to the score. Every report carries the
disclaimer, and the tool is designed to start a conversation rather than end one. Do not use
a single score as the basis for accusing, failing or disciplining anyone.

## Storage and privacy

Analysis happens inside this process only. Nothing is sent to an external model or API.
Scans are written to `data/scans.json` (last 400, nothing else), and can be deleted
individually or wiped from the dashboard. Delete the file and there is no trace left.

MIT licensed.
