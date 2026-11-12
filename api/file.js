const L = require('./_lib');

// Sends an uploaded vault file to a logged-in student or staff member.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
    let r = await L.currentUser(req, 'student');
    if (!r.user) r = await L.currentUser(req, 'staff');
    if (!r.user) { res.statusCode = 401; return res.end('Please log in first.'); }
    if (r.user.role === 'student' && !(await require('./_pay').isUnlocked(r.user.id))) { res.statusCode = 403; return res.end('The vault is locked. Pay the resource fee to unlock it.'); }
    const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
    const vault = await L.getDoc('vault');
    const item = vault.resources.find((x) => x.id === id && x.kind === 'file');
    const raw = item && (await L.cmd(['GET', 'eikon:file:' + id]));
    if (!raw) { res.statusCode = 404; return res.end('File not found.'); }
    const f = JSON.parse(raw);
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    res.setHeader('Content-Type', L.CONTENT_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${f.name.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = 200;
    res.end(Buffer.from(f.data, 'base64'));
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end('Server error.');
  }
};
