/* TellTale — landing page behaviour */
(function () {
  'use strict';
  const { $, $$, esc, band, pillClass, meter, animateMeters, bandScale, toast, api, buildHighlights } = window.TT;

  const input = $('#mini-input');
  const result = $('#mini-result');
  const words = $('#mini-words');
  const wordCount = (t) => (t.match(/[A-Za-z0-9']+/g) || []).length;

  /* signal weights panel */
  const WEIGHTS = [
    ['Stock "LLM voice" phrases', 3.4, 'ai'],
    ['Sentence-length variance', 2.6, 'ai'],
    ['Transitional openers', 1.8, 'ai'],
    ['Formal register', 1.3, 'ai'],
    ['Personal voice & specifics', 1.3, 'hum'],
    ['Casual imperfections', 1.2, 'hum'],
    ['Contractions', 1.0, 'hum'],
    ['Sentences near average', 1.0, 'ai'],
    ['Em-dash habit', 0.9, 'ai'],
    ['Paragraph uniformity', 0.7, 'ai'],
    ['Questions / exclamations', 0.5, 'hum'],
    ['Determiner openers', 0.5, 'ai'],
    ['Long-word ratio', 0.5, 'ai'],
    ['Recycled openers', 1.0, 'ai']
  ].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...WEIGHTS.map((w) => w[1]));
  const wEl = $('#weights');
  if (wEl) {
    wEl.innerHTML = WEIGHTS.map(([name, w, kind]) => `
      <div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:0.84rem;margin-bottom:5px">
          <span>${esc(name)}</span><span class="mono tiny muted">${w.toFixed(1)}</span>
        </div>
        <div class="bar ${kind === 'hum' ? 'human' : ''}"><i style="width:${(w / max) * 100}%"></i></div>
      </div>`).join('');
  }

  /* band scale + legend */
  const bandsEl = $('#bands');
  if (bandsEl) {
    bandsEl.innerHTML = bandScale() + `
      <div style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line)">
          <span class="small" style="color:var(--human)">0–21 · Likely human</span><span class="tiny muted">wandering rhythm, no stock phrasing</span></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line)">
          <span class="small" style="color:#6fd6a8">22–39 · Leans human</span><span class="tiny muted">polished, but human shape</span></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line)">
          <span class="small" style="color:var(--mid)">40–57 · Inconclusive</span><span class="tiny muted">conflicting or thin evidence</span></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line)">
          <span class="small" style="color:#ff9166">58–75 · Leans AI</span><span class="tiny muted">several machine habits together</span></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0">
          <span class="small" style="color:var(--ai)">76–100 · Strong AI signals</span><span class="tiny muted">saturated with generated style</span></div>
      </div>`;
  }

  /* quick-check widget */
  if (input) {
    input.addEventListener('input', () => { words.textContent = `${wordCount(input.value)} words`; });

    $$('[data-sample]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const s = await api(`/api/sample?kind=${btn.dataset.sample}`);
        input.value = s.text;
        words.textContent = `${wordCount(s.text)} words`;
        input.dispatchEvent(new Event('input'));
        run(true);
      } catch (err) { toast('Could not load sample'); }
    }));

    async function run(fromSample) {
      const text = input.value.trim();
      if (wordCount(text) < 12) return toast('Paste at least a sentence or two');
      result.innerHTML = `<div class="skeleton" style="height:96px"></div>`;
      try {
        const data = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ text, source: fromSample ? 'sample' : 'web' }) });
        const b = band(data.score);
        const top = data.topSignals.slice(0, 3);
        const human = data.humanSignals.slice(0, 2);
        result.innerHTML = `
          <div class="reveal" style="display:flex;gap:18px;align-items:center;border-top:1px dashed var(--line);padding-top:16px">
            ${meter({ score: data.score, size: 116, label: 'AI likelihood' })}
            <div style="min-width:0">
              <div class="pill ${pillClass(data.score)}" style="margin-bottom:8px">${esc(b.label)} · ${esc(data.confidence.label)}</div>
              <p class="small" style="margin-bottom:10px">${esc(data.verdict.blurb.split('. ')[0])}.</p>
              <a class="btn btn-sm" href="/analyze?id=${encodeURIComponent(data.id || '')}">Full report →</a>
            </div>
          </div>
          <div style="margin-top:14px">
            ${top.map((s) => `<div class="tiny muted" style="display:flex;justify-content:space-between;gap:10px;padding:4px 0">
              <span>▲ ${esc(s.name)}</span><span class="mono">${esc(s.display)}</span></div>`).join('')}
            ${human.map((s) => `<div class="tiny muted" style="display:flex;justify-content:space-between;gap:10px;padding:4px 0">
              <span style="color:var(--human)">▼ ${esc(s.name)}</span><span class="mono">${esc(s.display)}</span></div>`).join('')}
          </div>`;
        animateMeters(result);
      } catch (err) {
        result.innerHTML = `<div class="note" style="border-color:rgba(255,111,94,0.4)">${esc(err.message)}</div>`;
      }
    }

    $('#mini-go').addEventListener('click', () => run(false));
    input.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(false); });
  }

  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
})();
