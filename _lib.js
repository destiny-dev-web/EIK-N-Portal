const crypto = require('crypto');
const SEED = require('./_seed');

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const DEPTS = ['Photography', 'Video Editing', 'Graphic Design', 'Social Media / Content Creation', 'General Studies'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional'];
const VAULT_CATS = ['Templates', 'Presets', 'Fonts', 'Stock', 'Editing Assets', 'Checklists', 'E-books', 'Tutorials', 'Recommended Tools'];
const IDLE_MS = 10 * 60 * 1000;
const CONTENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', zip: 'application/zip', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg', cube: 'application/octet-stream', xmp: 'application/octet-stream' };
const SEMS = ['1', '2'];
const DAYS_ALL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_TT = DAYS_ALL.slice(1).concat([]).slice(0, 6); // Monday to Saturday
const ROLES = ['hod', 'lecturer', 'desk_officer', 'director'];

/* ---------- database ---------- */
async function cmd(args) {
  if (!REST_URL || !REST_TOKEN) throw new ApiError(500, 'Database is not configured.');
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
async function getDoc(name) {
  const v = await cmd(['GET', 'eikon:' + name]);
  return v ? JSON.parse(v) : clone(SEED[name]);
}
async function setDoc(name, value) { await cmd(['SET', 'eikon:' + name, JSON.stringify(value)]); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function acquire(name) {
  const token = crypto.randomBytes(8).toString('hex');
  for (let i = 0; i < 60; i++) {
    const ok = await cmd(['SET', 'eikon:lock:' + name, token, 'NX', 'EX', '8']);
    if (ok === 'OK') return token;
    await sleep(40 + Math.random() * 60);
  }
  throw new ApiError(503, 'The system is busy. Please try again.');
}
async function release(name, token) {
  try { if ((await cmd(['GET', 'eikon:lock:' + name])) === token) await cmd(['DEL', 'eikon:lock:' + name]); } catch (e) { /* lock expires on its own */ }
}
// Read, change and save documents safely, one writer at a time.
async function mutate(names, fn) {
  const sorted = [...new Set(names)].sort();
  const tokens = {};
  try {
    for (const n of sorted) tokens[n] = await acquire(n);
    const docs = {};
    for (const n of sorted) docs[n] = await getDoc(n);
    const out = await fn(docs);
    for (const n of sorted) await setDoc(n, docs[n]);
    return out;
  } finally {
    for (const n of sorted) if (tokens[n]) await release(n, tokens[n]);
  }
}

async function rateLimit(key, max, windowSec) {
  const n = await cmd(['INCR', 'eikon:rl:' + key]);
  if (n === 1) await cmd(['EXPIRE', 'eikon:rl:' + key, String(windowSec)]);
  if (n > max) throw new ApiError(429, 'Too many attempts. Please wait and try again later.');
}

/* ---------- passwords ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [t, salt, h] = String(stored || '').split('$');
  if (t !== 'scrypt' || !salt || !h) return false;
  const a = crypto.scryptSync(String(pw), salt, 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(String(a))), Buffer.from(sha256(String(b))));

/* ---------- sessions ---------- */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new ApiError(500, 'Server is not configured (SESSION_SECRET).');
  return s;
}
const sign = (p) => crypto.createHmac('sha256', secret()).update(p).digest('base64url');
const TTL = { student: 7 * 24 * 3600, staff: 12 * 3600 };
function setSessionCookie(res, portal, uid, issuedAt) {
  const now = Date.now();
  const p = Buffer.from(JSON.stringify({ u: uid, i: issuedAt || now, a: now, e: (issuedAt || now) + TTL[portal] * 1000 })).toString('base64url');
  res.setHeader('Set-Cookie', `eikon_${portal}=${p}.${sign(p)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL[portal]}`);
}
function clearSessionCookie(res, portal) {
  res.setHeader('Set-Cookie', `eikon_${portal}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function readSession(req, portal) {
  const jar = {};
  String(req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  const tok = jar['eikon_' + portal];
  if (!tok || !tok.includes('.')) return null;
  const [p, sig] = tok.split('.');
  let good;
  try { good = sign(p); } catch (e) { return null; }
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.e > Date.now() ? d : null;
  } catch (e) { return null; }
}
// The person behind this request, checked against the database every time.
async function currentUser(req, portal) {
  const s = readSession(req, portal);
  if (!s) return {};
  if (Date.now() - (s.a || s.i) > IDLE_MS) return { idle: true };
  const dir = await getDoc('directory');
  const user = dir.users.find((u) => u.id === s.u);
  if (!user) return {};
  if ((portal === 'student') !== (user.role === 'student')) return {};
  if (user.validAfter && s.i < user.validAfter) return {};
  if (user.role !== 'student' && user.keyId) {
    const keys = await getDoc('keys');
    const k = keys.keys.find((x) => x.id === user.keyId);
    if (!k || k.status !== 'active') return { disabled: true };
  }
  return { user, dir, session: s };
}

/* ---------- validation ---------- */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gamil.com': 'gmail.com', 'gmil.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'yahho.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlook.con': 'outlook.com' };
const DISPOSABLE = ['mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com'];
function cleanEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.includes('..') || e.length > 120) throw new ApiError(400, 'That email address is not written correctly.');
  const [local, domain] = e.split('@');
  if (TYPOS[domain]) throw new ApiError(400, `Did you mean ${local}@${TYPOS[domain]}? Please correct the email.`);
  if (DISPOSABLE.includes(domain)) throw new ApiError(400, 'Temporary email addresses are not accepted. Use your personal email.');
  if (domain === 'gmail.com') {
    const l = local.replace(/\./g, '');
    if (!/^[a-z0-9.]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || l.length < 6 || l.length > 30) throw new ApiError(400, 'That is not a valid Gmail address.');
  }
  return e;
}
function text(v, label, min, max) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new ApiError(400, `${label} must be ${min}–${max} characters.`);
  return s;
}
function password(v) {
  const s = String(v == null ? '' : v);
  if (s.length < 8 || s.length > 100) throw new ApiError(400, 'Password must be at least 8 characters.');
  return s;
}
function oneOf(v, list, label) {
  if (!list.includes(v)) throw new ApiError(400, `Choose a valid ${label}.`);
  return v;
}
const uid = () => crypto.randomBytes(5).toString('hex');
const gradeFor = (s) => (s >= 70 ? 'A' : s >= 60 ? 'B' : s >= 50 ? 'C' : s >= 45 ? 'D' : 'F');

module.exports = {
  ApiError, DEPTS, LEVELS, SEMS, VAULT_CATS, IDLE_MS, CONTENT_TYPES, DAYS_ALL, DAYS_TT, ROLES, cmd, getDoc, setDoc, mutate, rateLimit,
  hashPassword, verifyPassword, sha256, safeEq, crypto, setSessionCookie, clearSessionCookie, currentUser,
  cleanEmail, text, password, oneOf, uid, gradeFor, sleep,
};
