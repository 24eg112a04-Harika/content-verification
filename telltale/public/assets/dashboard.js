/* TellTale — dashboard */
(function () {
  'use strict';
  const { $, esc, fmt, timeAgo, pillClass, toast, api } = window.TT;

  let auto = false;
  let timer = null;

  async function load() {
    try {
      const [stats, hist] = await Promise.all([api('/api/stats'), api('/api/history?limit=25')]);
      renderStats(stats);
      renderHistogram(stats);
      renderMarkers(stats);
      renderRecent(hist.scans);
      renderFeed(stats.feed);
      $('#last-updated').textContent = `updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      toast(`Load failed: ${err.message}`);
    }
  }

  function renderStats(s) {
    const cards = [
      { k: 'Scans run', v: fmt(s.total), s: s.lastScanTs ? `last ${timeAgo(s.lastScanTs)}` : 'nothing yet', cls: '' },
      { k: 'Average score', v: s.total ? s.avgScore : '—', s: 'across all scans', cls: s.avgScore >= 58 ? 'ai' : s.avgScore < 40 ? 'human' : '' },
      { k: 'AI-leaning', v: s.total ? `${s.aiShare}%` : '—', s: 'scored 58 or above', cls: 'ai' },
      { k: 'Words analysed', v: fmt(s.wordsTotal), s: `${fmt(s.total)} documents`, cls: '' },
      { k: 'Mixed authorship', v: s.total ? fmt(s.mixedDocs) : '—', s: 'documents with a split personality', cls: s.mixedDocs ? 'ai' : '' },
      { k: 'Register-calibrated', v: s.total ? fmt(s.calibrated) : '—', s: 'scores the profile moved', cls: '' }
    ];
    $('#stat-cards').innerHTML = cards.map((c) => `
      <div class="stat ${c.cls}">
        <div class="k">${esc(c.k)}</div>
        <div class="v">${c.v}</div>
        <div class="s">${esc(c.s)}</div>
      </div>`).join('');
  }

  function renderHistogram(s) {
    const max = Math.max(1, ...s.buckets.map((b) => b.count));
    $('#hist').innerHTML = s.buckets.map((b) => `
      <div class="col" title="${b.count} scans between ${b.min} and ${b.max}">
        <span class="ct">${b.count}</span>
        <div class="bar-v" style="height:${Math.max(3, (b.count / max) * 100)}%"></div>
        <span class="lbl">${b.label}</span>
      </div>`).join('');
  }

  function renderMarkers(s) {
    const el = $('#topmarkers');
    if (!s.topMarkers.length) {
      el.innerHTML = `<p class="small muted mb0">No stock phrases logged yet. Run a few scans and the recurring ones will show up here.</p>`;
      return;
    }
    const max = s.topMarkers[0].count;
    el.innerHTML = s.topMarkers.map((m) => `
      <div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:0.86rem;margin-bottom:5px">
          <span class="mono">${esc(m.phrase)}</span><span class="mono tiny muted">×${m.count}</span>
        </div>
        <div class="bar"><i style="width:${(m.count / max) * 100}%"></i></div>
      </div>`).join('') + registerBreakdown(s);
  }

  const REGISTER_LABELS = { plain: 'General', academic: 'Academic', legal: 'Legal', technical: 'Technical', journalistic: 'Journalistic', personal: 'Personal' };
  function registerBreakdown(s) {
    const entries = Object.entries(s.registerCounts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '';
    const total = entries.reduce((n, [, v]) => n + v, 0);
    return `<div class="hr"></div>
      <div class="eyebrow" style="margin-bottom:10px">Register mix</div>
      ${entries.map(([id, n]) => `
        <div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:0.84rem;margin-bottom:4px">
            <span>${esc(REGISTER_LABELS[id] || id)}</span><span class="mono tiny muted">${n}</span>
          </div>
          <div class="bar"><i style="width:${(n / total) * 100}%;background:linear-gradient(90deg,var(--accent),#5eead4)"></i></div>
        </div>`).join('')}`;
  }

  function renderRecent(scans) {
    const el = $('#recent');
    if (!scans.length) {
      el.innerHTML = `<div class="note small">No scans yet. <a href="/analyze" style="color:var(--accent)">Analyse a text →</a></div>`;
      return;
    }
    el.innerHTML = `
      <table class="table">
        <thead><tr><th>Score</th><th>Verdict</th><th>Preview</th><th class="num">Words</th><th class="num">When</th><th></th></tr></thead>
        <tbody>
          ${scans.map((s) => `
            <tr>
              <td class="num"><span class="pill ${pillClass(s.score)}">${s.score}</span></td>
              <td class="nowrap">${esc(s.verdict.label)}</td>
              <td class="prev">${esc(s.preview)}
                <div class="tiny muted mono" style="margin-top:4px">
                  ${s.register && s.register.id !== 'plain' ? `<span class="pill" style="padding:1px 7px;font-size:0.66rem">${esc(s.register.label.split(' ')[0])}</span> ` : ''}
                  ${s.paragraphs && s.paragraphs.mixed ? '<span class="pill pill-ai" style="padding:1px 7px;font-size:0.66rem">mixed ¶</span> ' : ''}
                  ${s.markers && s.markers.length ? `flagged: ${esc(s.markers.slice(0, 3).join(', '))}` : ''}
                </div></td>
              <td class="num">${fmt(s.words)}</td>
              <td class="num">${timeAgo(s.ts)}</td>
              <td class="num nowrap">
                <a href="/analyze?id=${encodeURIComponent(s.id)}" class="btn btn-sm btn-ghost" style="padding:4px 9px">open</a>
                <button class="btn btn-sm btn-ghost del" data-id="${esc(s.id)}" style="padding:4px 9px">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    el.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/api/scan/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' }); toast('Scan deleted'); load(); }
      catch (e) { toast('Delete failed'); }
    }));
  }

  function renderFeed(feed) {
    const el = $('#feed');
    if (!feed.length) { el.innerHTML = `<p class="small muted mb0">Empty for now.</p>`; return; }
    el.innerHTML = feed.map((f) => `
      <div class="feed-item">
        <span class="pill ${pillClass(f.score)}">${f.score}</span>
        <div style="min-width:0">
          <div class="small" style="color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(f.preview)}</div>
          <div class="tiny muted mono">${esc(f.verdict)} · ${fmt(f.words)} words</div>
        </div>
        <span class="ft">${timeAgo(f.ts)}</span>
      </div>`).join('');
  }

  $('#refresh').addEventListener('click', () => { load(); toast('Refreshed'); });
  $('#auto-btn').addEventListener('click', (e) => {
    auto = !auto;
    e.target.classList.toggle('on', auto);
    e.target.textContent = `⟳ auto-refresh: ${auto ? 'on' : 'off'}`;
    clearInterval(timer);
    if (auto) timer = setInterval(load, 15000);
  });
  $('#clear').addEventListener('click', async () => {
    if (!confirm('Wipe all stored scans? This cannot be undone.')) return;
    try { await api('/api/clear', { method: 'POST' }); toast('History wiped'); load(); }
    catch (e) { toast('Failed to wipe'); }
  });

  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
  load();
})();
