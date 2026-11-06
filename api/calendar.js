const L = require('./_lib');

const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const pad = (n) => String(n).padStart(2, '0');
const fmt12 = (t) => { const [h, m] = t.split(':').map(Number); return ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM'); };

// A calendar file the phone opens directly, with an alert 10 minutes before each class.
module.exports = async (req, res) => {
  try {
    const r = await L.currentUser(req, 'student');
    if (!r.user) { res.statusCode = 401; return res.end('Please log in first.'); }
    const only = (req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id');
    const list = (r.user.reminders || []).filter((x) => !only || x.id === only);
    if (!list.length) { res.statusCode = 404; return res.end('No class reminders yet.'); }
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eikon Academy//Class Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    list.forEach((x) => {
      const di = L.DAYS_ALL.indexOf(x.day), [h, m] = x.time.split(':').map(Number);
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + ((di - d.getUTCDay() + 7) % 7 || 7));
      const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
      const end = new Date(Date.UTC(2000, 0, 1, h, m)); end.setUTCHours(end.getUTCHours() + 1);
      lines.push('BEGIN:VEVENT', `UID:${x.id}@eikon-academy`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(x.code + ' class')}`,
        `DTSTART:${date}T${pad(h)}${pad(m)}00`, `DTEND:${date}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`, `RRULE:FREQ=WEEKLY;BYDAY=${BY[di]}`);
      if (x.venue) lines.push('LOCATION:' + esc(x.venue));
      lines.push('BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(`${x.code} holds in 10 minutes, starts by ${fmt12(x.time)}`), 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="eikon-class-reminders.ics"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = 200;
    res.end(lines.join('\r\n'));
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end('Server error.');
  }
};
