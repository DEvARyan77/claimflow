import samplePolicyText from './sample-policy.txt?raw';
import { chunkPages, extractProfileFromText, parseClauses, retrieveForPrecheck, retrieveForQuestion } from './policyBrain.js';
import { API_URL, aiOff, apiHealth, callApi, imageToBase64, wakeApi } from './aiClient.js';
import { assessFraud } from './fraudRules.js';

/** Calls an AI route, unless the visitor switched live AI off (then the caller uses RAG only). */
const callAi = (path, body, options) => (aiOff() ? Promise.resolve({ ok: false, reason: 'disabled' }) : callApi(path, body, options));

/**
 * The free demo site has no servers, so this file plays the part of all the microservices, in the browser.
 * It answers the same URLs as the API Gateway, with the same JSON shapes and the same business rules:
 *   auth-service (accounts, 4 roles) · patient-service · provider-service
 *   claims-service (ClaimRules + FraudRules, officer review) · payment-service (pays after ~4 s)
 *   notification-service (messages) · policy-assistant-service (see policyBrain.js)
 * Data is kept in this browser's localStorage, so every visitor gets their own copy.
 */

export const DEMO_KEY = 'claimflow-demo-v2';
const KEY = DEMO_KEY;
const PAYMENT_DELAY_MS = 4000;
const DEMO_PASSWORD = 'password123';

export class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const dateAgo = (days) => {
  const d = new Date(Date.now() - days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const money = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const sampleClauses = parseClauses(samplePolicyText);
const STAFF = ['OFFICER', 'ADMIN'];

const TREATMENT = { I21: 'Heart attack', J18: 'Pneumonia', S72: 'Hip / thigh fracture', K35: 'Appendicitis', A90: 'Dengue fever', H25: 'Cataract', N20: 'Kidney stone' };

function seed() {
  const patients = [
    { id: 1, name: 'Rahul Sharma', email: 'rahul@claimflow.dev', phone: '+91 98100 00001', policyNumber: 'POL1001', coverageLimit: 500000, usedAmount: 60000, policyActive: true, policyStartDate: dateAgo(730), createdAt: iso(730 * DAY) },
    { id: 2, name: 'Priya Nair', email: 'priya@claimflow.dev', phone: '+91 98100 00002', policyNumber: 'POL1002', coverageLimit: 300000, usedAmount: 0, policyActive: true, policyStartDate: dateAgo(20), createdAt: iso(20 * DAY) },
    { id: 3, name: 'Amit Verma', email: 'amit@claimflow.dev', phone: '+91 98100 00003', policyNumber: 'POL1003', coverageLimit: 200000, usedAmount: 0, policyActive: false, policyStartDate: dateAgo(365), createdAt: iso(365 * DAY) },
    { id: 4, name: 'Sunita Rao', email: 'sunita.rao@example.com', phone: '+91 98100 00004', policyNumber: 'POL1004', coverageLimit: 300000, usedAmount: 260000, policyActive: true, policyStartDate: dateAgo(400), createdAt: iso(400 * DAY) },
    { id: 5, name: 'Arjun Mehta', email: 'arjun.mehta@example.com', phone: '+91 98100 00005', policyNumber: 'POL1005', coverageLimit: 1000000, usedAmount: 49000, policyActive: true, policyStartDate: dateAgo(1000), createdAt: iso(1000 * DAY) },
  ];
  const providers = [
    { id: 1, registrationNumber: 'ROH-DL-1001', name: 'Apollo Hospital', city: 'New Delhi', specializations: ['Cardiology', 'General Medicine', 'Orthopedics'], inNetwork: true },
    { id: 2, registrationNumber: 'ROH-HR-1002', name: 'Fortis Memorial Hospital', city: 'Gurugram', specializations: ['Neurology', 'Oncology'], inNetwork: true },
    { id: 3, registrationNumber: 'ROH-DL-1003', name: 'Max Super Speciality Hospital', city: 'Saket, New Delhi', specializations: ['Cardiology', 'Gastroenterology', 'Pulmonology'], inNetwork: true },
    { id: 4, registrationNumber: 'ROH-UP-2001', name: 'City Care Clinic', city: 'Noida', specializations: ['General Medicine', 'Orthopedics'], inNetwork: false },
  ];
  const user = (id, email, name, role, extra = {}) => ({ id, email, name, role, alternateEmail: null, active: true, password: DEMO_PASSWORD, patientId: null, providerId: null, createdAt: iso(400 * DAY), lastLoginAt: null, ...extra });
  const users = [
    user(1, 'rahul@claimflow.dev', 'Rahul Sharma', 'POLICYHOLDER', { patientId: 1 }),
    user(2, 'priya@claimflow.dev', 'Priya Nair', 'POLICYHOLDER', { patientId: 2 }),
    user(3, 'amit@claimflow.dev', 'Amit Verma', 'POLICYHOLDER', { patientId: 3 }),
    user(4, 'apollo@claimflow.dev', 'Apollo Hospital desk', 'HOSPITAL', { providerId: 1 }),
    user(5, 'max@claimflow.dev', 'Max Hospital desk', 'HOSPITAL', { providerId: 3 }),
    user(6, 'officer@claimflow.dev', 'Neha Kapoor', 'OFFICER'),
    user(7, 'admin@claimflow.dev', 'Asha Admin', 'ADMIN'),
  ];
  // [patient, provider, code, amount, status, reason, admitted, discharged, createdDaysAgo, type, description]
  const rows = [
    [1, 1, 'I21', 50000, 'PAID', null, 8, 5, 5, 'REIMBURSEMENT', '3 nights, angioplasty'],
    [1, 3, 'J18', 10000, 'PAID', null, 4, 2, 2, 'CASHLESS', null],
    [1, 4, 'S72', 20000, 'REJECTED', 'City Care Clinic is out of network', 3, 1, 1, 'REIMBURSEMENT', null],
    [4, 2, 'K35', 260000, 'PAID', null, 10, 7, 7, 'CASHLESS', 'Appendix removal'],
    [5, 2, 'A90', 49000, 'PAID', null, 20, 17, 15, 'REIMBURSEMENT', null],
    [2, 1, 'K35', 118000, 'UNDER_REVIEW', null, 8, 5, 1, 'REIMBURSEMENT', 'Emergency appendectomy'],
    [5, 3, 'H25', 250000, 'UNDER_REVIEW', null, 18, 16, 0.2, 'CASHLESS', 'Both eyes'],
  ];
  const claims = [];
  rows.forEach(([patientId, providerId, code, amount, status, reason, inDays, outDays, created, type, description], i) => {
    const id = i + 1;
    const p = patients.find((x) => x.id === patientId);
    const createdAt = iso(created * DAY);
    const claim = {
      id, claimNumber: claimNo(id), type, patientId, providerId, patientName: p.name, policyNumber: p.policyNumber,
      diagnosisCode: code, treatment: TREATMENT[code], description, amount, admissionDate: dateAgo(inDays), dischargeDate: dateAgo(outDays),
      status, reason, paymentReference: status === 'PAID' ? `PAY-${(0x7f3a91c2 + id * 7919).toString(16).toUpperCase()}` : null,
      createdAt, decidedAt: status === 'UNDER_REVIEW' ? null : createdAt, paidAt: status === 'PAID' ? iso(created * DAY - 5000) : null,
      reviewNotes: [], extraEmail: null,
      submittedByName: type === 'CASHLESS' ? providers.find((x) => x.id === providerId).name + ' desk' : p.name,
      submittedByRole: type === 'CASHLESS' ? 'HOSPITAL' : 'POLICYHOLDER',
    };
    if (status !== 'REJECTED') claim.fraud = assessFraud(claim, { ...p, usedAmount: 0 }, claims.filter((c) => c.patientId === patientId));
    if (status === 'UNDER_REVIEW') claim.reason = 'Our claims team is reviewing this claim. We’ll update you soon.';
    claims.push(claim);
  });
  const payments = claims
    .filter((c) => c.status === 'PAID')
    .map((c, i) => ({ id: i + 1, claimId: c.id, claimNumber: c.claimNumber, patientId: c.patientId, providerId: c.providerId, amount: c.amount, reference: c.paymentReference, status: 'COMPLETED', paidAt: c.paidAt }));
  const notifications = [];
  claims.forEach((c) => {
    if (c.status === 'REJECTED') notifications.push(note(notifications, c, 'REJECTED', c.decidedAt));
    if (c.status === 'UNDER_REVIEW') notifications.push(note(notifications, c, 'UNDER_REVIEW', c.createdAt));
    if (c.status === 'PAID') {
      notifications.push(note(notifications, c, 'APPROVED', c.decidedAt));
      notifications.push(note(notifications, c, 'PAID', c.paidAt));
    }
  });
  const documents = [
    { id: 1, title: 'ClaimFlow Secure Health Policy (sample)', fileName: 'claimflow-secure-health-policy.txt', policyNumber: null, sample: true, pages: 5, chunks: sampleClauses.length, uploadedAt: iso(30 * DAY) },
  ];
  return { patients, providers, users, claims, payments, notifications, documents, clauses: { 1: sampleClauses } };
}

function messageFor(claim, status) {
  const ref = `claim ${claim.claimNumber ?? `#${claim.id}`}`;
  switch (status) {
    case 'APPROVED':
      return `Good news! Your ${ref} of ${money(claim.amount)} is approved. We're paying the hospital now.`;
    case 'REJECTED':
      return `Your ${ref} of ${money(claim.amount)} was not approved. Reason: ${String(claim.reason).replace(/\.+$/, '')}.`;
    case 'PAID':
      return `${money(claim.amount)} for ${ref} has been paid to the hospital. Nothing more to do.`;
    case 'UNDER_REVIEW':
      return `Your ${ref} of ${money(claim.amount)} is with our claims team for a quick review. We'll let you know as soon as it's decided.`;
    case 'INFO_REQUESTED':
      return `We need a little more information for your ${ref}. ${String(claim.reason).replace(/^More information needed:\s*/, '')} Please reply from the claim page.`;
    default:
      return `Update on your ${ref}: ${status}`;
  }
}

function note(list, claim, status, sentAt = iso()) {
  return {
    id: list.length ? Math.max(...list.map((n) => n.id)) + 1 : 1,
    patientId: claim.patientId,
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    claimStatus: status,
    channel: 'IN_APP',
    deliveryStatus: 'NOT_SENT',
    recipient: null,
    message: messageFor(claim, status),
    sentAt,
  };
}

let db = null;

function load() {
  if (db) return db;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) db = JSON.parse(saved);
  } catch {
    db = null;
  }
  if (!db) db = seed();
  wakeApi(); // the free API server sleeps after 15 idle minutes: start waking it now
  db.clauses ??= {};
  db.clauses[1] = sampleClauses; // never stored twice, always fresh
  return db;
}

function save() {
  try {
    const { clauses, ...rest } = db;
    const uploaded = Object.fromEntries(Object.entries(clauses).filter(([id]) => id !== '1'));
    localStorage.setItem(KEY, JSON.stringify({ ...rest, clauses: uploaded }));
  } catch {
    // storage full or blocked: the demo still works until the page is reloaded
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  db = null;
}

const claimNo = (id) => `CLM-${new Date().getFullYear()}-${String(id).padStart(6, '0')}`;
const nextId = (list) => (list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1);
const withRemaining = (p) => ({ ...p, remainingCoverage: Number(p.coverageLimit) - Number(p.usedAmount) });

/** payment-service: approved claims are paid a few seconds later (checked whenever data is read). */
async function advance() {
  let changed = false;
  const paid = [];
  for (const claim of db.claims) {
    if (claim.status === 'APPROVED' && Date.now() - new Date(claim.decidedAt).getTime() >= PAYMENT_DELAY_MS) {
      const reference = `PAY-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      claim.status = 'PAID';
      claim.paidAt = iso();
      claim.paymentReference = reference;
      db.payments.push({ id: nextId(db.payments), claimId: claim.id, claimNumber: claim.claimNumber, patientId: claim.patientId, providerId: claim.providerId, amount: claim.amount, reference, status: 'COMPLETED', paidAt: claim.paidAt });
      const n = note(db.notifications, claim, 'PAID');
      db.notifications.push(n);
      paid.push([claim, n]);
      changed = true;
    }
  }
  if (changed) save();
  for (const [claim, n] of paid) await emailFor(claim, 'PAID', n);
}

// ---------------------------------------------------------------- auth-service (demo)

/** A JWT-shaped token: the app only reads its expiry; the demo looks the user up by id. */
function tokenFor(u) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: String(u.id), role: u.role, exp: Math.floor(Date.now() / 1000) + 12 * 3600 })}.demo`;
}

function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const u = db.users.find((x) => String(x.id) === payload.sub);
    return u?.active ? u : null;
  } catch {
    return null;
  }
}

const userView = ({ password, ...u }) => u;
const login = (u) => {
  u.lastLoginAt = iso();
  save();
  return { token: tokenFor(u), user: userView(u) };
};
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim());
const byEmail = (e) => db.users.find((u) => u.email === String(e).trim().toLowerCase());

function need(me, roles) {
  if (!me) throw new DemoError(401, 'Please sign in');
  if (roles && !roles.includes(me.role)) throw new DemoError(403, "You don't have access to this");
}

const isStaff = (me) => STAFF.includes(me?.role);
const canSee = (claim, me) => isStaff(me)
  || (me.role === 'POLICYHOLDER' && claim.patientId === me.patientId)
  || (me.role === 'HOSPITAL' && claim.providerId === me.providerId);

/** Fraud scores and officers' internal notes are for staff only (same as ClaimService.forCaller). */
function claimView(claim, me) {
  if (isStaff(me)) return claim;
  const { fraud, ...rest } = claim;
  return {
    ...rest,
    reviewNotes: (claim.reviewNotes ?? []).filter((n) => n.action !== 'NOTE')
      .map((n) => (n.action === 'INFO_ADDED' ? n : { ...n, byName: 'Claims team' })),
  };
}

function findClaim(id, me) {
  const claim = db.claims.find((c) => c.id === Number(id));
  if (!claim || !canSee(claim, me)) throw new DemoError(404, `Claim ${id} not found`);
  return claim;
}

function decide(claim, status, reason) {
  claim.status = status;
  claim.reason = reason;
  claim.decidedAt = iso();
}

async function publish(claim) {
  const n = note(db.notifications, claim, claim.status);
  db.notifications.push(n);
  save();
  if (['APPROVED', 'REJECTED'].includes(claim.status)) await emailFor(claim, claim.status, n);
}

/**
 * notification-service: emails the patient (and the claim's extra address) through the ClaimFlow API.
 * Demo addresses (@example.com) are skipped, like in the real app. If the server is still waking up,
 * the email is sent in the background and the message updates when it's done.
 */
async function emailFor(claim, status, notification) {
  if (!API_URL) return;
  const health = apiHealth();
  if (health && !health.email) return; // the server has no email key
  const patient = db.patients.find((p) => p.id === claim.patientId);
  const provider = db.providers.find((p) => p.id === claim.providerId);
  const account = db.users.find((u) => u.patientId === claim.patientId);
  // login email + alternate email + the claim's extra address; demo domains are skipped
  const to = [...new Set([account?.email ?? patient?.email, account?.alternateEmail, claim.extraEmail]
    .filter((e) => e && !/@(example\.com|claimflow\.dev)$/i.test(e)).map((e) => e.toLowerCase()))];
  if (!to.length) return;
  const body = { to, status, claimId: claim.id, amount: claim.amount, reason: claim.reason, patientName: patient?.name, hospital: provider?.name };
  const apply = (r) => {
    if (r.ok && r.data.sent?.length) {
      notification.channel = 'EMAIL';
      notification.deliveryStatus = 'SENT';
      notification.recipient = r.data.sent.join(', ');
    } else if (!r.ok && r.reason === 'error') {
      notification.deliveryStatus = 'FAILED';
      notification.recipient = to.join(', ');
    }
    save();
  };
  if (health?.email) apply(await callApi('/email', body, { awakeTimeout: 12_000 }));
  else callApi('/email', body, { coldTimeout: 120_000 }).then(apply);
}

/** Adds a short line saying why a prepared answer is shown instead of a live AI one. */
function preparedBecause(local, result) {
  if (result.reason === 'off') return local;
  const why =
    result.reason === 'disabled'
      ? "Live AI is off, so this answer comes straight from your policy's clauses (RAG search, no AI)."
      : result.reason === 'waking'
      ? 'The live AI (Gemini) is waking up on its free server, about a minute. Here is a prepared answer; ask again shortly for a live one.'
      : `The live AI didn't answer${result.message ? ` (${result.message})` : ''}, so here is a prepared answer.`;
  return { ...local, note: local.note ? `${why} ${local.note}` : why };
}

/** claims-service ClaimRules, the same three checks as the Java code. */
function rejectionReason(patient, provider, amount) {
  if (!patient) return 'Patient not found';
  if (!patient.policyActive) return 'Policy is inactive';
  if (!provider) return 'Hospital not found';
  if (!provider.inNetwork) return `${provider.name} is out of network`;
  const remaining = Number(patient.coverageLimit) - Number(patient.usedAmount);
  if (Number(amount) > remaining) return `Coverage limit exceeded (remaining ${money(remaining)})`;
  return null;
}

function findDocument(id) {
  const doc = id ? db.documents.find((d) => d.id === Number(id)) : db.documents.find((d) => d.sample);
  if (!doc) throw new DemoError(404, id ? `Policy document ${id} not found` : 'No policy documents uploaded yet');
  return doc;
}

async function fileFrom(form) {
  const file = form?.get('file');
  if (!file || !file.size) throw new DemoError(400, 'The file is empty');
  return file;
}

const isImage = (file) => /\.(jpe?g|png|webp)$/i.test(file.name) || file.type.startsWith('image/');

async function readDocument(file) {
  const name = file.name.toLowerCase();
  if (isImage(file)) {
    throw new DemoError(
      400,
      'Reading a photo needs the AI, which is switched off on this free demo site. Upload the policy as a PDF instead (try the sample policy).',
    );
  }
  if (name.endsWith('.txt')) return [await file.text()];
  if (!name.endsWith('.pdf')) throw new DemoError(400, 'Please upload a PDF or .txt file.');
  try {
    const { readPdfPages } = await import('./pdfText.js');
    return await readPdfPages(file);
  } catch {
    throw new DemoError(400, "This PDF couldn't be read. Try another file.");
  }
}

const routes = [
  // ---- Accounts ----
  ['POST', /^\/auth\/login$/, (_, body) => {
    const u = byEmail(body?.email ?? '');
    if (!u || u.password !== body?.password) throw new DemoError(401, 'That email and password don’t match.');
    if (!u.active) throw new DemoError(403, 'This account has been switched off. Contact your administrator.');
    return login(u);
  }],
  ['POST', /^\/auth\/register$/, (_, body) => {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!body?.name?.trim() || !isEmail(email) || String(body?.password ?? '').length < 8) throw new DemoError(400, 'Please fill in every field');
    if (byEmail(email)) throw new DemoError(409, 'An account with this email already exists. Sign in instead.');
    let patient;
    if (body.policyNumber) {
      patient = db.patients.find((p) => p.policyNumber.toUpperCase() === body.policyNumber.toUpperCase());
      if (!patient) throw new DemoError(404, `No policy ${body.policyNumber} found`);
      if (patient.email.toLowerCase() !== email) throw new DemoError(400, 'Use the email that’s on your policy to link it.');
      if (db.users.some((u) => u.patientId === patient.id)) throw new DemoError(409, 'This policy already has an account. Sign in instead.');
    } else {
      patient = { id: nextId(db.patients), name: body.name.trim(), email, phone: body.phone ?? null, policyNumber: `POL${100000 + Math.floor(Math.random() * 900000)}`, coverageLimit: 500000, usedAmount: 0, policyActive: true, policyStartDate: dateAgo(0), createdAt: iso() };
      db.patients.push(patient);
    }
    const u = { id: nextId(db.users), email, name: body.name.trim(), role: 'POLICYHOLDER', alternateEmail: body.alternateEmail?.trim().toLowerCase() || null, active: true, password: body.password, patientId: patient.id, providerId: null, createdAt: iso(), lastLoginAt: null };
    db.users.push(u);
    return login(u);
  }],
  ['POST', /^\/auth\/forgot-password$/, () => ({ message: 'If an account uses this email, a reset link is on its way.' })],
  ['POST', /^\/auth\/reset-password$/, () => {
    throw new DemoError(400, 'Reset emails aren’t sent on the demo site. Use a demo account (password: password123).');
  }],
  ['GET', /^\/auth\/me$/, (_, __, ___, me) => (need(me), userView(me))],
  ['PATCH', /^\/auth\/me$/, (_, body, __, me) => {
    need(me);
    if (body?.name?.trim()) me.name = body.name.trim();
    if (body?.alternateEmail !== undefined) {
      const alt = String(body.alternateEmail ?? '').trim().toLowerCase();
      if (alt && !isEmail(alt)) throw new DemoError(400, 'Enter a valid alternate email');
      me.alternateEmail = alt || null;
    }
    save();
    return userView(me);
  }],
  ['POST', /^\/auth\/me\/password$/, (_, body, __, me) => {
    need(me);
    if (body?.currentPassword !== me.password) throw new DemoError(400, 'That isn’t your current password.');
    if (String(body?.newPassword ?? '').length < 8) throw new DemoError(400, 'Use at least 8 characters.');
    me.password = body.newPassword;
    save();
    return { message: 'Password changed' };
  }],
  ['GET', /^\/auth\/users$/, (_, __, ___, me) => (need(me, ['ADMIN']), db.users.map(userView).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))],
  ['POST', /^\/auth\/users$/, (_, body, __, me) => {
    need(me, ['ADMIN']);
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!isEmail(email) || !body?.name?.trim() || String(body?.password ?? '').length < 8) throw new DemoError(400, 'Please fill in every field');
    if (byEmail(email)) throw new DemoError(409, 'An account with this email already exists');
    if (body.role === 'HOSPITAL' && !db.providers.some((p) => p.id === Number(body.providerId))) throw new DemoError(400, 'Choose the hospital');
    const u = { id: nextId(db.users), email, name: body.name.trim(), role: body.role, alternateEmail: body.alternateEmail || null, active: true, password: body.password, patientId: null, providerId: body.role === 'HOSPITAL' ? Number(body.providerId) : null, createdAt: iso(), lastLoginAt: null };
    db.users.push(u);
    save();
    return userView(u);
  }],
  ['PATCH', /^\/auth\/users\/(\d+)\/active$/, ([id], body, __, me) => {
    need(me, ['ADMIN']);
    const u = db.users.find((x) => x.id === Number(id));
    if (!u) throw new DemoError(404, 'Account not found');
    if (u.id === me.id) throw new DemoError(400, 'You can’t switch off your own account');
    u.active = Boolean(body?.active);
    save();
    return userView(u);
  }],

  // ---- Policies and hospitals ----
  ['GET', /^\/patients$/, (_, __, ___, me) => (need(me, STAFF), db.patients.map(withRemaining))],
  ['GET', /^\/patients\/by-policy\/([^/]+)$/, ([number], __, ___, me) => {
    need(me, ['HOSPITAL', ...STAFF]);
    const p = db.patients.find((x) => x.policyNumber.toUpperCase() === decodeURIComponent(number).toUpperCase());
    if (!p) throw new DemoError(404, `No policy ${decodeURIComponent(number)}`);
    return withRemaining(p);
  }],
  ['GET', /^\/patients\/(\d+)$/, ([id], __, ___, me) => {
    need(me);
    if (me.role === 'POLICYHOLDER' && me.patientId !== Number(id)) throw new DemoError(403, "You don't have access to this");
    const p = db.patients.find((x) => x.id === Number(id));
    if (!p) throw new DemoError(404, `Patient ${id} not found`);
    return withRemaining(p);
  }],
  ['PATCH', /^\/patients\/(\d+)\/profile$/, ([id], body, __, me) => {
    need(me, ['POLICYHOLDER']);
    if (me.patientId !== Number(id)) throw new DemoError(403, "You don't have access to this");
    const p = db.patients.find((x) => x.id === Number(id));
    for (const k of ['phone', 'address', 'dateOfBirth', 'gender']) if (body?.[k] !== undefined) p[k] = body[k] || null;
    save();
    return withRemaining(p);
  }],
  ['GET', /^\/providers$/, (_, __, ___, me) => (need(me), db.providers)],
  ['POST', /^\/providers$/, (_, body, __, me) => {
    need(me, ['ADMIN']);
    if (!body?.name || !body?.city || !body?.registrationNumber || !body?.specializations?.length) throw new DemoError(400, 'Please fill in every field');
    if (db.providers.some((p) => p.registrationNumber === body.registrationNumber)) throw new DemoError(409, 'A hospital with this registration number exists');
    const p = { id: nextId(db.providers), ...body, inNetwork: body.inNetwork ?? true };
    db.providers.push(p);
    save();
    return p;
  }],

  // ---- Claims ----
  ['GET', /^\/claims$/, (_, __, ___, me) => (need(me, STAFF), [...db.claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))],
  ['GET', /^\/claims\/review-queue$/, (_, __, ___, me) => {
    need(me, STAFF);
    return db.claims.filter((c) => ['UNDER_REVIEW', 'INFO_REQUESTED'].includes(c.status))
      .sort((a, b) => (b.fraud?.score ?? 0) - (a.fraud?.score ?? 0) || a.createdAt.localeCompare(b.createdAt));
  }],
  ['GET', /^\/claims\/stats$/, (_, __, ___, me) => {
    need(me, STAFF);
    const byStatus = {};
    const byRisk = {};
    for (const c of db.claims) {
      byStatus[c.status] ??= { count: 0, amount: 0 };
      byStatus[c.status].count += 1;
      byStatus[c.status].amount += Number(c.amount);
      if (c.fraud) byRisk[c.fraud.level] = (byRisk[c.fraud.level] ?? 0) + 1;
    }
    return { total: db.claims.length, byStatus, byRisk };
  }],
  ['GET', /^\/claims\/patient\/(\d+)$/, ([id], __, ___, me) => {
    need(me, ['POLICYHOLDER', ...STAFF]);
    if (me.role === 'POLICYHOLDER' && me.patientId !== Number(id)) throw new DemoError(403, "You don't have access to this");
    return db.claims.filter((c) => c.patientId === Number(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => claimView(c, me));
  }],
  ['GET', /^\/claims\/provider\/(\d+)$/, ([id], __, ___, me) => {
    need(me, ['HOSPITAL', ...STAFF]);
    if (me.role === 'HOSPITAL' && me.providerId !== Number(id)) throw new DemoError(403, "You don't have access to this");
    return db.claims.filter((c) => c.providerId === Number(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => claimView(c, me));
  }],
  ['GET', /^\/claims\/(\d+)$/, ([id], __, ___, me) => (need(me), claimView(findClaim(id, me), me))],
  ['POST', /^\/claims$/, async (_, body, __, me) => {
    need(me, ['POLICYHOLDER', 'HOSPITAL']);
    if (!body?.patientId || !body?.providerId || !body?.diagnosisCode || !(Number(body.amount) > 0)) throw new DemoError(400, 'Please fill in every field');
    if (me.role === 'POLICYHOLDER' && Number(body.patientId) !== me.patientId) throw new DemoError(403, 'You can only claim on your own policy');
    if (me.role === 'HOSPITAL' && Number(body.providerId) !== me.providerId) throw new DemoError(403, 'A hospital can only raise claims for its own patients');
    if (body.admissionDate && body.dischargeDate && body.dischargeDate < body.admissionDate) throw new DemoError(400, "The discharge date can't be before the admission date");
    if (body.admissionDate && body.admissionDate > dateAgo(0)) throw new DemoError(400, "The admission date can't be in the future");
    const patient = db.patients.find((p) => p.id === Number(body.patientId));
    const provider = db.providers.find((p) => p.id === Number(body.providerId));
    const newId = nextId(db.claims);
    const claim = {
      id: newId, claimNumber: claimNo(newId), type: me.role === 'HOSPITAL' ? 'CASHLESS' : 'REIMBURSEMENT',
      patientId: Number(body.patientId), providerId: Number(body.providerId), patientName: patient?.name, policyNumber: patient?.policyNumber,
      diagnosisCode: String(body.diagnosisCode).toUpperCase(), treatment: body.treatment ?? null, description: body.description ?? null,
      amount: Number(body.amount), admissionDate: body.admissionDate ?? null, dischargeDate: body.dischargeDate ?? null,
      extraEmail: body.extraEmail ?? null, status: 'SUBMITTED', reason: null, paymentReference: null, createdAt: iso(), decidedAt: null, paidAt: null,
      reviewNotes: [], submittedByName: me.name, submittedByRole: me.role,
    };
    const reason = rejectionReason(patient, provider, claim.amount);
    if (reason) {
      decide(claim, 'REJECTED', reason);
    } else {
      claim.fraud = assessFraud(claim, patient, db.claims.filter((c) => c.patientId === claim.patientId));
      if (claim.fraud.level !== 'LOW') {
        claim.status = 'UNDER_REVIEW';
        claim.reason = 'Our claims team is reviewing this claim. We’ll update you soon.';
      } else {
        decide(claim, 'APPROVED', null);
        patient.usedAmount = Number(patient.usedAmount) + claim.amount;
      }
    }
    db.claims.push(claim);
    await publish(claim);
    return claimView(claim, me);
  }],
  ['POST', /^\/claims\/(\d+)\/review$/, async ([id], body, __, me) => {
    need(me, STAFF);
    const claim = findClaim(id, me);
    const text = String(body?.note ?? '').trim();
    const entry = (action) => ({ action, note: text || null, byUserId: me.id, byName: me.name, byRole: me.role, at: iso() });
    if (body?.action === 'NOTE') {
      if (!text) throw new DemoError(400, 'Write a note');
      claim.reviewNotes.push(entry('NOTE'));
      save();
      return claim;
    }
    if (!['UNDER_REVIEW', 'INFO_REQUESTED'].includes(claim.status)) throw new DemoError(409, `Claim ${claim.claimNumber} is ${claim.status} and can't be reviewed`);
    if (body?.action === 'REJECT' || body?.action === 'REQUEST_INFO') {
      if (!text) throw new DemoError(400, body.action === 'REJECT' ? 'Write the reason for rejecting' : 'Write what information you need');
    }
    if (body?.action === 'APPROVE') {
      const patient = db.patients.find((p) => p.id === claim.patientId);
      const provider = db.providers.find((p) => p.id === claim.providerId);
      const reason = rejectionReason(patient, provider, claim.amount);
      if (reason) decide(claim, 'REJECTED', reason);
      else {
        decide(claim, 'APPROVED', null);
        patient.usedAmount = Number(patient.usedAmount) + claim.amount;
      }
    } else if (body?.action === 'REJECT') {
      decide(claim, 'REJECTED', `Rejected after review: ${text}`);
    } else if (body?.action === 'REQUEST_INFO') {
      claim.status = 'INFO_REQUESTED';
      claim.reason = `More information needed: ${text}`;
    } else {
      throw new DemoError(400, 'Choose approve, reject, request information or note');
    }
    claim.reviewNotes.push(entry(body.action));
    await publish(claim);
    return claim;
  }],
  ['POST', /^\/claims\/(\d+)\/info$/, ([id], body, __, me) => {
    need(me, ['POLICYHOLDER', 'HOSPITAL']);
    const claim = findClaim(id, me);
    if (claim.status !== 'INFO_REQUESTED') throw new DemoError(409, `Claim ${claim.claimNumber} isn't waiting for information`);
    if (!String(body?.note ?? '').trim()) throw new DemoError(400, 'Write your reply');
    claim.reviewNotes.push({ action: 'INFO_ADDED', note: body.note.trim(), byUserId: me.id, byName: me.name, byRole: me.role, at: iso() });
    claim.status = 'UNDER_REVIEW';
    claim.reason = 'Thanks, we’ve got your reply. Our claims team is reviewing this claim.';
    save();
    return claimView(claim, me);
  }],

  // ---- Payments and messages ----
  ['GET', /^\/notifications\/patient\/(\d+)$/, ([id], __, ___, me) => {
    need(me, ['POLICYHOLDER', ...STAFF]);
    return db.notifications.filter((n) => n.patientId === Number(id)).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }],
  ['GET', /^\/payments\/patient\/(\d+)$/, ([id], __, ___, me) => (need(me), db.payments.filter((p) => p.patientId === Number(id)))],
  ['GET', /^\/payments\/provider\/(\d+)$/, ([id], __, ___, me) => {
    need(me, ['HOSPITAL', ...STAFF]);
    if (me.role === 'HOSPITAL' && me.providerId !== Number(id)) throw new DemoError(403, "You don't have access to this");
    return db.payments.filter((p) => p.providerId === Number(id));
  }],

  // ---- Policy Assistant ----
  [
    'GET',
    /^\/policies\/assistant\/status$/,
    async () => {
      await Promise.race([wakeApi(), wait(1500)]);
      const h = apiHealth();
      const base = { documents: db.documents.length, chunks: 0, chunksWaitingForEmbedding: 0, embeddingModel: 'keyword search in your browser' };
      if (aiOff()) return { ...base, provider: 'rag', aiEnabled: false, aiOff: true, chatModel: null };
      return h?.ai
        ? { ...base, provider: 'gemini', aiEnabled: true, chatModel: h.model }
        : { ...base, provider: 'demo', aiEnabled: false, chatModel: null, waking: Boolean(API_URL) };
    },
  ],
  ['GET', /^\/policies$/, () => db.documents],
  [
    'POST',
    /^\/policies$/,
    async (_, __, form) => {
      const file = await fileFrom(form);
      const pages = await readDocument(file);
      const text = pages.join('\n=== Page break ===\n');
      let clauses = [];
      pages.forEach((p, i) => parseClauses(p).forEach((c) => clauses.push({ ...c, page: i + 1 })));
      if (clauses.length < 5) clauses = chunkPages(pages);
      if (!text.trim()) throw new DemoError(400, 'No text found in this file (is it a scanned image?).');
      const title = form.get('title') || file.name.replace(/\.[^.]+$/, '');
      const doc = { id: nextId(db.documents), title, fileName: file.name, policyNumber: form.get('policyNumber') || null, sample: false, pages: pages.length, chunks: clauses.length, uploadedAt: iso() };
      db.documents.push(doc);
      db.clauses[doc.id] = clauses;
      save();
      return doc;
    },
  ],
  [
    'POST',
    /^\/policies\/extract-profile$/,
    async (_, __, form) => {
      const file = await fileFrom(form);
      if (isImage(file)) {
        if (!API_URL) await readDocument(file); // throws the "photos need AI" message
        if (aiOff()) throw new DemoError(400, 'Reading a photo needs live AI, which is switched off. Turn AI on (top bar), or upload the PDF.');
        const result = await callAi('/extract-profile', { image: { mimeType: 'image/jpeg', base64: await imageToBase64(file) } }, { coldTimeout: 20_000 });
        if (result.ok) return result.data;
        throw new DemoError(
          503,
          result.reason === 'waking'
            ? 'The AI server is waking up (free plan, about a minute). Try the photo again shortly, or upload the PDF now.'
            : result.message || "The AI couldn't read this photo. Try again, or upload the PDF.",
        );
      }
      const pages = await readDocument(file);
      const text = pages.slice(0, 4).join('\n');
      const local = extractProfileFromText(text);
      if (apiHealth()?.ai && !aiOff()) {
        const result = await callAi('/extract-profile', { text }, { awakeTimeout: 30_000 });
        if (result.ok) {
          const merged = { ...result.data };
          for (const key of ['name', 'email', 'phone', 'policyNumber', 'coverageLimit']) merged[key] ??= local[key];
          return merged;
        }
      }
      return local;
    },
  ],
  [
    'DELETE',
    /^\/policies\/(\d+)$/,
    ([id]) => {
      const doc = db.documents.find((d) => d.id === Number(id) && !d.sample);
      if (!doc) throw new DemoError(404, `No uploaded document ${id} (the sample can't be deleted)`);
      db.documents = db.documents.filter((d) => d !== doc);
      delete db.clauses[doc.id];
      save();
      return null;
    },
  ],
  [
    'POST',
    /^\/policies\/ask$/,
    async (_, body) => {
      if (!body?.question?.trim()) throw new DemoError(400, 'Type a question first.');
      const doc = findDocument(body.documentId);
      const question = body.question.trim();
      const { local, sources } = retrieveForQuestion(question, doc, db.clauses[doc.id] ?? []);
      if (!sources.length) return local;
      const result = await callAi('/ask', { question, documentTitle: doc.title, sources });
      if (result.ok) return { answer: result.data.answer, mode: 'ai', note: null, sources };
      return preparedBecause(local, result);
    },
  ],
  [
    'POST',
    /^\/policies\/precheck$/,
    async (_, body) => {
      const doc = findDocument(body?.documentId);
      const provider = db.providers.find((p) => p.name === body?.hospitalName);
      const input = { ...body, inNetwork: provider ? provider.inNetwork : undefined };
      const { local, sources } = retrieveForPrecheck(input, doc, db.clauses[doc.id] ?? sampleClauses);
      const result = await callAi('/precheck', { ...input, documentTitle: doc.title, sources });
      if (result.ok) return { answer: result.data.answer, mode: 'ai', note: null, sources };
      return preparedBecause(local, result);
    },
  ],
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PUBLIC = /^\/auth\/(login|register|forgot-password|reset-password)$/;

/** Same contract as fetch-ing the API Gateway: returns the JSON body or throws DemoError(status, message). */
export async function demoRequest(path, { method = 'GET', body, token } = {}) {
  load();
  await advance();
  const url = path.split('?')[0];
  const isAi = /^\/policies\/(ask|precheck|extract-profile)$/.test(url);
  await wait(isAi ? 700 + Math.random() * 500 : 120 + Math.random() * 160); // feels like a real network
  const me = userFromToken(token);
  if (!me && !PUBLIC.test(url)) throw new DemoError(401, 'Please sign in');
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = url.match(re);
    if (!match) continue;
    const json = typeof body === 'string' ? JSON.parse(body) : null;
    const form = typeof FormData !== 'undefined' && body instanceof FormData ? body : null;
    return structuredClone(await handler(match.slice(1), json, form, me));
  }
  throw new DemoError(404, `Not found: ${method} ${url}`);
}
