'use strict';
/**
 * Tiny JSON-file store. No database, no dependencies.
 * data/scans.json keeps the last N scans + a rolling public feed.
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
// DATA_DIR lets you point persistence at a mounted volume in production.
// Defaults to <repo>/data for local runs.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
// Set STORE_SCANS=false on a public deployment if you don't want submitted text
// persisted to disk. Reports still work; history stays empty.
const PERSIST = String(process.env.STORE_SCANS || 'true').toLowerCase() !== 'false';
const FILE = path.join(DATA_DIR, 'scans.json');
const MAX_SCANS = 400;
const MAX_FEED = 60;
const MAX_STORED_CHARS = 24000;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      schemaVersion: SCHEMA_VERSION,
      scans: Array.isArray(parsed.scans) ? parsed.scans : [],
      feed: Array.isArray(parsed.feed) ? parsed.feed : [],
      counter: parsed.counter || 0
    };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, scans: [], feed: [], counter: 0 };
  }
}

let db = load();
let flushTimer = null;
let lastWriteError = null;

function writeNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);   // atomic: never leave a half-written db behind
    lastWriteError = null;
    return true;
  } catch (err) {
    lastWriteError = err.message;
    process.stderr.write(`[store] write failed: ${err.message}\n`);
    return false;
  }
}

function flushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeNow();
  }, 250);
}

/** Synchronous flush — called on shutdown so nothing in flight is lost. */
function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  return writeNow();
}

const dataFile = () => FILE;
const storageStatus = () => ({
  persisting: PERSIST, dataDir: DATA_DIR, file: FILE, writable: lastWriteError === null, lastWriteError, scans: db.scans.length
});

const preview = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

function createId() {
  db.counter = (db.counter || 0) + 1;
  const rand = Math.random().toString(36).slice(2, 6);
  return `tt_${Date.now().toString(36)}${db.counter.toString(36)}${rand}`;
}

/** Trim the heavy/duplicated parts of a report before storing it. */
function packEvidence(result) {
  if (!result || result.error) return null;
  const { segments, registerOptions, ...rest } = result;
  return rest;
}

function saveScan({ text, result, source = 'web' }) {
  const id = createId();
  const record = {
    id,
    ts: Date.now(),
    source,
    score: result.score,
    rawScore: result.rawScore,
    verdict: result.verdict,
    confidence: result.confidence.id,
    words: result.stats.words,
    sentences: result.stats.sentences,
    burstiness: result.stats.burstiness,
    preview: preview(text),
    text: text.slice(0, MAX_STORED_CHARS),
    markers: result.findings.markers.slice(0, 6).map((m) => m.phrase),
    topSignals: result.topSignals.slice(0, 3).map((s) => s.id),
    register: result.register ? { id: result.register.id, label: result.register.label, quality: result.register.quality, source: result.register.source } : null,
    calibrationDelta: result.calibration ? result.calibration.delta : null,
    paragraphs: result.paragraphs ? {
      shape: result.paragraphs.shape, spread: result.paragraphs.spread, mixed: result.paragraphs.mixed,
      count: result.paragraphs.paragraphs.length, machine: result.paragraphs.machineParagraphs, human: result.paragraphs.humanParagraphs
    } : null,
    engineVersion: result.engineVersion || null,
    evidence: packEvidence(result)
  };

  if (!PERSIST) return { ...record, persisted: false };
  db.scans.unshift(record);
  db.scans = db.scans.slice(0, MAX_SCANS);

  db.feed.unshift({ id, ts: record.ts, score: record.score, verdict: record.verdict.label, words: record.words, preview: record.preview });
  db.feed = db.feed.slice(0, MAX_FEED);

  flushSoon();
  return record.id;
}

function getScan(id) {
  return db.scans.find((s) => s.id === id) || null;
}

function deleteScan(id) {
  const before = db.scans.length;
  db.scans = db.scans.filter((s) => s.id !== id);
  db.feed = db.feed.filter((f) => f.id !== id);
  if (db.scans.length !== before) { flushSoon(); return true; }
  return false;
}

function history(limit = 25) {
  return db.scans.slice(0, Math.min(limit, MAX_SCANS)).map(({ text, ...rest }) => rest);
}

function clearAll() {
  db = { scans: [], feed: [], counter: db.counter || 0 };
  flushSoon();
}

function stats() {
  const scans = db.scans;
  const total = scans.length;
  const scores = scans.map((s) => s.score);
  const avg = total ? scores.reduce((a, b) => a + b, 0) / total : 0;
  const buckets = [
    { label: '0-19', min: 0, max: 19 }, { label: '20-39', min: 20, max: 39 },
    { label: '40-59', min: 40, max: 59 }, { label: '60-79', min: 60, max: 79 },
    { label: '80-100', min: 80, max: 100 }
  ].map((b) => ({ ...b, count: scans.filter((s) => s.score >= b.min && s.score <= b.max).length }));

  const markerCounts = {};
  for (const s of scans) for (const m of s.markers || []) markerCounts[m] = (markerCounts[m] || 0) + 1;
  const topMarkers = Object.entries(markerCounts).map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  const wordsTotal = scans.reduce((n, s) => n + (s.words || 0), 0);
  const verdictCounts = scans.reduce((acc, s) => { acc[s.verdict.id] = (acc[s.verdict.id] || 0) + 1; return acc; }, {});

  const mixedDocs = scans.filter((s) => s.paragraphs && s.paragraphs.mixed).length;
  const registerCounts = {};
  for (const s of scans) {
    const id = (s.register && s.register.id) || 'plain';
    registerCounts[id] = (registerCounts[id] || 0) + 1;
  }
  const calibrated = scans.filter((s) => s.calibrationDelta !== null && s.calibrationDelta !== undefined && s.calibrationDelta !== 0).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    storage: storageStatus(),
    total,
    mixedDocs,
    calibrated,
    registerCounts,
    avgScore: total ? Math.round(avg) : 0,
    aiShare: total ? Math.round((scans.filter((s) => s.score >= 58).length / total) * 100) : 0,
    humanShare: total ? Math.round((scans.filter((s) => s.score < 40).length / total) * 100) : 0,
    wordsTotal,
    buckets,
    topMarkers,
    verdictCounts,
    feed: db.feed.slice(0, 12),
    lastScanTs: total ? scans[0].ts : null
  };
}

module.exports = { saveScan, getScan, deleteScan, history, clearAll, stats, preview, flushNow, dataFile, storageStatus };
