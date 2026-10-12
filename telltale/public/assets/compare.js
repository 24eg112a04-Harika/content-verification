/* TellTale — compare page */
(function () {
  'use strict';
  const { $, $$, esc, band, pillClass, meter, animateMeters, toast, api } = window.TT;

  const slotsEl = $('#slots');
  const MAX = 4;
  let slots = [
    { label: 'Text A', text: '' },
    { label: 'Text B', text: '' }
  ];

  function slotHTML(s, i) {
    return `
      <div class="card card-pad-lg" data-slot="${i}">
        <div class="card-head">
          <input class="slot-label" value="${esc(s.label)}" aria-label="Label"
            style="background:transparent;border:0;border-bottom:1px dashed var(--line-2);color:var(--ink);font:inherit;font-weight:600;padding:2px 4px;outline:none;max-width:60%">
          <span class="tiny muted mono slot-words">0 words</span>
        </div>
        <div class="editor-shell">
          <textarea class="slot-text" spellcheck="false" placeholder="Paste text ${i + 1}…" style="min-height:210px"></textarea>
        </div>
        ${i >= 2 ? `<div style="text-align:right;margin-top:8px"><button class="btn btn-sm btn-ghost slot-remove">Remove</button></div>` : ''}
      </div>`;
  }

  function render() {
    slotsEl.innerHTML = slots.map(slotHTML).join('');
    $$('[data-slot]').forEach((card) => {
      const i = Number(card.dataset.slot);
      const label = $('.slot-label', card);
      const ta = $('.slot-text', card);
      const wc = $('.slot-words', card);
      ta.value = slots[i].text;
      const upd = () => {
        slots[i].label = label.value;
        slots[i].text = ta.value;
        wc.textContent = `${(ta.value.match(/[A-Za-z0-9']+/g) || []).length} words`;
      };
      label.addEventListener('input', upd);
      ta.addEventListener('input', upd);
      const rm = $('.slot-remove', card);
      if (rm) rm.addEventListener('click', () => { slots.splice(i, 1); render(); });
      upd();
    });
  }

  $('#add').addEventListener('click', () => {
    if (slots.length >= MAX) return toast('Four texts is the maximum');
    slots.push({ label: `Text ${String.fromCharCode(65 + slots.length)}`, text: '' });
    render();
  });

  $('#loadsamples').addEventListener('click', async () => {
    try {
      const [a, h] = await Promise.all([api('/api/sample?kind=ai'), api('/api/sample?kind=human')]);
      slots = [
        { label: 'Marketing copy (suspect)', text: a.text },
        { label: 'Casual forum post (known human)', text: h.text }
      ];
      render();
      toast('Samples loaded');
      run();
    } catch (e) { toast('Could not load samples'); }
  });

  $('#go').addEventListener('click', run);

  async function run() {
    const payload = slots
      .map((s, i) => ({ label: (s.label || `Text ${i + 1}`).trim(), text: s.text.trim() }))
      .filter((s) => (s.text.match(/[A-Za-z0-9']+/g) || []).length >= 12);
    if (payload.length < 2) return toast('Fill at least two boxes with a sentence or more each');
    const btn = $('#go');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Comparing…';
    try {
      const { results } = await api('/api/compare', { method: 'POST', body: JSON.stringify({ texts: payload }) });
      renderResults(results);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Compare texts';
    }
  }

  function renderResults(results) {
    const ok = results.filter((r) => !r.error);
    if (!ok.length) return toast('Nothing could be analysed');
    const sorted = [...ok].sort((a, b) => b.score - a.score);
    const most = sorted[0];
    const least = sorted[sorted.length - 1];
    const gap = most.score - least.score;

    const summary = gap < 12
      ? `All texts score within ${gap} points of each other — on these signals they're more alike than different.`
      : `<strong>${esc(most.label)}</strong> carries the strongest machine signals at ${most.score}, while <strong>${esc(least.label)}</strong> reads most human at ${least.score}. A ${gap}-point spread on identical scales.`;

    $('#out').innerHTML = `
      <div class="card card-pad-lg reveal" style="margin-bottom:16px">
        <p class="card-title">Verdict</p>
        <p style="margin:12px 0 0">${summary}</p>
        <p class="small muted mb0" style="margin-top:10px">Short texts get their scores pulled toward the middle, so read the word counts too. A 60-word sample and a 600-word sample are not equally informative.</p>
      </div>
      <div class="grid grid-${Math.min(ok.length, 4)}" style="gap:16px">
        ${ok.map((r, i) => {
          const b = band(r.score);
          return `
          <div class="card card-pad-lg reveal" style="animation-delay:${i * 60}ms">
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
              ${meter({ score: r.score, size: 132, label: 'AI likelihood' })}
              <div class="pill ${pillClass(r.score)}">${esc(b.label)}</div>
              <h3 style="margin:2px 0 0;font-size:1rem">${esc(r.label)}</h3>
            </div>
            <div class="hr"></div>
            ${r.register && r.register.id !== 'plain' ? `<div class="tiny muted" style="margin-bottom:8px">Profile: <strong style="color:var(--ink-2)">${esc(r.register.label)}</strong> (${esc(r.register.quality)}${r.register.source === 'user' ? ', manual' : ''})${r.calibration && r.calibration.delta ? ` · moved ${r.calibration.delta > 0 ? '−' : '+'}${Math.abs(r.calibration.delta)} pts` : ''}</div>` : ''}
            ${r.paragraphs && r.paragraphs.mixed && r.paragraphs.count > 1 ? `<div class="pill pill-ai" style="margin-bottom:10px">mixed ¶ · ${r.paragraphs.machine} machine / ${r.paragraphs.human} human</div>` : ''}
            <table class="table" style="font-size:0.82rem">
              <tr><td>Words</td><td class="num">${r.stats.words}</td></tr>
              <tr><td>Sentences</td><td class="num">${r.stats.sentences}</td></tr>
              <tr><td>Avg sentence</td><td class="num">${r.stats.avgSentence}</td></tr>
              <tr><td>Burstiness</td><td class="num" style="color:${r.stats.burstiness < 0.4 ? 'var(--ai)' : 'var(--human)'}">${r.stats.burstiness.toFixed(2)}</td></tr>
              <tr><td>Lexical variety</td><td class="num">${(r.stats.ttr * 100).toFixed(0)}%</td></tr>
              <tr><td>Em dashes</td><td class="num">${r.stats.emDashes}</td></tr>
              <tr><td>Confidence</td><td class="num">${esc(r.confidence.id.replace('_', ' '))}</td></tr>
            </table>
            <div style="margin-top:12px">
              <div class="eyebrow" style="margin-bottom:6px">Stock phrases</div>
              ${r.markers.length
                ? `<div class="chips">${r.markers.map((m) => `<span class="chip">${esc(m.phrase)} <b>${m.count}</b></span>`).join('')}</div>`
                : `<span class="small muted">None detected.</span>`}
            </div>
            <p class="small muted" style="margin:12px 0 0">${esc(r.summary)}</p>
          </div>`;
        }).join('')}
      </div>`;
    animateMeters($('#out'));
  }

  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
  render();
})();
