import samplePolicyText from './sample-policy.txt?raw';
import { chunkPages, extractProfileFromText, parseClauses, retrieveForPrecheck, retrieveForQuestion } from './policyBrain.js';
import { API_URL, aiOff, apiHealth, callApi, imageToBase64, wakeApi } from './aiClient.js';

/** Calls an AI route, unless the visitor switched live AI off (then the caller uses RAG only). */
const callAi = (path, body, options) => (aiOff() ? Promise.resolve({ ok: false, reason: 'disabled' }) : callApi(path, body, options));

/**
 * The free demo site has no servers, so this file plays the part of all 9 microservices, in the browser.
 * It answers the same URLs as the API Gateway, with the same JSON shapes and the same business rules:
 *   patient-service · provider-service · claims-service (ClaimRules) · payment-service (pays after ~4 s)
 *   notification-service (messages) · policy-assistant-service (see policyBrain.js)
 * Data is kept in this browser's localStorage, so every visitor gets their own copy.
 */

const KEY = 'claimflow-demo-v1';
const PAYMENT_DELAY_MS = 4000;

export class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const money = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
const sampleClauses = parseClauses(samplePolicyText);

function seed() {
  const patients = [
    { id: 1, name: 'Rahul Sharma', email: 'rahul.sharma@example.com', phone: '+91 98100 00001', policyNumber: 'POL1001', coverageLimit: 500000, usedAmount: 60000, policyActive: true, createdAt: iso(30 * DAY) },
    { id: 2, name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+91 98100 00002', policyNumber: 'POL1002', coverageLimit: 300000, usedAmount: 0, policyActive: true, createdAt: iso(25 * DAY) },
    { id: 3, name: 'Amit Verma', email: 'amit.verma@example.com', phone: '+91 98100 00003', policyNumber: 'POL1003', coverageLimit: 200000, usedAmount: 0, policyActive: false, createdAt: iso(20 * DAY) },
    { id: 4, name: 'Sunita Rao', email: 'sunita.rao@example.com', phone: '+91 98100 00004', policyNumber: 'POL1004', coverageLimit: 300000, usedAmount: 260000, policyActive: true, createdAt: iso(15 * DAY) },
    { id: 5, name: 'Arjun Mehta', email: 'arjun.mehta@example.com', phone: '+91 98100 00005', policyNumber: 'POL1005', coverageLimit: 1000000, usedAmount: 0, policyActive: true, createdAt: iso(10 * DAY) },
  ];
  const providers = [
    { id: 1, registrationNumber: 'ROH-DL-1001', name: 'Apollo Hospital', city: 'New Delhi', specializations: ['Cardiology', 'General Medicine', 'Orthopedics'], inNetwork: true },
    { id: 2, registrationNumber: 'ROH-HR-1002', name: 'Fortis Memorial Hospital', city: 'Gurugram', specializations: ['Neurology', 'Oncology'], inNetwork: true },
    { id: 3, registrationNumber: 'ROH-DL-1003', name: 'Max Super Speciality Hospital', city: 'Saket, New Delhi', specializations: ['Cardiology', 'Gastroenterology', 'Pulmonology'], inNetwork: true },
    { id: 4, registrationNumber: 'ROH-UP-2001', name: 'City Care Clinic', city: 'Noida', specializations: ['General Medicine', 'Orthopedics'], inNetwork: false },
  ];
  const claims = [
    { id: 1, claimNumber: claimNo(1), patientId: 1, providerId: 1, diagnosisCode: 'I21', description: '3 nights, angioplasty', amount: 50000, status: 'PAID', reason: null, paymentReference: 'PAY-7F3A91C2', createdAt: iso(5 * DAY), decidedAt: iso(5 * DAY), paidAt: iso(5 * DAY - 5000) },
    { id: 2, claimNumber: claimNo(2), patientId: 1, providerId: 3, diagnosisCode: 'J18', description: null, amount: 10000, status: 'PAID', reason: null, paymentReference: 'PAY-4C1D88E2', createdAt: iso(2 * DAY), decidedAt: iso(2 * DAY), paidAt: iso(2 * DAY - 5000) },
    { id: 3, claimNumber: claimNo(3), patientId: 1, providerId: 4, diagnosisCode: 'S72', description: null, amount: 20000, status: 'REJECTED', reason: 'City Care Clinic is out of network', paymentReference: null, createdAt: iso(DAY), decidedAt: iso(DAY), paidAt: null },
    { id: 4, claimNumber: claimNo(4), patientId: 4, providerId: 2, diagnosisCode: 'K35', description: 'Appendix removal', amount: 260000, status: 'PAID', reason: null, paymentReference: 'PAY-91BC20AA', createdAt: iso(7 * DAY), decidedAt: iso(7 * DAY), paidAt: iso(7 * DAY - 5000) },
  ];
  const payments = claims
    .filter((c) => c.status === 'PAID')
    .map((c, i) => ({ id: i + 1, claimId: c.id, claimNumber: c.claimNumber, patientId: c.patientId, providerId: c.providerId, amount: c.amount, reference: c.paymentReference, status: 'COMPLETED', paidAt: c.paidAt }));
  const notifications = [];
  claims.forEach((c) => {
    if (c.status === 'REJECTED') notifications.push(note(notifications, c, 'REJECTED', c.decidedAt));
    if (c.status === 'PAID') {
      notifications.push(note(notifications, c, 'APPROVED', c.decidedAt));
      notifications.push(note(notifications, c, 'PAID', c.paidAt));
    }
  });
  const documents = [
    { id: 1, title: 'ClaimFlow Secure Health Policy (sample)', fileName: 'claimflow-secure-health-policy.txt', policyNumber: null, sample: true, pages: 5, chunks: sampleClauses.length, uploadedAt: iso(30 * DAY) },
  ];
  return { patients, providers, claims, payments, notifications, documents, clauses: { 1: sampleClauses } };
}

function messageFor(claim, status) {
  const ref = `claim ${claim.claimNumber ?? `#${claim.id}`}`;
  switch (status) {
    case 'APPROVED':
      return `Good news! Your ${ref} of ${money(claim.amount)} is approved. We're paying the hospital now.`;
    case 'REJECTED':
      return `Your ${ref} of ${money(claim.amount)} was not approved. Reason: ${claim.reason}.`;
    case 'PAID':
      return `${money(claim.amount)} for ${ref} has been paid to the hospital. Nothing more to do.`;
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
  const to = [patient?.email, claim.extraEmail].filter((e) => e && !/@example\.com$/i.test(e));
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
  ['GET', /^\/patients$/, () => db.patients.map(withRemaining)],
  [
    'GET',
    /^\/patients\/(\d+)$/,
    ([id]) => {
      const p = db.patients.find((x) => x.id === Number(id));
      if (!p) throw new DemoError(404, `Patient ${id} not found`);
      return withRemaining(p);
    },
  ],
  [
    'POST',
    /^\/patients$/,
    (_, body) => {
      if (!body?.name || !body?.policyNumber || !(Number(body.coverageLimit) > 0)) throw new DemoError(400, 'Name, policy number and cover are required');
      if (db.patients.some((p) => p.policyNumber.toUpperCase() === String(body.policyNumber).toUpperCase())) {
        throw new DemoError(409, `A patient with policy number ${body.policyNumber} already exists`);
      }
      const patient = { id: nextId(db.patients), name: body.name, email: body.email, phone: body.phone ?? null, policyNumber: body.policyNumber, coverageLimit: Number(body.coverageLimit), usedAmount: 0, policyActive: body.policyActive ?? true, createdAt: iso() };
      db.patients.push(patient);
      save();
      return withRemaining(patient);
    },
  ],
  ['GET', /^\/providers$/, () => db.providers],
  [
    'GET',
    /^\/claims\/patient\/(\d+)$/,
    ([id]) => db.claims.filter((c) => c.patientId === Number(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ],
  [
    'POST',
    /^\/claims$/,
    async (_, body) => {
      if (!body?.patientId || !body?.providerId || !body?.diagnosisCode || !(Number(body.amount) > 0)) throw new DemoError(400, 'Please fill in every field');
      const patient = db.patients.find((p) => p.id === Number(body.patientId));
      const provider = db.providers.find((p) => p.id === Number(body.providerId));
      const newId = nextId(db.claims);
      const claim = { id: newId, claimNumber: claimNo(newId), patientId: Number(body.patientId), providerId: Number(body.providerId), diagnosisCode: String(body.diagnosisCode).toUpperCase(), description: body.description ?? null, amount: Number(body.amount), extraEmail: body.extraEmail ?? null, status: 'SUBMITTED', reason: null, paymentReference: null, createdAt: iso(), decidedAt: null, paidAt: null };
      const reason = rejectionReason(patient, provider, claim.amount);
      claim.decidedAt = iso();
      if (reason) {
        claim.status = 'REJECTED';
        claim.reason = reason;
      } else {
        claim.status = 'APPROVED';
        patient.usedAmount = Number(patient.usedAmount) + claim.amount;
      }
      db.claims.push(claim);
      const n = note(db.notifications, claim, claim.status);
      db.notifications.push(n);
      save();
      await emailFor(claim, claim.status, n);
      return claim;
    },
  ],
  [
    'GET',
    /^\/notifications\/patient\/(\d+)$/,
    ([id]) => db.notifications.filter((n) => n.patientId === Number(id)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
  ],
  ['GET', /^\/payments\/patient\/(\d+)$/, ([id]) => db.payments.filter((p) => p.patientId === Number(id))],

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

/** Same contract as fetch-ing the API Gateway: returns the JSON body or throws DemoError(status, message). */
export async function demoRequest(path, { method = 'GET', body } = {}) {
  load();
  await advance();
  const url = path.split('?')[0];
  const isAi = /^\/policies\/(ask|precheck|extract-profile)$/.test(url);
  await wait(isAi ? 700 + Math.random() * 500 : 120 + Math.random() * 160); // feels like a real network
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = url.match(re);
    if (!match) continue;
    const json = typeof body === 'string' ? JSON.parse(body) : null;
    const form = typeof FormData !== 'undefined' && body instanceof FormData ? body : null;
    return structuredClone(await handler(match.slice(1), json, form));
  }
  throw new DemoError(404, `Not found: ${method} ${url}`);
}
