// Run with: npm test   (uses fake Gemini and Brevo servers, no keys or internet needed)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const SITE = 'https://claimflow-demo-test.onrender.com';
const calls = { gemini: [], brevo: [] };
let geminiMode = 'ok';

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {};
    if (req.url.endsWith('/chat/completions')) {
      calls.gemini.push(json);
      if (geminiMode === 'busy' && json.model === 'main-model') {
        res.writeHead(503);
        return res.end('{"error":{"message":"high demand"}}');
      }
      const isProfile = JSON.stringify(json.messages).includes('POLICY_NUMBER');
      const content = isProfile
        ? 'NAME: NEHA KAPOOR\nEMAIL: Neha@Gmail.com\nPHONE: +91 98765 43210\nPOLICY_NUMBER: cf-hl-1\nSUM_INSURED: 5 lakh'
        : `Answer from ${json.model} [1]`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    }
    if (req.url === '/v3/smtp/email') {
      calls.brevo.push({ key: req.headers['api-key'], ...json });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end('{"messageId":"x"}');
    }
    res.writeHead(404);
    res.end();
  });
});

let api;
let base;

before(async () => {
  await new Promise((r) => fake.listen(0, r));
  const f = `http://127.0.0.1:${fake.address().port}`;
  Object.assign(process.env, {
    GEMINI_API_KEY: 'test-key',
    GEMINI_BASE_URL: f,
    GEMINI_MODEL: 'main-model',
    GEMINI_FALLBACK_MODEL: 'backup-model',
    BREVO_API_KEY: 'brevo-key',
    BREVO_BASE_URL: f,
    MAIL_FROM: 'sender@gmail.com',
    ALLOWED_ORIGIN: 'claimflow-demo-test',
    AI_REQUESTS_PER_HOUR: '6',
    EMAILS_PER_HOUR: '3',
  });
  ({ server: api } = await import('./server.js'));
  await new Promise((r) => api.listen(0, r));
  base = `http://127.0.0.1:${api.address().port}`;
});

after(() => {
  api.close();
  fake.close();
});

const post = (path, body, origin = SITE, ip = '1.1.1.1') =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });

const sources = [{ number: 1, page: 3, excerpt: '5.1 Cataract surgery: up to Rs. 40,000 per eye.' }];

test('health says what is switched on', async () => {
  const res = await fetch(`${base}/health`);
  assert.deepEqual(await res.json(), { ok: true, ai: true, email: true, model: 'main-model', googleClientId: null });
});

test('other websites are refused', async () => {
  const res = await post('/ask', { question: 'hi', sources }, 'https://evil.example');
  assert.equal(res.status, 403);
  const pre = await fetch(`${base}/ask`, { method: 'OPTIONS', headers: { Origin: SITE } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), SITE);
});

test('ask sends the clauses to Gemini and returns its answer', async () => {
  const res = await post('/ask', { question: 'Is cataract covered?', documentTitle: 'My policy', sources }, SITE, '2.2.2.2');
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.answer, 'Answer from main-model [1]');
  const sent = calls.gemini.at(-1);
  assert.match(sent.messages[1].content, /\[1\] \(page 3\) 5\.1 Cataract/);
  assert.equal(sent.reasoning_effort, 'low');
});

test('busy model is retried, then the backup model answers', async () => {
  geminiMode = 'busy';
  const before = calls.gemini.length;
  const res = await post('/precheck', { diagnosisCode: 'H25', diagnosisLabel: 'Cataract', amount: 30000, hospitalName: 'Apollo', inNetwork: true, sources }, SITE, '3.3.3.3');
  const json = await res.json();
  geminiMode = 'ok';
  assert.equal(json.answer, 'Answer from backup-model [1]');
  assert.equal(calls.gemini.length - before, 4); // 3 tries on main-model, then backup-model
});

test('profile is read from a photo', async () => {
  const res = await post('/extract-profile', { image: { mimeType: 'image/png', base64: 'aGVsbG8=' } }, SITE, '4.4.4.4');
  const json = await res.json();
  assert.deepEqual(
    { name: json.name, email: json.email, policyNumber: json.policyNumber, coverageLimit: json.coverageLimit },
    { name: 'Neha Kapoor', email: 'neha@gmail.com', policyNumber: 'CF-HL-1', coverageLimit: 500000 },
  );
  const sent = calls.gemini.at(-1).messages[1].content;
  assert.equal(sent[1].image_url.url, 'data:image/png;base64,aGVsbG8=');
});

test('emails skip demo addresses and use the fixed templates', async () => {
  const res = await post('/email', { to: ['rahul@example.com', 'Dev@Gmail.com', 'not-an-email'], status: 'APPROVED', claimId: 7, amount: 40000, patientName: 'Dev Aryan', hospital: 'Apollo Hospital' }, SITE, '5.5.5.5');
  assert.deepEqual(await res.json(), { sent: ['dev@gmail.com'] });
  const mail = calls.brevo.at(-1);
  assert.equal(mail.key, 'brevo-key');
  assert.equal(mail.sender.email, 'sender@gmail.com');
  assert.equal(mail.subject, 'Claim #7 approved · ClaimFlow');
  assert.match(mail.htmlContent, /Hi Dev,/);
  assert.match(mail.htmlContent, /https:\/\/claimflow-demo-test\.onrender\.com/);
});

test('email text cannot be injected', async () => {
  await post('/email', { to: 'x@gmail.com', status: 'REJECTED', claimId: 8, amount: 1, reason: '<script>alert(1)</script>' }, SITE, '6.6.6.6');
  assert.doesNotMatch(calls.brevo.at(-1).htmlContent, /<script>/);
  const bad = await post('/email', { to: 'x@gmail.com', status: 'HELLO', claimId: 8 }, SITE, '6.6.6.6');
  assert.equal(bad.status, 400);
});

test('limits stop one visitor from using up the quota', async () => {
  const statuses = [];
  for (let i = 0; i < 8; i += 1) statuses.push((await post('/ask', { question: 'q', sources }, SITE, '9.9.9.9')).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429, 429]);
  const emails = [];
  for (let i = 0; i < 4; i += 1) emails.push((await post('/email', { to: 'y@gmail.com', status: 'PAID', claimId: i, amount: 1 }, SITE, '8.8.8.8')).status);
  assert.deepEqual(emails, [200, 200, 200, 429]);
});

test('google sign-in is refused when no client id is set', async () => {
  const res = await fetch(`${base}/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://claimflow.example' },
    body: JSON.stringify({ credential: 'x'.repeat(40) }),
  });
  assert.ok([403, 503].includes(res.status));
});
