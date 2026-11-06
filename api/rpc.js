const L = require('./_lib');
const { ApiError, getDoc, mutate, cmd, text, oneOf, uid } = L;

const STUDENT = 'student';
const READERS = ['desk_officer', 'director'];            // may look at student records
const GRADERS = ['lecturer', 'desk_officer', 'director']; // may enter results
const ip = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const SEX = ['Male', 'Female'];

async function auth(ctx, roles) {
  const r = await L.currentUser(ctx.req, ctx.portal);
  if (r.idle) { L.clearSessionCookie(ctx.res, ctx.portal); throw new ApiError(401, 'You were logged out after 10 minutes away. Please log in again.'); }
  if (r.disabled) throw new ApiError(403, 'Your access has been disabled. See the academy coordinator.');
  if (!r.user) throw new ApiError(401, 'Please log in.');
  if (roles && !roles.includes(r.user.role)) throw new ApiError(403, 'You do not have access to that.');
  L.setSessionCookie(ctx.res, ctx.portal, r.user.id, r.session.i); // keeps the 10-minute idle clock moving
  return r.user;
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, level: u.level || null,
    regNo: u.regNo || null, dob: u.dob || null, sex: u.sex || null, nationality: u.nationality || null,
    state: u.state || null, country: u.country || null, phone: u.phone || null,
    emailVerified: !!u.emailVerified, mustChange: !!u.mustChange, reminders: u.reminders || [],
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
function tempPassword() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += A[L.crypto.randomInt(0, A.length)];
  return p;
}
const canTeach = (user, c) => user.role === 'desk_officer' || user.role === 'director' || !c.lecturerId || c.lecturerId === user.id;
function currentSession() { const y = new Date().getFullYear(); return `${y}/${y + 1}`; }
function checkSession(v) {
  const m = /^(\d{4})\/(\d{4})$/.exec(String(v || ''));
  if (!m || Number(m[2]) !== Number(m[1]) + 1 || Number(m[1]) < 2000 || Number(m[1]) > 2100) throw new ApiError(400, 'Choose a valid session, for example 2025/2026.');
  return v;
}
function ageOf(dob) {
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
function studentFields(b, isEdit) {
  const dob = String(b.dob || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(new Date(dob)) || new Date(dob) > new Date() || ageOf(dob) < 5 || ageOf(dob) > 90) throw new ApiError(400, 'Enter a valid date of birth.');
  const phone = String(b.phone || '').trim();
  if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new ApiError(400, 'Enter a valid phone number, digits only (you can start with +).');
  return {
    name: text(b.name, 'Name', 2, 80), email: L.cleanEmail(b.email), department: oneOf(b.department, L.DEPTS, 'department'),
    level: oneOf(b.level, L.LEVELS, 'level'), dob, sex: oneOf(b.sex, SEX, 'sex'),
    nationality: text(b.nationality, 'Nationality', 2, 60), state: text(b.state, 'State of origin', 2, 60), phone,
  };
}

/* ---------- one-time clean-up of test data from earlier versions ---------- */
async function migrate() {
  if (await cmd(['GET', 'eikon:migrated:v3'])) return;
  const DEPT = { 'Film & Video': 'Video Editing', Design: 'Graphic Design' };
  const LEVEL = { 100: 'Beginner', 200: 'Intermediate', 300: 'Advanced', 400: 'Professional' };
  const SEEDED = ['PHT201', 'PHT305', 'FLM210', 'DES150', 'BUS220'];
  await mutate(['directory', 'academics', 'vault', 'community', 'keys'], ({ directory: d, academics: a, vault: v, community: c, keys: k }) => {
    const fix = (o) => { if (DEPT[o.department]) o.department = DEPT[o.department]; if (DEPT[o.dept]) o.dept = DEPT[o.dept]; if (LEVEL[o.level]) o.level = LEVEL[o.level]; };
    d.users.forEach((u) => { fix(u); if (u.role === 'student' && !u.sex) u.sex = null; });
    const used = new Set(); Object.values(a.registrations).forEach((l) => l.forEach((x) => used.add(x))); a.results.forEach((r) => used.add(r.courseId));
    d.courses = d.courses.filter((x) => !(SEEDED.includes(x.code) && !x.lecturerId && !used.has(x.code)));
    d.courses.forEach(fix);
    a.timetables.forEach(fix);
    const lvl = {}; d.users.forEach((u) => { lvl[u.id] = u.level; });
    a.results.forEach((r) => { if (!r.session) r.session = currentSession(); if (!r.level) r.level = lvl[r.studentId] || 'Beginner'; });
    k.keys.forEach(fix);
    v.resources = v.resources.filter((x) => !(/^r\d+$/.test(x.id) && !x.kind));
    c.posts = c.posts.filter((x) => x.id !== 'seed1');
  });
  await cmd(['SET', 'eikon:migrated:v3', '1']);
}

/* ---------------- state: what this person is allowed to see ---------------- */
async function state(ctx) {
  await migrate();
  const r = await L.currentUser(ctx.req, ctx.portal);
  if (r.idle) L.clearSessionCookie(ctx.res, ctx.portal);
  const [dir, acad, comm, vault, supp, keysDoc] = await Promise.all(['directory', 'academics', 'community', 'vault', 'support', 'keys'].map(getDoc));
  const out = {
    me: null, disabled: !!r.disabled, idle: !!r.idle,
    directory: { users: [], courses: dir.courses },
    academics: { registrations: {}, results: [], timetables: [] },
    community: comm, vault: { resources: vault.resources.map((x) => ({ ...x })) }, support: { issues: [] }, keys: { keys: [] },
    stats: { firstSetup: !dir.users.some((u) => u.role === 'desk_officer') },
  };
  const u = r.user;
  if (!u) return out;
  L.setSessionCookie(ctx.res, ctx.portal, u.id, r.session.i);
  const me = publicUser(u);
  me.photo = (await cmd(['GET', 'eikon:photo:' + u.id])) || null;
  out.me = me; out.directory.users = [me];
  if (u.role === STUDENT) {
    out.academics.registrations[u.id] = acad.registrations[u.id] || [];
    out.academics.results = acad.results.filter((x) => x.studentId === u.id);
    out.academics.timetables = acad.timetables.filter((t) => t.department === u.department && t.level === u.level && Array.isArray(t.entries));
    out.support.issues = supp.issues.filter((i) => i.studentId === u.id);
  } else {
    out.stats.students = dir.users.filter((x) => x.role === STUDENT).length;
    out.stats.staff = dir.users.filter((x) => x.role !== STUDENT).length;
    out.stats.results = acad.results.length;
    if (u.role === 'hod') out.academics.timetables = acad.timetables.filter((t) => t.department === u.department && Array.isArray(t.entries));
    if (u.role === 'director') out.academics.timetables = acad.timetables.filter((t) => Array.isArray(t.entries));
    if (u.role === 'desk_officer') {
      out.support.issues = supp.issues;
      out.keys.keys = keysDoc.keys.map((k) => ({ ...k, holder: k.usedBy ? ((dir.users.find((x) => x.id === k.usedBy) || {}).name || 'Unknown') : null }));
    }
  }
  return out;
}

const A = {
  state,

  /* ---------------- sign in / out ---------------- */
  async login(ctx) {
    if (ctx.portal !== 'student') throw new ApiError(400, 'Use the staff login.');
    const id = String(ctx.body.id || '').trim().toLowerCase();
    await L.rateLimit('login:' + id, 10, 900); await L.rateLimit('loginip:' + ip(ctx.req), 60, 900);
    const dir = await getDoc('directory');
    const u = dir.users.find((x) => x.role === STUDENT && ((x.email || '').toLowerCase() === id || (x.regNo || '').toLowerCase() === id));
    if (!u || !L.verifyPassword(ctx.body.password, u.pwHash)) throw new ApiError(401, 'Incorrect email, registration number or password.');
    L.setSessionCookie(ctx.res, 'student', u.id);
    return { name: u.name, mustChange: !!u.mustChange };
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
        if (!key || key.status !== 'active' || key.usedBy) throw new ApiError(403, 'That access key is not valid. Ask the academy coordinator for a new one.');
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
    const u = dir.users.find((x) => x.role !== STUDENT && (x.email || '').toLowerCase() === email);
    if (!u || !L.verifyPassword(ctx.body.password, u.pwHash)) throw new ApiError(401, 'Incorrect email or password.');
    if (u.keyId) {
      const k = keys.keys.find((x) => x.id === u.keyId);
      if (!k || k.status !== 'active') throw new ApiError(403, 'Your access has been disabled. See the academy coordinator.');
      if (String(ctx.body.key || '').trim().toUpperCase() !== k.code) throw new ApiError(401, 'Incorrect access key.');
    } else if (u.role !== 'desk_officer') {
      throw new ApiError(403, 'Your account has no access key. See the academy coordinator.');
    }
    L.setSessionCookie(ctx.res, 'staff', u.id);
    return { name: u.name };
  },

  async logout(ctx) { L.clearSessionCookie(ctx.res, ctx.portal); return { ok: true }; },

  async changePassword(ctx) {
    const me = await auth(ctx);
    const pw = L.password(ctx.body.password);
    await L.rateLimit('chpw:' + me.id, 10, 900);
    await mutate(['directory'], ({ directory: d }) => {
      const u = d.users.find((x) => x.id === me.id);
      if (!L.verifyPassword(ctx.body.current, u.pwHash)) throw new ApiError(401, 'Your current password is not correct.');
      u.pwHash = L.hashPassword(pw); u.mustChange = false; u.validAfter = Date.now() - 1;
    });
    L.setSessionCookie(ctx.res, ctx.portal, me.id);
    return { ok: true };
  },

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
    const user = dir.users.find((u) => (u.email || '').toLowerCase() === e && ((ctx.portal === 'staff') === (u.role !== STUDENT)));
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
      const u = d.users.find((x) => (x.email || '').toLowerCase() === e && ((ctx.portal === 'staff') === (x.role !== STUDENT)));
      if (!u) throw new ApiError(400, 'Account not found.');
      u.pwHash = L.hashPassword(pw); u.mustChange = false;
      u.validAfter = Date.now(); // signs out every older session
    });
    await cmd(['DEL', 'eikon:reset:' + e]);
    return { ok: true };
  },

  /* ---------------- students (their own account) ---------------- */
  async updateProfile(ctx) {
    const me = await auth(ctx, [STUDENT]);
    const b = ctx.body;
    const phone = String(b.phone || '').trim();
    if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new ApiError(400, 'Enter a valid phone number, digits only (you can start with +).');
    if (b.photo) {
      if (typeof b.photo !== 'string' || !b.photo.startsWith('data:image/jpeg;base64,') || b.photo.length > 150000) throw new ApiError(400, 'That picture is not valid or is too large.');
      await cmd(['SET', 'eikon:photo:' + me.id, b.photo]);
    }
    await mutate(['directory'], ({ directory: d }) => { d.users.find((x) => x.id === me.id).phone = phone; });
    return { ok: true };
  },

  async registerCourse(ctx) {
    const me = await auth(ctx, [STUDENT]);
    const code = String(ctx.body.code || '');
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      if (!d.courses.some((c) => c.code === code)) throw new ApiError(404, 'That course does not exist.');
      const list = a.registrations[me.id] || (a.registrations[me.id] = []);
      if (!list.includes(code)) list.push(code);
    });
    return { ok: true };
  },

  async dropCourse(ctx) {
    const me = await auth(ctx, [STUDENT]);
    const code = String(ctx.body.code || '');
    await mutate(['academics'], ({ academics: a }) => {
      if (a.results.some((r) => r.studentId === me.id && r.courseId === code)) throw new ApiError(400, 'A result is already published for this course, so it cannot be dropped.');
      a.registrations[me.id] = (a.registrations[me.id] || []).filter((c) => c !== code);
    });
    return { ok: true };
  },

  async setReminders(ctx) {
    const me = await auth(ctx, [STUDENT]);
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
    const me = await auth(ctx, [STUDENT]);
    const subject = text(ctx.body.subject, 'Subject', 3, 120), message = text(ctx.body.message, 'Message', 5, 1500);
    await mutate(['support'], ({ support: s }) => {
      s.issues.push({ id: uid(), studentId: me.id, studentName: me.name, subject, message, status: 'open', reply: null, ts: Date.now() });
    });
    return { ok: true };
  },

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

  /* ---------------- academy coordinator: students ---------------- */
  async genRegNo(ctx) {
    await auth(ctx, ['desk_officer']);
    const dir = await getDoc('directory');
    return { regNo: genReg(dir.users) };
  },

  async createStudent(ctx) {
    const me = await auth(ctx, ['desk_officer']);
    await L.rateLimit('mkstudent:' + me.id, 200, 3600);
    const f = studentFields(ctx.body);
    const regNo = String(ctx.body.regNo || '').trim().toUpperCase();
    if (!/^CRE\/\d{9}[A-Z]{2}$/.test(regNo)) throw new ApiError(400, 'Generate a registration number first.');
    const temp = tempPassword();
    const u = await mutate(['directory'], ({ directory: d }) => {
      if (d.users.some((x) => (x.email || '').toLowerCase() === f.email)) throw new ApiError(409, 'A user with that email already exists.');
      if (d.users.some((x) => x.regNo === regNo)) throw new ApiError(409, 'That registration number is already taken. Generate a new one.');
      const user = { id: uid(), role: STUDENT, ...f, regNo, pwHash: L.hashPassword(temp), mustChange: true, emailVerified: false, createdAt: Date.now(), createdBy: me.id, reminders: [] };
      d.users.push(user);
      return user;
    });
    return { id: u.id, name: u.name, regNo: u.regNo, tempPassword: temp };
  },

  async updateStudent(ctx) {
    await auth(ctx, ['desk_officer']);
    const f = studentFields(ctx.body);
    await mutate(['directory'], ({ directory: d }) => {
      const u = d.users.find((x) => x.id === ctx.body.id && x.role === STUDENT);
      if (!u) throw new ApiError(404, 'Student not found.');
      if (d.users.some((x) => x.id !== u.id && (x.email || '').toLowerCase() === f.email)) throw new ApiError(409, 'A user with that email already exists.');
      Object.assign(u, f);
    });
    return { ok: true };
  },

  async deleteStudent(ctx) {
    await auth(ctx, ['desk_officer']);
    const id = String(ctx.body.id || '');
    await mutate(['directory', 'academics', 'support'], ({ directory: d, academics: a, support: s }) => {
      const u = d.users.find((x) => x.id === id && x.role === STUDENT);
      if (!u) throw new ApiError(404, 'Student not found.');
      d.users = d.users.filter((x) => x.id !== id);
      delete a.registrations[id];
      a.results = a.results.filter((r) => r.studentId !== id);
      s.issues = s.issues.filter((i) => i.studentId !== id);
    });
    await cmd(['DEL', 'eikon:photo:' + id]);
    return { ok: true };
  },

  async studentTree(ctx) {
    await auth(ctx, READERS);
    const dir = await getDoc('directory');
    const tree = {};
    L.DEPTS.forEach((d) => { tree[d] = {}; L.LEVELS.forEach((l) => { tree[d][l] = 0; }); });
    dir.users.filter((u) => u.role === STUDENT).forEach((u) => { if (tree[u.department] && u.level in tree[u.department]) tree[u.department][u.level]++; });
    return { tree };
  },

  async listStudents(ctx) {
    await auth(ctx, READERS);
    const dir = await getDoc('directory');
    const dep = String(ctx.body.department || ''), lev = String(ctx.body.level || '');
    const students = dir.users.filter((u) => u.role === STUDENT && (!dep || u.department === dep) && (!lev || u.level === lev))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ id: u.id, name: u.name, regNo: u.regNo, sex: u.sex || '', phone: u.phone || '', email: u.email || '', department: u.department, level: u.level }));
    return { students };
  },

  async studentDatabase(ctx) { return A.listStudents(ctx); },

  async studentDetail(ctx) {
    await auth(ctx, READERS);
    const [dir, acad] = await Promise.all([getDoc('directory'), getDoc('academics')]);
    const s = dir.users.find((u) => u.id === ctx.body.id && u.role === STUDENT);
    if (!s) throw new ApiError(404, 'Student not found.');
    const courses = (acad.registrations[s.id] || []).map((code) => dir.courses.find((c) => c.code === code)).filter(Boolean);
    return { student: publicUser(s), courses, results: acad.results.filter((r) => r.studentId === s.id) };
  },

  /* ---------------- courses, issues, keys (academy coordinator) ---------------- */
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
    const department = (role === 'desk_officer' || role === 'director') ? 'Administration' : oneOf(ctx.body.department, L.DEPTS, 'department');
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

  async listStaff(ctx) {
    await auth(ctx, ['director']);
    const [dir, keys] = await Promise.all([getDoc('directory'), getDoc('keys')]);
    const staff = dir.users.filter((u) => u.role !== STUDENT).map((u) => {
      const k = u.keyId ? keys.keys.find((x) => x.id === u.keyId) : null;
      return { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, active: u.keyId ? !!(k && k.status === 'active') : true };
    }).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    return { staff };
  },

  /* ---------------- results ---------------- */
  async searchStudents(ctx) {
    await auth(ctx, GRADERS);
    const q = String(ctx.body.q || '').trim().toUpperCase();
    if (!/^\d{2}[A-Z]{2}$/.test(q)) throw new ApiError(400, 'Enter the last two digits and the two letters, for example 89AB.');
    const dir = await getDoc('directory');
    const matches = dir.users.filter((u) => u.role === STUDENT && (u.regNo || '').toUpperCase().endsWith(q)).slice(0, 20).map((u) => ({ id: u.id, regNo: u.regNo }));
    return { matches };
  },

  async getStudent(ctx) {
    const me = await auth(ctx, GRADERS);
    const [dir, acad] = await Promise.all([getDoc('directory'), getDoc('academics')]);
    const s = dir.users.find((u) => u.id === ctx.body.id && u.role === STUDENT);
    if (!s) throw new ApiError(404, 'Student not found.');
    const registered = (acad.registrations[s.id] || []).map((code) => dir.courses.find((c) => c.code === code)).filter(Boolean);
    const courses = registered.filter((c) => canTeach(me, c));
    const codes = new Set(courses.map((c) => c.code));
    const addable = dir.courses.filter((c) => !registered.some((r) => r.code === c.code) && canTeach(me, c));
    return {
      student: { id: s.id, name: s.name, regNo: s.regNo, department: s.department, level: s.level },
      courses, addable, results: acad.results.filter((r) => r.studentId === s.id && codes.has(r.courseId)),
    };
  },

  async staffAddCourse(ctx) {
    const me = await auth(ctx, GRADERS);
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      const s = d.users.find((u) => u.id === ctx.body.studentId && u.role === STUDENT);
      const c = d.courses.find((x) => x.code === ctx.body.code);
      if (!s || !c) throw new ApiError(404, 'Student or course not found.');
      if (!canTeach(me, c)) throw new ApiError(403, 'This course belongs to another lecturer.');
      const list = a.registrations[s.id] || (a.registrations[s.id] = []);
      if (!list.includes(c.code)) list.push(c.code);
    });
    return { ok: true };
  },

  async publishResult(ctx) {
    const me = await auth(ctx, GRADERS);
    const b = ctx.body;
    const score = Number(b.score);
    if (b.score === '' || b.score == null || !Number.isFinite(score) || score < 0 || score > 100) throw new ApiError(400, 'Score must be between 0 and 100.');
    const session = checkSession(b.session), level = oneOf(b.level, L.LEVELS, 'level'), semester = oneOf(String(b.semester), L.SEMS, 'semester');
    await mutate(['academics', 'directory'], ({ academics: a, directory: d }) => {
      const s = d.users.find((u) => u.id === b.studentId && u.role === STUDENT);
      const c = d.courses.find((x) => x.code === b.course);
      if (!s || !c) throw new ApiError(404, 'Student or course not found.');
      if (!(a.registrations[s.id] || []).includes(c.code)) throw new ApiError(400, 'That student is not registered for this course.');
      if (!canTeach(me, c)) throw new ApiError(403, 'This course belongs to another lecturer.');
      const rec = { id: uid(), studentId: s.id, courseId: c.code, session, level, semester, score: Math.round(score * 10) / 10, grade: L.gradeFor(score) };
      const i = a.results.findIndex((r) => r.studentId === s.id && r.courseId === c.code && r.session === session && r.level === level && r.semester === semester);
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

  /* ---------------- resource vault ---------------- */
  async addResource(ctx) {
    const me = await auth(ctx, ['lecturer']);
    const b = ctx.body;
    const category = oneOf(b.category, L.VAULT_CATS, 'category');
    const title = text(b.title, 'Title', 3, 120), description = String(b.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const id = uid() + uid();
    const item = { id, category, title, description, by: me.id, byName: me.name, ts: Date.now() };
    let fileRec = null;
    if (b.fileData) {
      const name = String(b.fileName || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._() -]/g, '_').slice(0, 80);
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (!L.CONTENT_TYPES[ext]) throw new ApiError(400, 'That file type is not allowed. Use PDF, images, ZIP, Office files, fonts or similar.');
      const data = String(b.fileData);
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 740000) throw new ApiError(400, 'That file is too large. Upload up to 500 KB, or share a link instead.');
      item.kind = 'file'; item.fileName = name; item.fileSize = Math.floor(data.length * 3 / 4);
      fileRec = JSON.stringify({ name, data });
    } else {
      const link = String(b.link || '').trim();
      if (!/^https?:\/\/[^\s]{4,480}$/i.test(link)) throw new ApiError(400, 'Add a file, or paste a link that starts with https://');
      item.kind = 'link'; item.link = link;
    }
    if (fileRec) await cmd(['SET', 'eikon:file:' + id, fileRec]);
    await mutate(['vault'], ({ vault: v }) => { v.resources.push(item); });
    return { id };
  },

  async deleteResource(ctx) {
    const me = await auth(ctx, ['lecturer', 'desk_officer', 'director']);
    let removed = null;
    await mutate(['vault'], ({ vault: v }) => {
      const it = v.resources.find((x) => x.id === ctx.body.id);
      if (!it) throw new ApiError(404, 'Resource not found.');
      if (me.role === 'lecturer' && it.by !== me.id) throw new ApiError(403, 'You can only remove your own uploads.');
      v.resources = v.resources.filter((x) => x.id !== it.id);
      removed = it;
    });
    if (removed && removed.kind === 'file') await cmd(['DEL', 'eikon:file:' + removed.id]);
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
