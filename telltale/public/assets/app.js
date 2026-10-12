/* TellTale — shared frontend helpers */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------------------------------------------------- helpers */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const COLORS = {
    human: '#3ddc97', lean_human: '#6fd6a8', mid: '#f5b544', lean_ai: '#ff9166', ai: '#ff6f5e'
  };

  function band(score) {
    if (score === null || score === undefined) return { key: 'mid', color: COLORS.mid, label: '—' };
    if (score < 22) return { key: 'human', color: COLORS.human, label: 'Likely human' };
    if (score < 40) return { key: 'lean_human', color: COLORS.lean_human, label: 'Leans human' };
    if (score < 58) return { key: 'mid', color: COLORS.mid, label: 'Inconclusive' };
    if (score < 76) return { key: 'lean_ai', color: COLORS.lean_ai, label: 'Leans AI' };
    return { key: 'ai', color: COLORS.ai, label: 'Strong AI signals' };
  }
  const pillClass = (score) => (score < 40 ? 'pill-human' : score < 58 ? 'pill-mid' : 'pill-ai');

  const fmt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-IN'));

  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  function meter(opts) {
    const score = opts.score === null || opts.score === undefined ? null : Math.max(0, Math.min(100, opts.score));
    const size = opts.size || 190;
    const stroke = opts.stroke || Math.max(7, Math.round(size * 0.055));
    const r = (size - stroke) / 2 - 2;
    const c = 2 * Math.PI * r;
    const color = score === null ? 'rgba(255,255,255,0.2)' : band(score).color;
    const offset = c * (1 - (score === null ? 0 : score) / 100);
    return `
      <div class="meter${size <= 120 ? ' meter-sm' : ''}" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
          <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
            stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
            data-offset="${offset.toFixed(1)}" style="filter: drop-shadow(0 0 10px ${color}44)"></circle>
        </svg>
        <div class="meter-num">
          <span class="n" style="color:${color}">${score === null ? '—' : score}</span>
          <span class="d">${esc(opts.label || 'AI likelihood')}</span>
        </div>
      </div>`;
  }
  function animateMeters(root) {
    requestAnimationFrame(() => {
      $$('.meter .val', root || document).forEach((el) => { el.style.strokeDashoffset = el.dataset.offset; });
    });
  }

  const bandScale = () => `
    <div class="bandscale">
      <div class="b1"></div><div class="b2"></div><div class="b3"></div><div class="b4"></div><div class="b5"></div>
    </div>
    <div class="bandscale-marks"><span>0 human</span><span>40</span><span>58</span><span>76</span><span>100 AI</span></div>`;

  let toastTimer = null;
  function toast(msg) {
    let el = $('#tt-toast');
    if (!el) { el = document.createElement('div'); el.id = 'tt-toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function copy(text, okMsg) {
    const done = () => toast(okMsg || 'Copied to clipboard');
    if (navigator.clipboard && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { toast('Copy failed — select manually'); }
      ta.remove();
    }
  }

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status });
    return data;
  }

  function initNav() {
    const links = $$('.nav-links a');
    const path = location.pathname.replace(/\/+$/, '') || '/';
    links.forEach((a) => {
      const href = a.getAttribute('href').replace(/\/+$/, '') || '/';
      if (href === path) a.classList.add('active');
    });
    const toggle = $('.nav-toggle');
    const menu = $('.nav-links');
    if (toggle && menu) toggle.addEventListener('click', () => menu.classList.toggle('open'));
  }

  /* -------------------------------------------- live editor highlighting */
  const PHRASE_CACHE = new Map();
  function phraseRe(phrase) {
    if (!PHRASE_CACHE.has(phrase)) {
      const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?\s+/g, "[\\s'\u2019]+");
      PHRASE_CACHE.set(phrase, new RegExp(`(?<![\\w'-])${body}(?![\\w'-])`, 'gi'));
    }
    return PHRASE_CACHE.get(phrase);
  }

  function buildHighlights(text) {
    const LEX = window.TellTaleLexicons;
    if (!LEX || !text) return '';
    const marks = [];
    const add = (re, kind, weight) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        marks.push({ s: m.index, e: m.index + m[0].length, kind, weight });
        if (m[0].length === 0) re.lastIndex++;
      }
    };
    for (const [phrase, w] of LEX.MARKER_PHRASES) add(phraseRe(phrase), 'marker', w);
    const transSrc = LEX.DISCOURSE_OPENERS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // highlight only the opener itself, not the punctuation that precedes it:
    const transRe = new RegExp(`(?:^|[.!?]\\s+|\\n)\\s?(${transSrc})\\b`, 'gim');
    let tm;
    while ((tm = transRe.exec(text)) !== null) {
      const start = tm.index + tm[0].length - tm[1].length;
      marks.push({ s: start, e: tm.index + tm[0].length, kind: 'trans', weight: 2 });
      if (tm[0].length === 0) transRe.lastIndex++;
    }
    add(new RegExp(`\\b(${LEX.FORMAL_WORDS.join('|')})\\b`, 'gi'), 'formal', 1);
    add(new RegExp(LEX.CONTRACTION_RE.source, 'gi'), 'human', 1);
    const casual = LEX.CASUAL_STRONG.concat(LEX.CASUAL_SOFT).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    add(new RegExp(`(?<![\\w'-])(${casual.join('|')})(?![\\w'-])`, 'gi'), 'human', 2);
    add(new RegExp(LEX.EMOJI_GLOBAL_RE.source, 'gu'), 'human', 2);

    const PRIORITY = { marker: 4, trans: 3, human: 2, formal: 1 };
    marks.sort((a, b) => (b.weight * 10 + PRIORITY[b.kind]) - (a.weight * 10 + PRIORITY[a.kind]));
    const taken = [];
    const kept = [];
    for (const m of marks) {
      if (taken.some((t) => m.s < t.e && m.e > t.s)) continue;
      taken.push(m); kept.push(m);
    }
    kept.sort((a, b) => a.s - b.s);

    let html = '';
    let pos = 0;
    for (const m of kept) {
      if (m.s < pos) continue;
      html += esc(text.slice(pos, m.s));
      const cls = m.kind === 'marker' ? (m.weight >= 2 ? 'hl-strong' : 'hl-mild') : `hl-${m.kind}`;
      html += `<mark class="${cls}">${esc(text.slice(m.s, m.e))}</mark>`;
      pos = m.e;
    }
    html += esc(text.slice(pos));
    return html;
  }

  function attachEditor(textarea, layer) {
    if (!textarea || !layer) return { refresh() {} };
    let raf = null;
    const sync = () => {
      layer.innerHTML = buildHighlights(textarea.value) + '\n';
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(340, textarea.scrollHeight) + 'px';
      layer.style.height = textarea.style.height;
    };
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = null; sync(); }); };
    textarea.addEventListener('input', schedule);
    textarea.addEventListener('scroll', () => { layer.scrollTop = textarea.scrollTop; });
    return { refresh: sync, schedule };
  }

  window.TT = { $, $$, esc, band, pillClass, fmt, timeAgo, meter, animateMeters, bandScale, toast, copy, api, initNav, buildHighlights, attachEditor, COLORS };
  document.addEventListener('DOMContentLoaded', initNav);
})();
