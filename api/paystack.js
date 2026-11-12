const L = require('./_lib');
const P = require('./_pay');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === 'string') return resolve(req.body);
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method not allowed'); }
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) { res.statusCode = 500; return res.end('Not configured'); }
    const raw = await readRaw(req);
    const sig = String(req.headers['x-paystack-signature'] || '');
    const good = L.crypto.createHmac('sha512', key).update(raw).digest('hex');
    if (sig.length !== good.length || !L.crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) { res.statusCode = 401; return res.end('Bad signature'); }
    const evt = JSON.parse(raw);
    if (evt.event === 'charge.success' && evt.data && evt.data.reference) {
      try { await P.confirm(evt.data.reference, null); } catch (e) { console.error('webhook confirm', e.message); }
    }
    res.statusCode = 200; res.end('ok');
  } catch (e) {
    console.error(e); res.statusCode = 500; res.end('error');
  }
};
module.exports.config = { api: { bodyParser: false } };
