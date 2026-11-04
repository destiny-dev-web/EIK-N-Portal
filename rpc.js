const L = require('./_lib');
const { ApiError, getDoc, mutate, cmd, text, oneOf, uid } = L;

const L_STUDENT = 'student';
const ip = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

async function auth(ctx, roles) {
  const r = await L.currentUser(ctx.req, ctx.portal);
  if (r.disabled) throw new ApiError(403, 'Your access has been disabled. See the desk officer.');
  if (!r.user) throw new ApiError(401, 'Please log in.');
  if (roles && !roles.includes(r.user.role)) throw new ApiError(403, 'You do not have access to that.');
  return r.user;
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, level: u.level || null,
    regNo: u.regNo || null, dob: u.dob || null, state: u.state || null, country: u.country || null,
    phone: u.phone || null, emailVerified: !!u.emailVerified, reminders: u.reminders || [],
  };
}
function genReg(users) {
  const used = new Set(users.map((u) => u.regNo));
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let r;
  do {
    let d = '';
    for (let i = 0; i < 9; i++) d += L.crypto.randomInt(0, 10);
    r = 'CRE/' + d + A[L.crypto.randomInt(0, 26)] + A[L.crypto.randomInt(0, 26)];
  } while (used.has(r));
  return r;
}
const eligible = (user, c) => user.role === 'desk_officer' || !c.lecturerId || c.lecturerId === user.id;

/* ---------------- state: what this person is allowed to see ---------------- */
async function state(ctx) {
  const r = await L.currentUser(ctx.req, ctx.portal);
  const [dir, acad, comm, vault, supp, keysDoc] = await Promise.all(['directory', 'academics', 'community', 'vault', 'support', 'keys'].map(getDoc));
  const out = {
    me: null, disabled: !!r.disabled,
    directory: { users: [], courses: dir.courses },
    academics: { registrations: {}, results: [], timetables: [] },
    community: comm, vault, support: { issues: [] }, keys: { keys: [] },
    stats: { firstSetup: !dir.users.some((u) => u.role === 'desk_officer') },
  };
  const u = r.user;
  if (!u) return out;
  const me = publicUser(u);
  me.photo = (await cmd(['GET', 'eikon:photo:' + u.id])) || null;
  out.me = me; out.directory.users = [me];
  if (u.role === L_STUDENT) {
    out.academics.registrations[u.id] = acad.registrations[u.id] || [];
    out.academics.results = acad.results.filter((x) => x.studentId === u.id);
    out.academics.timetables = acad.timetables.filter((t) => t.department === u.department && t.level === u.level && Array.isArray(t.entries));
    out.support.issues = supp.issues.filter((i) => i.studentId === u.id);
  } else {
    out.stats.students = dir.users.filter((x) => x.role === L_STUDENT).length;
    out.stats.results = acad.results.length;
    if (u.role === 'hod') out.academics.timetables = acad.timetables.filter((t) => t.department === u.department && Array.isArray(t.entries));
    if (u.role === 'desk_officer') {
      out.support.issues = supp.issues;
      out.keys.keys = keysDoc.keys.map((k) => ({ ...k, holder: k.usedBy ? ((dir.users.find((x) => x.id === k.usedBy) || {}).name || 'Unknown') : null }));
    }
  }
  return out;
}

/* ---------------- accounts ---------------- */
const A = {
  state,

  async register(ctx) {
    if (ctx.portal !== 'student') throw new ApiError(400, 'Students register on the student site.');
    await L.rateLimit('reg:' + ip(ctx.req), 20, 3600);
    const b = ctx.body;
    const name = text(b.name, 'Name', 2, 80), email = L.cleanEmail(b.email), pw = L.password(b.password);
    const department = oneOf(b.department, L.DEPTS, 'department'), level = oneOf(b.level, L.LEVELS, 'level');
    const user = await mutate(['directory'], ({ directory: d }) => {
      if (d.users.some((u) => (u.email || '').toLowerCase() === email)) throw new ApiError(409, 'An account with that email already exists. Log in instead.');
      const u = { id: uid(), name, email, role: 'student', department, level, regNo: genReg(d.users), pwHash: L.hashPassword(pw), emailVerified: false, createdAt: Date.now(), reminders: [] };
      d.users.push(u);
      return u;
    });
    L.setSessionCookie(ctx.res, 'student', user.id);
    return { name: user.name, regNo: user.regNo };
  },

  async login(ctx) {
    if (ctx.portal !== 'student') throw new ApiError(400, 'Use the staff login.');
    const id = String(ctx.body.id || '').trim().toLowerCase();
    await L.rateLimit('login:' + id, 10, 900); await L.rateLimit('loginip:' + ip(ctx.req), 60, 900);
    const dir = await getDoc('directory');
    const u = dir.users.find((x) => x.role === L_STUDENT && ((x.email || '').toLowerCase() === id || (x.regNo || '').toLowerCase() === id));
    if (!u || !L.verifyPassword(ctx.body.password, u.pwHash)) throw new ApiError(401, 'Incorrect email, registration number or password.');
    L.setSessionCookie(ctx.res, 'student', u.id);
    return { name: u.name };
  },

  async staffRegister(ctx) {
    if (ctx.portal !== 'staff') throw new ApiError(400, 'Staff register on the staff site.');
    await L.rateLimit('sreg:' + ip(ctx.req), 10, 3600);
    const b = ctx.body;
    const name = text(b.name, 'Name', 2, 80), email = L.cleanEmail(b.email), pw = L.password(b.password);
    const code = String(b.key || '').trim().toUpperCase();
    const user = await mutate(['directory', 'keys'], ({ directory: d, keys }) => {
      if (d.users.some((u) => (u.email || '').toLowerCase() === email)) throw new ApiError(409, 'An account with that email already exists. Log in instead.');
      const first = !d.users.some((u) => u.role === 'desk_officer');
      let role, department, key = null;
      if (first) {
        const setup = process.env.SETUP_CODE;
        if (!setup) throw new ApiError(500, 'First-time setup is off. Set SETUP_CODE in your Vercel settings.');
        if (!L.safeEq(String(b.key || '').trim(), setup)) throw new ApiError(403, 'Incorrect setup code.');
        role = 'desk_officer'; department = 'Administration';
      } else {
        key = keys.keys.find((k) => k.code === code);
        if (!key || key.status !== 'active' || key.usedBy) throw new ApiError(403, 'That access key is not valid. Ask the desk officer for a new one.');
        role = key.role; department = key.department;
      }
      const u = { id: uid(), name, email, role, department, level: null, pwHash: L.hashPassword(pw), keyId: key ? key.id : null, createdAt: Date.now() };
      d.users.push(u);
      if (key) key.usedBy = u.id;
      return u;
    });
    L.setSessionCookie(ctx.res, 'staff', user.id);
    return { name: user.name, role: user.role };
  },

  async staffLogin(ctx) {
    if (ctx.portal !== 'staff') throw new ApiError(400, 'Students log in on the student site.');
    const email = String(ctx.body.email || '').trim().toLowerCase();
    await L.rateLimit('slogin:' + email, 10, 900); await L.rateLimit('sloginip:' + ip(ctx.req), 60, 900);
    const [dir, keys] = await Promise.all([getDoc('directory'), getDoc('keys')]);
    const u = dir.users.find((x) => x.role !== L_STUDENT && (x.email || '').toLowerCase() === email);
    if (!u || !L.verifyPassword(ctx.body.password, u.pwHash)) throw new ApiError(401, 'Incorrect email or password.');
    if (u.keyId) {
      const k = keys.keys.find((x) => x.id === u.keyId);
      if (!k || k.status !== 'active') throw new ApiError(403, 'Your access has been disabled. See the desk officer.');
      if (String(ctx.body.key || '').trim().toUpperCase() !== k.code) throw new ApiError(401, 'Incorrect access key.');
    } else if (u.role !== 'desk_officer') {
      throw new ApiError(403, 'Your account has no access key. See the desk officer.');
    }
    L.setSessionCookie(ctx.res, 'staff', u.id);
    return { name: u.name };
  },

  async logout(ctx) { L.clearSessionCookie(ctx.res, ctx.portal); return { ok: true }; },

  async subscribe(ctx) {
    await L.rateLimit('news:' + ip(ctx.req), 10, 3600);
    const email = L.cleanEmail(ctx.body.email);
    await mutate(['newsletter'], ({ newsletter: n }) => {
      if (n.emails.some((x) => x.email === email)) throw new ApiError(409, 'That email is already subscribed.');
      n.emails.push({ email, ts: Date.now() });
    });
    return { ok: true };
  },

  async forgot(ctx) {
    const e = L.cleanEmail(ctx.body.email);
    await L.rateLimit('forgotip:' + ip(ctx.req), 20, 3600);
    if (await cmd(['GET', 'eikon:resetlock:' + e])) throw new ApiError(429, 'A code was just requested. Wait a minute and try again.');
    await cmd(['SET', 'eikon:resetlock:' + e, '1', 'EX', '60']);
    const dir = await getDoc('directory');
    const user = dir.users.find((u) => (u.email || '').toLowerCase() === e && ((ctx.portal === 'staff') === (u.role !== L_STUDENT)));
    if (user) {
      const code = String(L.crypto.randomInt(0, 1000000)).padStart(6, '0');
      await cmd(['SET', 'eikon:reset:' + e, JSON.stringify({ h: L.sha256(code + ':' + e + ':' + process.env.SESSION_SECRET), tries: 0 }), 'EX', '600']);
      await sendMail(e, user.name, code);
    }
    return { ok: true }; // same answer whether or not the account exists
  },

  async reset(ctx) {
    const e = L.cleanEmail(ctx.body.email), code = String(ctx.body.code || ''), pw = L.password(ctx.body.password);
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'Enter the 6-digit code from your email.');
    const raw = await cmd(['GET', 'eikon:reset:' + e]);
    if (!raw) throw new ApiError(400, 'That code has expired or was never requested. Ask for a new one.');
    const rec = JSON.parse(raw);
    if (rec.tries >= 5) { await cmd(['DEL', 'eikon:reset:' + e]); throw new ApiError(429, 'Too many wrong attempts. Ask for a new code.'); }
    if (!L.safeEq(L.sha256(code + ':' + e + ':' + process.env.SESSION_SECRET), rec.h)) {
      rec.tries += 1;
      await cmd(['SET', 'eikon:reset:' + e, JSON.stringify(rec), 'KEEPTTL']);
      throw new ApiError(400, 'That code is not correct.');
    }
    await mutate(['directory'], ({ directory: d }) => {
      const u = d.users.find((x) => (x.email || '').toLowerCase() === e && ((ctx.portal === 'staff') === (x.role !== L_STUDENT)));
      if (!u) throw new ApiError(400, 'Account not found.');
      u.pwHash = L.hashPassword(pw);
      u.validAfter = Date.now(); // signs out every older session
    });
    await cmd(['DEL', 'eikon:reset:' + e]);
    return { ok: true };
  },

  /* ---------------- students ---------------- */
  async updateProfile(ctx) {
    const me = await auth(ctx, [L_STUDENT]);
    const b = ctx.body;
    const dob = String(b.dob || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(new Date(dob)) || new Date(dob) > new Date() || new Date(dob).getFullYear() < 1920) throw new ApiError(400, 'Enter a valid date of birth.');
    const state = text(b.state, 'State of origin', 2, 60), country = text(b.country, 'Country', 2, 60);
    const phone = String(b.phone || '').trim();
    if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new ApiError(400, 'Enter a valid phone number, digits only (you can start with +).');
    if (b.photo) {
      if (typeof b.photo !== 'string' || !b.photo.startsWith('data:image/jpeg;base64,') || b.photo.length > 150000) throw new ApiError(400, 'That picture is not valid or is too large.');
      await cmd(['SET', 'eikon:photo:' + me.id, b.photo]);
    }
    await mutate(['directory'], ({ directory: d }) => {
      const u = d.users.find((x) => x.id === me.id);
      Object.assign(u, { dob, state, country, phone });
    });
    return { ok: true };
  },

  async registerCourse(ctx) {
    const me = await auth(ctx, [L_STUDENT]);
    const code = String(ctx.body.code || '');
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      if (!d.courses.some((c) => c.code === code)) throw new ApiError(404, 'That course does not exist.');
      const list = a.registrations[me.id] || (a.registrations[me.id] = []);
      if (!list.includes(code)) list.push(code);
    });
    return { ok: true };
  },

  async setReminders(ctx) {
    const me = await auth(ctx, [L_STUDENT]);
    const list = ctx.body.reminders;
    if (!Array.isArray(list) || list.length > 40) throw new ApiError(400, 'Too many reminders.');
    const clean = list.map((r) => ({
      id: String(r.id || uid()).slice(0, 20),
      code: text(r.code, 'Course code', 2, 20).toUpperCase(),
      day: oneOf(r.day, L.DAYS_ALL, 'day'),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : (() => { throw new ApiError(400, 'Enter a valid time.'); })(),
      venue: String(r.venue || '').trim().slice(0, 60),
    }));
    await mutate(['directory'], ({ directory: d }) => { d.users.find((x) => x.id === me.id).reminders = clean; });
    return { ok: true };
  },

  async raiseIssue(ctx) {
    const me = await auth(ctx, [L_STUDENT]);
    const subject = text(ctx.body.subject, 'Subject', 3, 120), message = text(ctx.body.message, 'Message', 5, 1500);
    await mutate(['support'], ({ support: s }) => {
      s.issues.push({ id: uid(), studentId: me.id, studentName: me.name, subject, message, status: 'open', reply: null, ts: Date.now() });
    });
    return { ok: true };
  },

  /* ---------------- everyone logged in ---------------- */
  async post(ctx) {
    const me = await auth(ctx);
    const type = oneOf(ctx.body.type, ['work', 'collab', 'opportunity'], 'post type');
    const title = text(ctx.body.title, 'Title', 3, 120), body = text(ctx.body.body, 'Details', 3, 2000);
    await mutate(['community'], ({ community: c }) => {
      c.posts.push({ id: uid(), authorId: me.id, authorName: me.name, type, title, body, ts: Date.now() });
      if (c.posts.length > 500) c.posts = c.posts.slice(-500);
    });
    return { ok: true };
  },

  /* ---------------- desk officer ---------------- */
  async addCourse(ctx) {
    await auth(ctx, ['desk_officer']);
    const b = ctx.body;
    const code = text(b.code, 'Course code', 3, 12).toUpperCase();
    if (!/^[A-Z0-9 ]+$/.test(code)) throw new ApiError(400, 'Course code can only use letters, numbers and spaces.');
    const title = text(b.title, 'Course title', 3, 120);
    const dept = oneOf(b.dept, L.DEPTS, 'department'), level = oneOf(b.level, L.LEVELS, 'level'), semester = oneOf(b.semester, L.SEMS, 'semester');
    await mutate(['directory'], ({ directory: d }) => {
      if (d.courses.some((c) => c.code === code)) throw new ApiError(409, 'A course with that code already exists.');
      d.courses.push({ code, title, dept, level, semester, lecturerId: null });
    });
    return { code };
  },

  async replyIssue(ctx) {
    await auth(ctx, ['desk_officer']);
    const reply = text(ctx.body.reply, 'Reply', 2, 1500);
    await mutate(['support'], ({ support: s }) => {
      const i = s.issues.find((x) => x.id === ctx.body.id);
      if (!i) throw new ApiError(404, 'Issue not found.');
      i.reply = reply; i.status = 'resolved';
    });
    return { ok: true };
  },

  async genKey(ctx) {
    await auth(ctx, ['desk_officer']);
    const role = oneOf(ctx.body.role, L.ROLES, 'role');
    const department = role === 'desk_officer' ? 'Administration' : oneOf(ctx.body.department, L.DEPTS, 'department');
    const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return mutate(['keys'], ({ keys }) => {
      const used = new Set(keys.keys.map((k) => k.code));
      let code;
      do { code = 'EK-'; for (let i = 0; i < 8; i++) code += AL[L.crypto.randomInt(0, AL.length)]; } while (used.has(code));
      keys.keys.push({ id: uid(), code, role, department, status: 'active', usedBy: null, createdAt: Date.now() });
      return { code };
    });
  },

  async toggleKey(ctx) {
    await auth(ctx, ['desk_officer']);
    return mutate(['keys'], ({ keys }) => {
      const k = keys.keys.find((x) => x.id === ctx.body.id);
      if (!k) throw new ApiError(404, 'Key not found.');
      k.status = k.status === 'active' ? 'disabled' : 'active';
      return { status: k.status };
    });
  },

  /* ---------------- results (lecturer, desk officer) ---------------- */
  async searchStudents(ctx) {
    await auth(ctx, ['lecturer', 'desk_officer']);
    const q = String(ctx.body.q || '').trim().toUpperCase();
    if (!/^\d{2}[A-Z]{2}$/.test(q)) throw new ApiError(400, 'Enter the last two digits and the two letters, for example 89AB.');
    const dir = await getDoc('directory');
    const matches = dir.users.filter((u) => u.role === L_STUDENT && (u.regNo || '').toUpperCase().endsWith(q)).slice(0, 20).map((u) => ({ id: u.id, regNo: u.regNo }));
    return { matches };
  },

  async getStudent(ctx) {
    const me = await auth(ctx, ['lecturer', 'desk_officer']);
    const [dir, acad] = await Promise.all([getDoc('directory'), getDoc('academics')]);
    const s = dir.users.find((u) => u.id === ctx.body.id && u.role === L_STUDENT);
    if (!s) throw new ApiError(404, 'Student not found.');
    const courses = (acad.registrations[s.id] || []).map((code) => dir.courses.find((c) => c.code === code)).filter(Boolean).filter((c) => eligible(me, c));
    const codes = new Set(courses.map((c) => c.code));
    return {
      student: { id: s.id, name: s.name, regNo: s.regNo, department: s.department, level: s.level },
      courses, results: acad.results.filter((r) => r.studentId === s.id && codes.has(r.courseId)),
    };
  },

  async publishResult(ctx) {
    const me = await auth(ctx, ['lecturer', 'desk_officer']);
    const b = ctx.body;
    const score = Number(b.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new ApiError(400, 'Score must be between 0 and 100.');
    const semester = oneOf(String(b.semester), L.SEMS, 'semester');
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      const s = d.users.find((u) => u.id === b.studentId && u.role === L_STUDENT);
      const c = d.courses.find((x) => x.code === b.course);
      if (!s || !c) throw new ApiError(404, 'Student or course not found.');
      if (!(a.registrations[s.id] || []).includes(c.code)) throw new ApiError(400, 'That student is not registered for this course.');
      if (!eligible(me, c)) throw new ApiError(403, 'This course belongs to another lecturer.');
      const rec = { id: uid(), studentId: s.id, courseId: c.code, score: Math.round(score * 10) / 10, grade: L.gradeFor(score), semester };
      const i = a.results.findIndex((r) => r.studentId === s.id && r.courseId === c.code);
      if (i > -1) a.results[i] = rec; else a.results.push(rec);
      if (me.role === 'lecturer' && !c.lecturerId) c.lecturerId = me.id;
    });
    return { ok: true };
  },

  /* ---------------- timetable (HOD, own department only) ---------------- */
  async ttAdd(ctx) {
    const me = await auth(ctx, ['hod']);
    const b = ctx.body;
    const level = oneOf(b.level, L.LEVELS, 'level'), sem = oneOf(b.sem, L.SEMS, 'semester'), day = oneOf(b.day, L.DAYS_TT, 'day');
    const start = Number(b.start), end = Number(b.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 9 || end > 18 || end <= start) throw new ApiError(400, 'Choose a start and end time between 9 AM and 6 PM, with the end after the start.');
    const venue = String(b.venue || '').trim().slice(0, 60);
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      const c = d.courses.find((x) => x.code === b.course && x.dept === me.department);
      if (!c) throw new ApiError(400, 'Choose a course from your department.');
      let tt = a.timetables.find((t) => t.department === me.department && t.level === level && t.semester === sem && Array.isArray(t.entries));
      if (!tt) { tt = { id: uid(), department: me.department, level, semester: sem, entries: [], ts: Date.now(), uploadedBy: me.name }; a.timetables.push(tt); }
      if (tt.entries.some((x) => x.day === day && x.start < end && start < x.end)) throw new ApiError(409, `That time overlaps another class on ${day}.`);
      tt.entries.push({ id: uid(), day, course: c.code, start, end, venue });
      tt.ts = Date.now();
    });
    return { ok: true };
  },

  async ttRemove(ctx) {
    const me = await auth(ctx, ['hod']);
    const level = oneOf(ctx.body.level, L.LEVELS, 'level'), sem = oneOf(ctx.body.sem, L.SEMS, 'semester');
    await mutate(['academics'], ({ academics: a }) => {
      const tt = a.timetables.find((t) => t.department === me.department && t.level === level && t.semester === sem && Array.isArray(t.entries));
      if (!tt) throw new ApiError(404, 'Timetable not found.');
      tt.entries = tt.entries.filter((x) => x.id !== ctx.body.id); tt.ts = Date.now();
    });
    return { ok: true };
  },
};

async function sendMail(to, name, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Eikon Academy <onboarding@resend.dev>', to: [to],
      subject: 'Your Eikon Academy password reset code',
      text: `Hello ${name || ''},\n\nYour password reset code is ${code}. It expires in 10 minutes.\n\nIf you did not ask for this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e4e4ec;border-radius:12px;overflow:hidden"><div style="background:#1F2260;color:#fff;padding:18px 24px;font-size:18px;letter-spacing:2px;font-weight:bold">EIKON<span style="color:#E08A2E">.</span></div><div style="padding:24px;color:#232336"><p>Hello ${esc(name)},</p><p>Your password reset code is:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#1F2260;margin:16px 0">${code}</p><p style="color:#6B6B7B;font-size:13px">It expires in 10 minutes. If you did not ask for this, ignore this email.</p></div></div>`,
    }),
  });
  if (!r.ok) throw new Error('Mail provider error ' + r.status + ' ' + (await r.text()));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed.');
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new ApiError(415, 'Unsupported request.');
    const portal = req.headers['x-portal'];
    if (portal !== 'student' && portal !== 'staff') throw new ApiError(400, 'Unknown portal.');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fn = Object.prototype.hasOwnProperty.call(A, body.action) ? A[body.action] : null;
    if (!fn) throw new ApiError(404, 'Unknown action.');
    const out = await fn({ req, res, portal, body });
    res.status(200).json(out || { ok: true });
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
