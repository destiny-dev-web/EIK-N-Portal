const L = require('./_lib');

const CATS = ['Session Fees', 'Departmental Fees', 'Resource Fees'];

// Academic sessions start in September.
function defaultSession() {
  const n = new Date(), y = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

function feeAmount(fees, session, category, department) {
  const a = (fees.amounts || {})[session];
  if (!a) return 0;
  if (category === 'Session Fees') return a.session || 0;
  if (category === 'Resource Fees') return a.resource || 0;
  return (a.dept || {})[department] || 0;
}

// A student has the vault open once the Resource Fee for the current session is paid.
function unlocked(payments, currentSession, studentId) {
  return payments.some((p) => p.studentId === studentId && p.status === 'success' && p.category === 'Resource Fees' && p.session === currentSession);
}
async function isUnlocked(studentId) {
  const [fees, pays] = await Promise.all([L.getDoc('fees'), L.getDoc('payments')]);
  return unlocked(pays.payments, fees.currentSession || defaultSession(), studentId);
}

async function paystack(path, opts) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new L.ApiError(500, 'Payments are not set up yet. Ask the academy to add the Paystack key.');
  const r = await fetch('https://api.paystack.co' + path, { ...(opts || {}), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.status) throw new L.ApiError(502, j.message || 'Paystack could not be reached. Please try again.');
  return j.data;
}

// Asks Paystack whether this payment really went through, then records it. Safe to call twice.
async function confirm(reference, studentId) {
  const data = await paystack('/transaction/verify/' + encodeURIComponent(reference));
  return L.mutate(['payments'], ({ payments: p }) => {
    const rec = p.payments.find((x) => x.reference === reference);
    if (!rec || (studentId && rec.studentId !== studentId)) throw new L.ApiError(404, 'Payment not found.');
    if (rec.status === 'success') return { status: 'success' };
    if (data.status !== 'success') return { status: data.status || 'pending' };
    if (Number(data.amount) !== rec.amount * 100 || data.currency !== 'NGN') throw new L.ApiError(400, 'The amount paid does not match this fee. Contact the academy.');
    rec.status = 'success'; rec.paidAt = Date.now(); rec.channel = data.channel || ''; rec.paystackId = String(data.id || '');
    return { status: 'success' };
  });
}

module.exports = { CATS, defaultSession, feeAmount, unlocked, isUnlocked, paystack, confirm };
