'use strict';
/**
 * TellTale server — zero dependencies.
 * Static pages from /public + a small JSON API.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { analyze } = require('./detector');
const store = require('./store');
const { SAMPLES } = require('./samples');
const { buildMarkdown, buildBundle, verifyBundle } = require('./report');
const { REGISTER_ORDER, REGISTERS, ENGINE_VERSION } = require('./detector');
const { build: buildClientBundle } = require('../scripts/build-client');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const COMPRESS_MIN = 1024;

const PAGE_ROUTES = {
  '/': 'index.html',
  '/analyze': 'analyze.html',
  '/dashboard': 'dashboard.html',
  '/compare': 'compare.html',
  '/how-it-works': 'how-it-works.html',
  '/about': 'about.html',
  '/privacy': 'privacy.html'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

/* ------------------------------------------------------------ rate limit */
const buckets = new Map();
function rateLimited(ip, limit = 90, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return b.count > limit;
}

/* -------------------------------------------------------- prod hardening */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'X-DNS-Prefetch-Control': 'off',
  // Deliberately no X-Frame-Options / frame-ancestors: the site is designed to be
  // embeddable in preview panes. Add them yourself if you never need that.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; ')
};

function wantsGzip(req) {
  return /\bgzip\b/.test(String((req && req.headers['accept-encoding']) || ''));
}

/* ----------------------------------------------------------------- utils */
function send(req, res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const out = { ...SECURITY_HEADERS, ...headers };
  if (!out['Content-Type']) out['Content-Type'] = 'application/json; charset=utf-8';
  if (!out['Cache-Control']) out['Cache-Control'] = 'no-store';
  const compressible = /^text\/|json|javascript|svg/.test(String(out['Content-Type']));
  if (req && compressible && buf.length >= COMPRESS_MIN && wantsGzip(req)) {
    const gz = zlib.gzipSync(buf, { level: 6 });
    out['Content-Encoding'] = 'gzip';
    out['Vary'] = 'Accept-Encoding';
    out['Content-Length'] = gz.length;
    res.writeHead(status, out);
    return res.end(gz);
  }
  if (status === 304) {
    delete out['Content-Length'];
    res.writeHead(status, out);
    return res.end();
  }
  out['Content-Length'] = buf.length;
  res.writeHead(status, out);
  res.end(buf);
}
const sendJson = (req, res, status, obj) => send(req, res, status, obj);

function readBody(req, limit = 1_500_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serve404(req, res) {
  fs.readFile(path.join(PUBLIC_DIR, '404.html'), (err, buf) => {
    if (err) return send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    send(req, res, 404, buf, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
  });
}

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return serve404(req, res);
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = 'W/"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    if (req.headers['if-none-match'] === etag) {
      return send(req, res, 304, '', { 'Content-Type': type, ETag: etag, 'Cache-Control': cache });
    }
    const headers = { 'Content-Type': type, ETag: etag, 'Cache-Control': cache, 'Last-Modified': st.mtime.toUTCString() };
    const compressible = /^text\/|json|javascript|svg/.test(type);
    if (compressible && st.size >= COMPRESS_MIN && wantsGzip(req)) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
      return fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(req, res, urlPath) {
  let decoded = urlPath;
  try { decoded = decodeURIComponent(urlPath); } catch { /* keep raw */ }
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) return send(req, res, 403, 'Forbidden');
  const cache = path.extname(file).toLowerCase() === '.html' ? 'no-cache' : 'public, max-age=3600';
  serveFile(req, res, file, cache);
}

/* ------------------------------------------------------------------ API */
async function handleApi(req, res, url) {
  const route = url.pathname;
  const method = req.method.toUpperCase();

  if (route === '/api/health') return sendJson(req, res, 200, { ok: true, service: 'telltale', time: Date.now() });

  if (route === '/api/samples' && method === 'GET') {
    return sendJson(req, res, 200, Object.fromEntries(Object.entries(SAMPLES).map(([k, v]) => [k, { label: v.label, note: v.note, words: v.text.split(/\s+/).length }])));
  }

  if (route === '/api/sample' && method === 'GET') {
    const kind = (url.searchParams.get('kind') || 'ai').toLowerCase();
    const sample = SAMPLES[kind] || SAMPLES.ai;
    return sendJson(req, res, 200, { kind: SAMPLES[kind] ? kind : 'ai', ...sample });
  }

  if (route === '/api/analyze' && method === 'POST') {
    const body = await readBody(req);
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return sendJson(req, res, 400, { error: 'No text provided. Paste something with at least a full sentence.' });
    const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
    if (words > 20000) return sendJson(req, res, 413, { error: 'That is over 20,000 words. Split it into parts.' });
    const register = typeof body.register === 'string' && REGISTERS[body.register] ? body.register : null;
    const result = analyze(text, { register });
    if (result.error) return sendJson(req, res, 400, result);
    const id = body.save === false ? null : store.saveScan({ text, result, source: body.source === 'sample' ? 'sample' : 'web' });
    return sendJson(req, res, 200, { id, ...result });
  }

  if (route === '/api/compare' && method === 'POST') {
    const body = await readBody(req);
    const texts = Array.isArray(body.texts) ? body.texts.slice(0, 4) : [];
    if (!texts.length) return sendJson(req, res, 400, { error: 'Provide a "texts" array with 2-4 entries.' });
    const results = texts.map((t, i) => {
      const label = String(t.label || `Text ${i + 1}`).slice(0, 60);
      const text = String(t.text || '');
      const reg = typeof t.register === 'string' && REGISTERS[t.register] ? t.register : null;
      const r = analyze(text, { register: reg });
      if (r.error) return { label, error: r.error };
      return {
        label,
        score: r.score, rawScore: r.rawScore, calibrated: r.calibrated,
        verdict: r.verdict, confidence: r.confidence,
        register: r.register ? { id: r.register.id, label: r.register.label, quality: r.register.quality, source: r.register.source } : null,
        calibration: r.calibration ? { delta: r.calibration.delta, uncalibratedScore: r.calibration.uncalibratedScore } : null,
        paragraphs: r.paragraphs ? { shape: r.paragraphs.shape, spread: r.paragraphs.spread, mixed: r.paragraphs.mixed, machine: r.paragraphs.machineParagraphs, human: r.paragraphs.humanParagraphs, count: r.paragraphs.paragraphs.length } : null,
        stats: r.stats, topSignals: r.topSignals.slice(0, 4),
        markers: r.findings.markers.slice(0, 6),
        summary: r.verdict.blurb
      };
    });
    return sendJson(req, res, 200, { results });
  }

  if (route === '/api/registers' && method === 'GET') {
    return sendJson(req, res, 200, {
      engineVersion: ENGINE_VERSION,
      registers: REGISTER_ORDER.map((id) => ({
        id, label: REGISTERS[id].label, blurb: REGISTERS[id].blurb,
        weights: REGISTERS[id].weights, formalDensityShift: REGISTERS[id].formalDensityShift,
        markerRelax: REGISTERS[id].markerRelax
      }))
    });
  }

  if (route === '/api/report' && method === 'POST') {
    // export an in-hand (unsaved) report without storing it
    const body = await readBody(req);
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return sendJson(req, res, 400, { error: 'No text provided.' });
    const result = analyze(text, { register: REGISTERS[body.register] ? body.register : null });
    if (result.error) return sendJson(req, res, 400, result);
    if (body.format === 'json') {
      return send(req, res, 200, JSON.stringify(buildBundle(result, { label: body.label }), null, 2), {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="telltale-report-${Date.now()}.json"`
      });
    }
    return send(req, res, 200, buildMarkdown(result, { label: body.label }), {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="telltale-report-${Date.now()}.md"`
    });
  }

  if (route === '/api/verify' && method === 'POST') {
    const body = await readBody(req, 6_000_000);
    const bundle = body && body.integrity ? body : body.bundle;
    if (!bundle) return sendJson(req, res, 400, { error: 'POST a TellTale JSON bundle (or {"bundle": {...}})' });
    return sendJson(req, res, 200, verifyBundle(bundle));
  }

  if (route.startsWith('/api/report/') && method === 'GET') {
    const id = decodeURIComponent(route.slice('/api/report/'.length));
    const scan = store.getScan(id);
    if (!scan) return sendJson(req, res, 404, { error: 'Scan not found' });
    const evidence = scan.evidence || scan;
    const format = (url.searchParams.get('format') || 'md').toLowerCase();
    const label = url.searchParams.get('label') || '';
    if (format === 'json') {
      const bundle = buildBundle(evidence, { scanId: id, generatedAt: scan.ts, label });
      return send(req, res, 200, JSON.stringify(bundle, null, 2), {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="telltale-${id}.json"`
      });
    }
    const md = buildMarkdown(evidence, { scanId: id, generatedAt: scan.ts, label });
    return send(req, res, 200, md, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="telltale-${id}.md"`
    });
  }

  if (route === '/api/history' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 25) || 25, 200);
    return sendJson(req, res, 200, { scans: store.history(limit) });
  }

  if (route === '/api/stats' && method === 'GET') {
    return sendJson(req, res, 200, store.stats());
  }

  if (route === '/api/clear' && method === 'POST') {
    store.clearAll();
    return sendJson(req, res, 200, { ok: true });
  }

  if (route.startsWith('/api/scan/') && method === 'GET') {
    const id = decodeURIComponent(route.slice('/api/scan/'.length));
    const scan = store.getScan(id);
    if (!scan) return sendJson(req, res, 404, { error: 'Scan not found' });
    return sendJson(req, res, 200, { scan });
  }

  if (route.startsWith('/api/scan/') && method === 'DELETE') {
    const id = decodeURIComponent(route.slice('/api/scan/'.length));
    const ok = store.deleteScan(id);
    return sendJson(req, res, ok ? 200 : 404, { ok });
  }

  return sendJson(req, res, 404, { error: `Unknown API route: ${route}` });
}

/* --------------------------------------------------------------- server */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  try {
    if (url.pathname.startsWith('/api/')) {
      if (rateLimited(ip)) return sendJson(req, res, 429, { error: 'Too many requests — slow down for a minute.' });
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Method not allowed');

    const route = url.pathname.replace(/\/+$/, '') || '/';
    if (PAGE_ROUTES[route]) return serveStatic(req, res, PAGE_ROUTES[route]);
    if (route === '/favicon.ico') return serveStatic(req, res, 'favicon.svg');
    if (route === '/robots.txt' || route === '/sitemap.xml') return serveStatic(req, res, route.slice(1));
    if (route.startsWith('/assets/')) return serveStatic(req, res, url.pathname);
    return serve404(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) process.stderr.write(`[error] ${req.method} ${url.pathname}: ${err.stack || err.message}\n`);
    if (!res.headersSent) sendJson(req, res, status, { error: err.message || 'Server error' });
    else res.end();
  }
});

try { buildClientBundle(); } catch (err) {
  process.stderr.write('[warn] could not rebuild the browser engine bundle (' + err.message + ') — serving the committed one\n');
}
server.listen(PORT, HOST, () => {
  process.stdout.write(
    '\n  TellTale ' + require('./detector').ENGINE_VERSION + ' · ' + NODE_ENV + '\n' +
    '  → http://' + HOST + ':' + PORT + '\n' +
    '  data: ' + store.dataFile() + (process.env.DATA_DIR ? ' (DATA_DIR)' : '') + '\n' +
    '  pages: /  /analyze  /dashboard  /compare  /how-it-works  /about  /privacy  /api/health\n\n'
  );
});

/* graceful shutdown for containers and PaaS restarts */
const shutdown = (signal) => {
  process.stdout.write('\n[' + signal + '] draining…\n');
  server.close(() => {
    if (typeof store.flushNow === 'function') store.flushNow();
    process.stdout.write('[shutdown] clean exit\n');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
};
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));
process.on('uncaughtException', (err) => {
  process.stderr.write('[uncaught] ' + ((err && err.stack) || err) + '\n');
});
process.on('unhandledRejection', (err) => {
  process.stderr.write('[unhandled] ' + ((err && err.stack) || err) + '\n');
});
