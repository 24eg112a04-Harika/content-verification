/* TellTale — analyser page */
(function () {
  'use strict';
  const { $, $$, esc, band, pillClass, fmt, meter, animateMeters, bandScale, toast, copy, api, attachEditor } = window.TT;

  const input = $('#tt-input');
  const layer = $('#layer');
  const countEl = $('#count');
  const liveEl = $('#live');
  const results = $('#results');
  const errEl = $('#err');
  const runBtn = $('#run');

  const DRAFT_KEY = 'telltale.draft.v1';
  const REGISTER_KEY = 'telltale.register.v1';
  const editor = attachEditor(input, layer);
  const wordCount = (t) => (t.match(/[A-Za-z0-9']+/g) || []).length;
  let lastReport = null;
  let registerChoice = null;   // null = auto-detect

  try { registerChoice = localStorage.getItem(REGISTER_KEY) || null; } catch (e) {}

  /* ----------------------------------------------------- register chips */
  const REGISTER_LIST = [
    { id: null, label: 'Auto-detect', hint: 'Work out the register from the text itself' },
    { id: 'academic', label: 'Academic', hint: 'Journals, theses, research writing' },
    { id: 'legal', label: 'Legal', hint: 'Contracts, policy, regulation' },
    { id: 'technical', label: 'Technical', hint: 'Docs, reference, engineering' },
    { id: 'journalistic', label: 'Journalistic', hint: 'News and reportage' },
    { id: 'personal', label: 'Personal', hint: 'Messages, posts, personal writing' }
  ];

  function renderRegisterChips() {
    const el = $('#register-bar');
    if (!el) return;
    el.innerHTML = `<span class="eyebrow nowrap">Scoring profile</span>` + REGISTER_LIST.map((r) => `
      <button class="chip reg-chip${(registerChoice || null) === r.id ? ' on' : ''}" data-reg="${r.id || ''}" title="${esc(r.hint)}">${esc(r.label)}</button>`).join('');
    $$('.reg-chip', el).forEach((b) => b.addEventListener('click', () => {
      registerChoice = b.dataset.reg || null;
      try { registerChoice ? localStorage.setItem(REGISTER_KEY, registerChoice) : localStorage.removeItem(REGISTER_KEY); } catch (e) {}
      renderRegisterChips();
      if (lastReport) run(false);
      else toast(registerChoice ? `Profile set to ${b.textContent} — analyse to apply` : 'Profile set to auto-detect');
    }));
  }
  renderRegisterChips();

  /* ------------------------------------------------------------ live strip */
  let liveTimer = null;
  function liveStats() {
    const text = input.value;
    countEl.textContent = `${fmt(wordCount(text))} words · ${fmt(text.length)} chars`;
    clearTimeout(liveTimer);
    if (wordCount(text) < 20 || !window.TellTale) { liveEl.innerHTML = ''; return; }
    liveTimer = setTimeout(() => {
      let r;
      try { r = window.TellTale.analyze(text, { _nested: true }); } catch (e) { return; }
      if (r.error) { liveEl.innerHTML = ''; return; }
      const b = band(r.score);
      const reg = r.register && r.register.id !== 'plain' ? r.register.label.split(' ')[0].toLowerCase() : 'general';
      const cells = [
        ['Sentences', fmt(r.stats.sentences)],
        ['Avg length', `${r.stats.avgSentence} w`],
        ['Burstiness', r.stats.burstiness.toFixed(2)],
        ['Register', `<span style="font-size:0.95rem">${esc(reg)}</span>`],
        ['Live score', `<span style="color:${b.color}">${r.score}</span>`]
      ];
      liveEl.innerHTML = cells.map(([k, v]) => `
        <div class="stat" style="padding:11px 12px">
          <div class="k">${k}</div><div class="v" style="font-size:1.12rem">${v}</div>
        </div>`).join('');
    }, 320);
  }

  input.addEventListener('input', () => {
    editor.schedule();
    liveStats();
    try { localStorage.setItem(DRAFT_KEY, input.value); } catch (e) {}
    errEl.classList.add('hidden');
  });

  /* -------------------------------------------------------------- samples */
  $$('[data-sample]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      const s = await api(`/api/sample?kind=${btn.dataset.sample}`);
      setText(s.text);
      toast(`Loaded sample: ${s.label}`);
      run(true);
    } catch (err) { toast(err.message); }
  }));
  $('#demo-fill').addEventListener('click', () => { const b = $('[data-sample]'); if (b) b.click(); });
  $('#clear-btn').addEventListener('click', () => {
    setText(''); liveEl.innerHTML = ''; lastReport = null; resetResults(); toast('Cleared');
  });
  $('#upload-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result).slice(0, 400000)); toast(`Loaded ${file.name}`); };
    reader.readAsText(file);
    e.target.value = '';
  });

  function setText(t) {
    input.value = t;
    editor.refresh();
    liveStats();
    try { localStorage.setItem(DRAFT_KEY, t); } catch (e) {}
  }
  function resetResults() {
    results.innerHTML = `<div class="card card-pad-lg">
      <p class="card-title">Report</p>
      <h3 style="margin-top:12px">No analysis yet</h3>
      <p class="small mb0">Paste text on the left and press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.</p></div>`;
  }

  /* ---------------------------------------------------------------- run */
  runBtn.addEventListener('click', () => run(false));
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(false); }
  });

  async function run(fromSample) {
    const text = input.value.trim();
    if (wordCount(text) < 5) { showErr('Paste at least a full sentence first.'); return; }
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> Analysing…';
    errEl.classList.add('hidden');
    try {
      const payload = { text, source: fromSample ? 'sample' : 'web' };
      if (registerChoice) payload.register = registerChoice;
      const data = await api('/api/analyze', { method: 'POST', body: JSON.stringify(payload) });
      lastReport = data;
      renderReport(data);
      if (data.id) history.replaceState({}, '', `/analyze?id=${encodeURIComponent(data.id)}`);
    } catch (err) {
      showErr(err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Analyse text';
    }
  }
  function showErr(msg) { errEl.textContent = msg; errEl.classList.remove('hidden'); }

  /* ------------------------------------------------------------- render */
  function tierOf(s) {
    if (s.aiScore >= 0.62) return { cls: 't-ai', label: 'AI-leaning' };
    if (s.aiScore <= 0.38) return { cls: 't-hum', label: 'human-leaning' };
    return { cls: 't-neu', label: 'neutral' };
  }

  function signalRow(s, totalWeight) {
    const tier = tierOf(s);
    const pts = s.contribution || 0;
    const humanPts = s.applicable ? ((s.weight * (1 - s.aiScore)) / totalWeight) * 100 : 0;
    const dir = s.aiScore >= 0.5 ? '+' : '−';
    const pct = Math.min(100, Math.round(s.aiScore * 100));
    const muted = s.weightMultiplier < 1;
    return `
      <div class="signal${muted ? ' signal-muted' : ''}">
        <div class="signal-top">
          <div style="display:flex;gap:10px;align-items:center;min-width:0;flex-wrap:wrap">
            <span class="signal-tier ${tier.cls}">${tier.label}</span>
            <span class="signal-name">${esc(s.name)}</span>
            ${muted ? `<span class="signal-tier t-mute" title="${esc(s.note || '')}">×${s.weightMultiplier}</span>` : ''}
          </div>
          <span class="signal-val">${esc(s.display)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:9px">
          <div class="bar ${s.aiScore <= 0.38 ? 'human' : ''}" style="flex:1">
            <i style="width:${pct}%"></i>
          </div>
          <span class="mono tiny muted nowrap" title="Effect on the final score">
            ${s.applicable ? `${dir}${(s.aiScore >= 0.5 ? pts : humanPts).toFixed(1)} pts` : 'n/a'}
          </span>
        </div>
        <details>
          <summary>what this measures</summary>
          <p class="signal-about">${esc(s.about)}</p>
          <p class="signal-about">${esc(s.detail)} Weight in the blend: ${s.weight}${s.weightMultiplier !== 1 ? ` (base ${s.baseWeight} × ${s.weightMultiplier})` : ''}. AI-leaning score: ${s.aiScore.toFixed(2)}.</p>
          ${s.note ? `<p class="signal-about" style="color:var(--accent)">${esc(s.note)}</p>` : ''}
        </details>
      </div>`;
  }

  function registerCard(d) {
    const r = d.register;
    if (!r) return '';
    const active = r.active && r.quality !== 'weak';
    const qualityClass = r.quality === 'measured' ? 'pill-human' : r.quality === 'inferred' ? 'pill-accent'
      : r.quality === 'assumed' ? 'pill-mid' : 'pill';
    const cal = d.calibration;
    return `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div class="card-head">
          <p class="card-title">Register calibration</p>
          <span class="pill ${qualityClass}">${esc(r.label)} · ${esc(r.quality)}${r.source === 'user' ? ' / manual' : ''}</span>
        </div>
        <p class="small" style="margin-bottom:10px">${esc(r.reason)}</p>
        <p class="tiny muted">${esc(r.qualityNote)}</p>
        ${active ? `<p class="small">${esc(r.blurb)}</p>` : ''}
        ${cal ? `
          <div class="hr"></div>
          <div class="grid grid-2" style="gap:18px">
            <div>
              <div class="eyebrow" style="margin-bottom:8px">Same text, universal scales</div>
              <div style="display:flex;align-items:center;gap:12px">
                <span class="mono" style="font-size:1.5rem;color:var(--ink-3)">${cal.uncalibratedScore}</span>
                <div class="bar" style="flex:1"><i style="width:${cal.uncalibratedScore}%;background:linear-gradient(90deg,#6b7280,#9ca3af)"></i></div>
              </div>
              <div class="tiny muted" style="margin-top:6px">what a single global scale would say</div>
            </div>
            <div>
              <div class="eyebrow" style="margin-bottom:8px">With the ${esc(r.label.toLowerCase())} profile</div>
              <div style="display:flex;align-items:center;gap:12px">
                <span class="mono" style="font-size:1.5rem;color:${band(d.score).color}">${d.score}</span>
                <div class="bar" style="flex:1"><i style="width:${d.score}%"></i></div>
              </div>
              <div class="tiny muted" style="margin-top:6px">${cal.delta > 0 ? `discounted ${cal.delta} points of genre-normal style` : cal.delta < 0 ? `raised ${Math.abs(cal.delta)} points — this register makes the phrasing more suspicious` : 'no change for this text'}</div>
            </div>
          </div>
          <p class="small" style="margin:12px 0 0">${esc(cal.note)}</p>
        ` : ''}
        ${r.relaxedPhrases && r.relaxedPhrases.length ? `
          <div style="margin-top:12px">
            <div class="eyebrow" style="margin-bottom:8px">Genre-neutral phrases discounted here</div>
            <div class="chips">${r.relaxedPhrases.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div>
          </div>` : ''}
        ${r.evidence && r.evidence.length ? `
          <div style="margin-top:12px">
            <div class="eyebrow" style="margin-bottom:8px">Genre evidence</div>
            <div class="chips">${r.evidence.map((e) => `<span class="chip" style="border-color:var(--line)">${esc(e)}</span>`).join('')}</div>
          </div>` : ''}
      </div>`;
  }

  function sensitivityCard(d) {
    const s = d.sensitivity;
    if (!s || !s.items.length) return '';
    const volatile = s.maxImpact >= 16;
    return `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div class="card-head">
          <p class="card-title">Score sensitivity</p>
          <span class="pill ${volatile ? 'pill-mid' : 'pill-human'}">${volatile ? 'volatile' : 'stable'}</span>
        </div>
        <p class="small">How far the raw score moves if each of these signals is withdrawn. Large swings mean the verdict rests on one measurement — read the score as a range.</p>
        <div class="chips" style="margin-top:6px">
          ${s.items.map((i) => `<span class="chip" title="Withdrawing ${esc(i.name)} moves the raw score by ${i.delta}">${esc(i.name.split(' ')[0])} <b>${i.delta > 0 ? '+' : ''}${i.delta}</b></span>`).join('')}
        </div>
        <p class="tiny muted" style="margin:10px 0 0">Maximum single-signal impact: ${s.maxImpact} points.</p>
      </div>`;
  }

  function paragraphSection(d) {
    const p = d.paragraphs;
    if (!p || !p.paragraphs || p.paragraphs.length < 2) return '';
    const shapePill = { mixed: 'pill-ai', machine: 'pill-ai', human: 'pill-human', even: 'pill-mid', single: '', unscored: '' }[p.shape] || '';
    const shapeLabel = {
      mixed: 'Mixed authorship', machine: 'Uniformly machine-leaning', human: 'Uniformly human',
      even: 'Even middle ground', single: 'One scoreable paragraph', unscored: 'No paragraph long enough to score'
    }[p.shape] || p.shape;
    return `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div class="card-head">
          <p class="card-title">Paragraph-level report</p>
          <span class="pill ${shapePill}">${esc(shapeLabel)}</span>
        </div>
        <p class="small">${p.mixed
          ? `The document is not uniform: paragraph scores run from <strong>${p.min}</strong> to <strong>${p.max}</strong>, a ${p.spread}-point spread. ${p.machineParagraphs} paragraph(s) read machine and ${p.humanParagraphs} read human. Judge this document in pieces.`
          : `Paragraph scores run from ${p.min} to ${p.max} (spread ${p.spread}) around a mean of ${p.mean} — the document reads consistently, so the single overall score is the right summary.`}</p>
        ${p.mixed ? `<div class="note" style="border-color:rgba(255,111,94,0.45);margin-bottom:14px"><strong>Mixed-authorship alert.</strong> A single score for this text would be misleading — the average flattens two different writing processes into the middle. The row-by-row table below is the honest read.</div>` : ''}
        <table class="table">
          <thead><tr><th>¶</th><th class="num">Words</th><th>Score</th><th>Verdict</th><th class="num">Flagged</th><th>Phrases</th></tr></thead>
          <tbody>
            ${p.paragraphs.map((x) => `
              <tr>
                <td class="mono">${x.index}</td>
                <td class="num">${x.words}</td>
                <td style="min-width:120px">
                  ${x.score === null ? '<span class="tiny muted">too short</span>' : `
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="mono" style="color:${band(x.score).color};min-width:26px">${x.score}</span>
                      <div class="bar" style="flex:1;min-width:52px"><i style="width:${x.score}%;background:linear-gradient(90deg,${band(x.score).color}66,${band(x.score).color})"></i></div>
                    </div>`}
                </td>
                <td class="nowrap">${x.verdict ? esc(x.verdict) : '<span class="muted">—</span>'}</td>
                <td class="num">${x.sentences ? `${x.flagged}/${x.sentences}` : '—'}</td>
                <td>${x.markers.length ? `<span class="mono tiny">${esc(x.markers.join(', '))}</span>` : '<span class="muted">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p class="tiny muted" style="margin:12px 0 0">Paragraphs under 30 words are listed but not scored — there is not enough rhythm inside them to measure fairly. "Flagged" counts sentences the heatmap marked machine-like.</p>
      </div>`;
  }

  function exportCard(d) {
    return `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div class="card-head"><p class="card-title">Evidence pack</p></div>
        <p class="small">Take the reasoning with you. The Markdown report is for records and threads; the JSON bundle carries every measurement plus a SHA-256 integrity digest, so anyone can check it hasn't been edited since it was produced.</p>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn btn-sm" id="copy-report">Copy as text</button>
          <button class="btn btn-sm" id="preview-md">Preview Markdown</button>
          <button class="btn btn-sm" id="dl-md">⬇ Markdown report</button>
          <button class="btn btn-sm" id="dl-json">⬇ JSON bundle</button>
          <button class="btn btn-sm btn-ghost" id="verify-bundle">Verify a bundle</button>
        </div>
        <div id="md-preview" class="hidden" style="margin-top:14px">
          <textarea id="md-text" readonly spellcheck="false" style="width:100%;min-height:260px;background:rgba(0,0,0,0.35);color:#cdd3e0;border:1px solid var(--line);border-radius:10px;padding:14px;font-family:var(--mono);font-size:0.76rem;line-height:1.6"></textarea>
          <div class="tiny muted" style="margin-top:8px">Rendered as plain text so you can select and copy it. If downloads are blocked here, this is your escape hatch.</div>
        </div>
        <div id="verify-out" class="note hidden" style="margin-top:14px"></div>
      </div>`;
  }

  function renderReport(d) {
    const b = band(d.score);
    const groups = ['Rhythm', 'Vocabulary', 'Punctuation', 'Voice'];
    const byGroup = groups.map((g) => [g, d.signals.filter((s) => s.group === g).sort((x, y) => y.weight * y.aiScore - x.weight * x.aiScore)]).filter(([, arr]) => arr.length);

    const heat = d.segments.map((seg) => {
      if (seg.kind === 'break') return '<br>';
      if (seg.kind === 'space') return esc(seg.text).replace(/\n/g, '<br>');
      const t = esc(seg.text);
      const cls = `s-${seg.band || 'short'}`;
      const title = (seg.reasons || []).join(' · ');
      return `<span class="sent ${cls}" data-why="${esc(title)}">${t}</span>`;
    }).join('');

    const markerChips = d.findings.markers.length
      ? d.findings.markers.map((m) => `<span class="chip"${m.relaxed ? ' style="opacity:0.55"' : ''} data-why="${esc(m.count)}× in text${m.relaxed ? ' — discounted for this register' : ''}">${esc(m.phrase)} <b>${m.count}</b>${m.relaxed ? ' <span class="tiny">discounted</span>' : ''}</span>`).join('')
      : '<span class="small muted">No stock phrases from the watchlist appeared.</span>';
    const transChips = d.findings.discourse.length
      ? d.findings.discourse.map((m) => `<span class="chip">${esc(m.opener)} <b>${m.count}</b></span>`).join('')
      : '<span class="small muted">None.</span>';
    const formalChips = d.findings.formal.length
      ? d.findings.formal.map((m) => `<span class="chip">${esc(m.word)} <b>${m.count}</b></span>`).join('')
      : '<span class="small muted">None.</span>';
    const contChips = d.findings.contractions.length
      ? d.findings.contractions.map((c) => `<span class="chip" style="border-color:rgba(61,220,151,0.35)">${esc(c)}</span>`).join('')
      : '<span class="small muted">No contractions at all.</span>';
    const casualChips = [...d.findings.casualStrong, ...d.findings.casualSoft]
      .map((c) => `<span class="chip" style="border-color:rgba(61,220,151,0.35)">${esc(c)}</span>`).join('');

    const spansHtml = (list, kind) => list.length
      ? list.map((s) => `<div class="span-item ${kind === 'human' ? 'human' : ''}">
          <q>${esc(s.text.length > 260 ? s.text.slice(0, 257) + '…' : s.text)}</q>
          <div class="why">${kind === 'human' ? 'human markers' : `AI-leaning ${Math.round(s.score * 100)}%`}${(s.reasons || []).length ? ' · ' + esc((s.reasons || []).join(', ')) : ''}</div>
        </div>`).join('')
      : `<p class="small muted mb0">None found.</p>`;

    results.innerHTML = `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
          ${meter({ score: d.score, size: 168, label: 'AI likelihood' })}
          <div style="flex:1;min-width:220px">
            <div class="pill ${pillClass(d.score)}" style="margin-bottom:10px">${esc(d.verdict.label)}</div>
            <p class="small" style="margin-bottom:12px">${esc(d.verdict.blurb)}</p>
            <div class="tiny muted">Raw score ${d.rawScore} ${d.confidence.factor < 1 ? `· shrunk to ${d.score} because the sample is short` : ''}${d.calibrated ? ' · register-calibrated' : ''}</div>
          </div>
        </div>
        <div style="margin-top:20px">
          <div class="needle-track"><div class="bandscale" style="margin:10px 0 6px"></div><div class="needle" style="left:calc(${d.score}% - 1.5px)"></div></div>
          <div class="bandscale-marks"><span>0 human</span><span>40</span><span>58</span><span>76</span><span>100 AI</span></div>
        </div>
        <div class="hr"></div>
        <div class="btn-row">
          <span class="pill ${d.confidence.id === 'low' ? 'pill-mid' : ''}">${esc(d.confidence.label)}</span>
          <span class="small muted" style="flex:1;min-width:200px">${esc(d.confidence.note)}</span>
          ${d.id ? `<a class="btn btn-sm" href="/dashboard">Saved →</a>` : ''}
        </div>
      </div>

      ${registerCard(d)}

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><div class="k">Words</div><div class="v">${fmt(d.stats.words)}</div><div class="s">${fmt(d.stats.sentences)} sentences · ${d.stats.paragraphs} ¶</div></div>
        <div class="stat"><div class="k">Avg sentence</div><div class="v">${d.stats.avgSentence}</div><div class="s">median ${d.stats.medianSentence} · σ ${d.stats.sentenceSd}</div></div>
        <div class="stat ${d.stats.burstiness < 0.4 ? 'ai' : 'human'}"><div class="k">Burstiness</div><div class="v">${d.stats.burstiness.toFixed(2)}</div><div class="s">${d.stats.burstiness < 0.4 ? 'flat rhythm' : 'varied rhythm'}</div></div>
        <div class="stat"><div class="k">Lexical variety</div><div class="v">${(d.stats.ttr * 100).toFixed(0)}%</div><div class="s">${fmt(d.stats.uniqueWords)} unique words</div></div>
      </div>

      ${paragraphSection(d)}
      ${sensitivityCard(d)}

      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <div class="card-head"><p class="card-title">Signal breakdown</p><span class="tiny muted">total weight ${d.totalWeight}</span></div>
        <p class="small">Sorted strongest-first inside each family. "pts" is how much that signal moved the raw score. Signals marked ×N are being discounted or boosted by the register profile.</p>
        ${byGroup.map(([g, arr]) => `
          <div style="margin-top:16px">
            <div class="eyebrow" style="margin-bottom:6px">${esc(g)}</div>
            ${arr.map((s) => signalRow(s, d.totalWeight)).join('')}
          </div>`).join('')}
      </div>

      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <p class="card-title">Sentence heatmap</p>
        <p class="small">Green reads human, red reads machine-like, grey is neutral, plain text was too short to score. Click a sentence for the reason.</p>
        <div class="heat" id="heat">${heat}</div>
        <div class="legend">
          <span><i style="background:rgba(61,220,151,0.5)"></i> human</span>
          <span><i style="background:rgba(160,168,182,0.4)"></i> neutral</span>
          <span><i style="background:rgba(255,111,94,0.5)"></i> machine-like</span>
        </div>
      </div>

      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <p class="card-title">Evidence</p>
        <div class="grid grid-2" style="margin-top:14px;gap:22px">
          <div>
            <div class="eyebrow" style="color:var(--ai);margin-bottom:10px">Machine-leaning passages</div>
            ${spansHtml(d.spans.ai, 'ai')}
          </div>
          <div>
            <div class="eyebrow" style="color:var(--human);margin-bottom:10px">Strong human markers</div>
            ${spansHtml(d.spans.human, 'human')}
          </div>
        </div>
      </div>

      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <p class="card-title">What was found</p>
        <div style="margin-top:14px">
          <div class="eyebrow" style="margin-bottom:8px">Stock phrases (${d.findings.markerTotal})</div>
          <div class="chips" style="margin-bottom:16px">${markerChips}</div>
          <div class="eyebrow" style="margin-bottom:8px">Transitional openers</div>
          <div class="chips" style="margin-bottom:16px">${transChips}</div>
          <div class="eyebrow" style="margin-bottom:8px">Formal-register vocabulary</div>
          <div class="chips" style="margin-bottom:16px">${formalChips}</div>
          <div class="eyebrow" style="margin-bottom:8px">Contractions</div>
          <div class="chips" style="margin-bottom:16px">${contChips}</div>
          ${casualChips ? `<div class="eyebrow" style="margin-bottom:8px">Casual language</div><div class="chips" style="margin-bottom:16px">${casualChips}</div>` : ''}
          <div class="grid grid-4" style="gap:10px">
            <div class="stat" style="padding:11px"><div class="k">Em dashes</div><div class="v" style="font-size:1.1rem">${d.stats.emDashes}</div></div>
            <div class="stat" style="padding:11px"><div class="k">Questions</div><div class="v" style="font-size:1.1rem">${d.findings.questions}</div></div>
            <div class="stat" style="padding:11px"><div class="k">Exclamations</div><div class="v" style="font-size:1.1rem">${d.findings.exclaims}</div></div>
            <div class="stat" style="padding:11px"><div class="k">Emoji</div><div class="v" style="font-size:1.1rem">${d.findings.emoji}</div></div>
          </div>
        </div>
      </div>

      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <p class="card-title">What to change</p>
        <p class="small">If this text is yours and the score worries you, these are the levers that actually move it.</p>
        <div style="margin-top:10px">
          ${d.recommendations.map((r) => `
            <div class="rec rec-${r.severity}">
              <div class="rec-icon">${r.severity === 'high' ? '!' : r.severity === 'medium' ? '~' : 'i'}</div>
              <div style="flex:1">
                <h4>${esc(r.title)}<span class="rec-sev">${r.severity}</span></h4>
                <p>${esc(r.detail)}</p>
              </div>
            </div>`).join('')}
        </div>
      </div>

      ${exportCard(d)}

      <div class="note" style="margin-bottom:40px">${esc(d.disclaimer)}</div>
    `;

    animateMeters(results);
    $$('#heat .sent').forEach((el) => el.addEventListener('click', () => {
      const why = el.dataset.why;
      if (why) toast(why.slice(0, 150));
    }));

    /* ---- export wiring */
    $('#copy-report').addEventListener('click', () => copy(reportText(d), 'Report copied as text'));
    $('#preview-md').addEventListener('click', async () => {
      const box = $('#md-preview');
      const ta = $('#md-text');
      if (box.classList.contains('hidden')) {
        ta.value = 'building…';
        box.classList.remove('hidden');
        try { ta.value = await fetchMarkdown(); }
        catch (e) { ta.value = `Could not build Markdown: ${e.message}`; }
      } else box.classList.add('hidden');
    });
    $('#dl-md').addEventListener('click', () => downloadFile('md'));
    $('#dl-json').addEventListener('click', () => downloadFile('json'));
    $('#verify-bundle').addEventListener('click', pickAndVerify);

    if (window.innerWidth < 1000) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------ exports */
  function reportPayload(format) {
    const body = { text: input.value, format };
    if (registerChoice) body.register = registerChoice;
    return body;
  }

  async function fetchMarkdown() {
    const res = await fetch('/api/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportPayload('md'))
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function fetchBundle() {
    const res = await fetch('/api/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportPayload('json'))
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function downloadFile(format) {
    try {
      const res = await fetch('/api/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload(format))
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telltale-report.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`${format === 'json' ? 'JSON bundle' : 'Markdown report'} downloaded`);
    } catch (err) {
      toast('Download blocked here — use "Preview Markdown" and copy instead');
    }
  }

  async function pickAndVerify() {
    const out = $('#verify-out');
    out.classList.remove('hidden');
    const file = await new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = () => resolve(inp.files && inp.files[0]);
      inp.click();
    });
    if (!file) { out.textContent = 'No file chosen.'; return; }
    try {
      const bundle = JSON.parse(await file.text());
      const res = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle)
      });
      const verdict = await res.json();
      out.style.borderColor = verdict.valid ? 'rgba(61,220,151,0.5)' : 'rgba(255,111,94,0.5)';
      out.innerHTML = verdict.valid
        ? `<strong style="color:var(--human)">Integrity verified.</strong> The digest matches — this bundle has not been altered since it was produced.<br><span class="mono tiny">sha256 ${esc(verdict.actual)}</span>`
        : `<strong style="color:var(--ai)">Integrity check failed.</strong> The stored digest does not match the payload, so this file has been edited.<br><span class="mono tiny">expected ${esc(String(verdict.expected).slice(0, 24))}… got ${esc(String(verdict.actual).slice(0, 24))}…</span>`;
    } catch (err) {
      out.textContent = `Could not read that bundle: ${err.message}`;
    }
  }

  function reportText(d) {
    const lines = [];
    lines.push('TELLTALE REPORT');
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push(`AI-likelihood: ${d.score}/100  (raw ${d.rawScore})`);
    lines.push(`Verdict: ${d.verdict.label}`);
    lines.push(`Confidence: ${d.confidence.label} — ${d.confidence.note}`);
    if (d.register && d.register.active) {
      lines.push(`Register: ${d.register.label} (${d.register.quality}${d.register.source === 'user' ? ', manual' : ''})`);
      if (d.calibration) lines.push(`Calibration: ${d.calibration.uncalibratedScore} without profile → ${d.score} with it (${d.calibration.delta > 0 ? '+' : ''}${d.calibration.delta})`);
    }
    lines.push('');
    lines.push(`Words: ${d.stats.words} | Sentences: ${d.stats.sentences} | Paragraphs: ${d.stats.paragraphs} | Avg sentence: ${d.stats.avgSentence} | Burstiness: ${d.stats.burstiness} | Lexical variety: ${(d.stats.ttr * 100).toFixed(0)}%`);
    lines.push('');
    if (d.paragraphs && d.paragraphs.paragraphs.length > 1) {
      lines.push(`PARAGRAPHS — shape ${d.paragraphs.shape}, spread ${d.paragraphs.spread}`);
      for (const p of d.paragraphs.paragraphs) {
        lines.push(`  ¶${p.index}: ${p.score === null ? 'too short' : `${p.score} (${p.verdict})`} · ${p.words}w · ${p.flagged}/${p.sentences} flagged${p.markers.length ? ' · ' + p.markers.join(', ') : ''}`);
      }
      lines.push('');
    }
    lines.push('TOP MACHINE-LEANING SIGNALS');
    for (const s of d.topSignals) lines.push(`  ▲ ${s.name}: ${s.display} (${s.aiScore.toFixed(2)})`);
    if (d.humanSignals.length) {
      lines.push('');
      lines.push('TOP HUMAN-LEANING SIGNALS');
      for (const s of d.humanSignals) lines.push(`  ▼ ${s.name}: ${s.display}`);
    }
    if (d.findings.markers.length) {
      lines.push('');
      lines.push(`FLAGGED PHRASES (${d.findings.markerTotal})`);
      lines.push('  ' + d.findings.markers.map((m) => `${m.phrase} ×${m.count}${m.relaxed ? ' [discounted]' : ''}`).join(', '));
    }
    if (d.spans.ai.length) {
      lines.push('');
      lines.push('MACHINE-LEANING PASSAGES');
      for (const s of d.spans.ai) lines.push(`  • ${s.text.slice(0, 200)}`);
    }
    lines.push('');
    lines.push('SUGGESTIONS');
    for (const r of d.recommendations) lines.push(`  [${r.severity}] ${r.title} — ${r.detail}`);
    lines.push('');
    lines.push(d.disclaimer);
    return lines.join('\n');
  }

  /* ------------------------------------------------------------ deep links */
  (async function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const sample = params.get('sample');
    try {
      if (id) {
        const { scan } = await api(`/api/scan/${encodeURIComponent(id)}`);
        setText(scan.text);
        // a manually-chosen profile was part of that scan — restore it
        if (scan.register && scan.register.source === 'user' && scan.register.id) {
          registerChoice = scan.register.id;
          try { localStorage.setItem(REGISTER_KEY, registerChoice); } catch (e) {}
          renderRegisterChips();
        }
        await run(false);
        toast('Loaded saved scan');
        return;
      }
      if (sample) {
        const s = await api(`/api/sample?kind=${encodeURIComponent(sample)}`);
        setText(s.text);
        await run(true);
        return;
      }
      let draft = '';
      try { draft = localStorage.getItem(DRAFT_KEY) || ''; } catch (e) {}
      if (draft) { setText(draft); toast('Restored your last draft'); }
      else liveStats();
    } catch (e) {
      liveStats();
    }
  })();

  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
})();
