/**
 * ClaimFlow API: the small server behind the live demo site.
 *
 * The demo site runs the claim rules in the browser. This server does only what needs a secret key:
 *   POST /ask              Gemini writes an answer from the policy clauses the site found (RAG)
 *   POST /precheck         Gemini checks a claim against the policy ("Check compliance")
 *   POST /extract-profile  Gemini reads a policy photo (or PDF text) and returns the holder's details
 *   POST /email            sends a claim update email through Brevo (Render's free plan blocks SMTP)
 *   GET  /health           is it awake, and which features are switched on
 *
 * No dependencies: Node 20+ has fetch built in. Keys come from environment variables only.
 */
import http from 'node:http';

// ---------- Settings (Render → Environment) ----------
const env = process.env;
const PORT = Number(env.PORT || 8787);
const GEMINI_API_KEY = (env.GEMINI_API_KEY || '').trim();
const GEMINI_BASE_URL = (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const GEMINI_MODEL = env.GEMINI_MODEL || 'gemini-3.5-flash-lite'; // free tier: about 500 requests a day
const GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.8-flash';
const GEMINI_REASONING = env.GEMINI_REASONING_EFFORT ?? 'low';
const BREVO_API_KEY = (env.BREVO_API_KEY || '').trim();
const BREVO_BASE_URL = (env.BREVO_BASE_URL || 'https://api.brevo.com').replace(/\/$/, '');
const MAIL_FROM = (env.MAIL_FROM || '').trim();
const MAIL_FROM_NAME = env.MAIL_FROM_NAME || 'ClaimFlow';
const SITE_URL = siteUrl(env.ALLOWED_ORIGIN || '');
const AI_PER_HOUR = Number(env.AI_REQUESTS_PER_HOUR || 30); // per visitor
const AI_PER_DAY = Number(env.AI_REQUESTS_PER_DAY || 400); // for everyone together
const EMAILS_PER_HOUR = Number(env.EMAILS_PER_HOUR || 10); // per visitor
const EMAILS_PER_DAY = Number(env.EMAILS_PER_DAY || 50); // for everyone together

const aiEnabled = Boolean(GEMINI_API_KEY);
const emailEnabled = Boolean(BREVO_API_KEY && MAIL_FROM);

/** "claimflow-demo-x.onrender.com" (what Render gives) → "https://claimflow-demo-x.onrender.com" */
function siteUrl(value) {
  const v = value.trim().replace(/\/$/, '');
  if (!v) return '';
  return /^https?:\/\//.test(v) ? v : `https://${v}`;
}

const allowedOrigins = new Set(
  [SITE_URL, ...(env.EXTRA_ORIGINS || 'http://localhost:5173,http://localhost:4173').split(',')]
    .map((o) => o.trim())
    .filter(Boolean),
);

// ---------- Limits, so strangers can't use up the free quotas ----------
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 10 * 60 * 1000).unref();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------- Gemini (OpenAI-compatible endpoint, same as the Java policy-assistant-service) ----------
class AiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiChat(messages, { temperature = 0.2 } = {}) {
  const models = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter((m, i, all) => m && all.indexOf(m) === i);
  let last;
  for (const model of models) {
    let reasoning = GEMINI_REASONING || null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const body = { model, messages, temperature };
      if (reasoning) body.reasoning_effort = reasoning;
      let res;
      try {
        res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_API_KEY}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
      } catch (e) {
        last = new AiError(504, `AI request failed: ${e.message}`);
        break; // timeout or network: try the backup model
      }
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (!text) throw new AiError(502, 'The AI returned an empty answer');
        return { text: String(text).trim(), model };
      }
      const detail = (await res.text()).slice(0, 300);
      last = new AiError(res.status, `${model} → ${res.status}: ${detail}`);
      if (res.status === 400 && reasoning && /reasoning/i.test(detail)) {
        reasoning = null; // this model doesn't take reasoning_effort: retry without it
        continue;
      }
      if ([500, 502, 503, 504].includes(res.status) && attempt < 3) {
        await sleep(attempt === 1 ? 1500 : 4000); // busy ("high demand"): wait and retry
        continue;
      }
      break; // 429 (quota) or other: try the backup model
    }
    console.warn(`[ai] ${last?.message}`);
  }
  throw last ?? new AiError(502, 'AI unavailable');
}

const SYSTEM_PROMPT = `You are the ClaimFlow Policy Assistant. You act on behalf of the policy holder and explain their
health insurance policy in plain, friendly English.
Rules:
1. Use ONLY the numbered policy excerpts you are given. Never invent amounts, limits or rules.
2. Cite the excerpts you used, like [1] or [2][3], right after the sentence they support.
3. If the excerpts don't answer the question, say so clearly and suggest what to ask the insurer.
4. Always mention waiting periods, sub-limits, co-payments and exclusions that apply.
5. Keep the answer under 180 words. Use short paragraphs or "- " bullets. No medical or legal advice.`;

function excerptsBlock(documentTitle, sources) {
  const lines = sources
    .slice(0, 8)
    .map((s, i) => `[${s.number ?? i + 1}] (page ${Number(s.page) || 1}) ${String(s.excerpt ?? '').slice(0, 1200)}`);
  return `Policy: ${String(documentTitle || 'Health policy').slice(0, 120)}\n\nPolicy excerpts:\n${lines.join('\n\n')}`;
}

function cleanSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s) => s && typeof s.excerpt === 'string' && s.excerpt.trim()).slice(0, 8);
}

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// ---------- Email (Brevo HTTPS API; the HTML is the same design as the Java EmailSender) ----------
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function emailContent({ status, claimId, amount, reason, hospital }) {
  const claim = `claim #${claimId}`;
  const money = `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
  const why = String(reason || '').slice(0, 160);
  switch (status) {
    case 'APPROVED':
      return {
        subject: `Claim #${claimId} approved · ClaimFlow`,
        headline: 'Claim approved',
        message: `Good news! Your ${claim} of ${money}${hospital ? ` at ${hospital}` : ''} is approved. We're paying the hospital now.`,
        color: '#146C43',
      };
    case 'REJECTED':
      return {
        subject: `Claim #${claimId} was not approved · ClaimFlow`,
        headline: 'Claim not approved',
        message: `Your ${claim} of ${money} was not approved. Reason: ${why || 'see the app for details'}.`,
        color: '#A1262B',
      };
    case 'PAID':
      return {
        subject: `Claim #${claimId} paid to the hospital · ClaimFlow`,
        headline: 'Hospital paid',
        message: `${money} for ${claim} has been paid${hospital ? ` to ${hospital}` : ' to the hospital'}. Nothing more to do.`,
        color: '#146C43',
      };
    default:
      return null;
  }
}

function emailHtml(name, c) {
  const greeting = `Hi ${name ? String(name).split(' ')[0] : 'there'},`;
  const link = SITE_URL || 'https://claimflow-demo.onrender.com';
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#F6F7FB;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E4E6F0;border-radius:16px;padding:28px">
    <p style="margin:0 0 18px;font-size:20px;font-weight:800;color:#4F46E5">ClaimFlow</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1B1D2A">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 14px;font-size:22px;font-weight:800;color:${c.color}">${escapeHtml(c.headline)}</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#1B1D2A">${escapeHtml(c.message)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Track your claim</a>
    <p style="margin:24px 0 0;font-size:12px;color:#5C6078">This is an automated message from the ClaimFlow demo project. If you didn't expect it, you can ignore it.</p>
  </div>
</div>`;
}

async function sendEmail(to, name, content) {
  const res = await fetch(`${BREVO_BASE_URL}/v3/smtp/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: MAIL_FROM_NAME, email: MAIL_FROM },
      to: [{ email: to }],
      subject: content.subject,
      htmlContent: emailHtml(name, content),
      textContent: `${content.message}\n\nTrack your claim: ${SITE_URL}\n\nClaimFlow`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---------- Routes ----------
const routes = {
  'GET /health': async () => ({ ok: true, ai: aiEnabled, email: emailEnabled, model: aiEnabled ? GEMINI_MODEL : null }),

  'POST /ask': async (body, ip) => {
    requireAi(ip);
    const question = String(body.question || '').trim().slice(0, 1000);
    const sources = cleanSources(body.sources);
    if (!question) throw new HttpError(400, 'Type a question first.');
    if (!sources.length) throw new HttpError(400, 'No policy clauses were sent with the question.');
    const { text, model } = await geminiChat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${excerptsBlock(body.documentTitle, sources)}\n\nQuestion: ${question}` },
    ]);
    return { answer: text, model };
  },

  'POST /precheck': async (body, ip) => {
    requireAi(ip);
    const sources = cleanSources(body.sources);
    if (!sources.length) throw new HttpError(400, 'No policy clauses were sent.');
    const treatment = `${String(body.diagnosisLabel || body.diagnosisCode || 'a treatment').slice(0, 80)}${
      body.diagnosisCode ? ` (ICD-10 ${String(body.diagnosisCode).slice(0, 10)})` : ''
    }`;
    const hospital = String(body.hospitalName || 'a hospital').slice(0, 100);
    const network =
      body.inNetwork === false ? ' This hospital is OUTSIDE the ClaimFlow network.' : body.inNetwork === true ? ' This hospital is a Network Hospital.' : '';
    const question = `I am about to submit a claim for treatment of ${treatment} at ${hospital}, bill amount ${rupees(body.amount)}.${network}
Based on my policy, is this likely to be covered? Start your answer with exactly one of:
LIKELY COVERED, PARTLY COVERED, NOT COVERED or NOT STATED IN POLICY.
Then explain the clauses that matter: network hospital, waiting periods, exclusions, sub-limits, room rent and co-payment.`;
    const { text, model } = await geminiChat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${excerptsBlock(body.documentTitle, sources)}\n\nQuestion: ${question}` },
    ]);
    return { answer: text, model };
  },

  'POST /extract-profile': async (body, ip) => {
    requireAi(ip);
    const instructions = `Find the policy holder's (insured person's) details in this health insurance policy.
Answer with exactly these 5 lines and nothing else. Write UNKNOWN when a value isn't shown.
NAME: <full name of the insured person / policy holder>
EMAIL: <email address>
PHONE: <mobile number>
POLICY_NUMBER: <policy number>
SUM_INSURED: <sum insured / coverage amount in rupees, digits only, e.g. 500000>`;
    const system = 'You read Indian health insurance documents and copy out details exactly as written. Never guess.';
    let content;
    if (body.image?.base64) {
      const mime = /^image\/(jpeg|png|webp)$/.test(body.image.mimeType) ? body.image.mimeType : 'image/jpeg';
      if (body.image.base64.length > 6_000_000) throw new HttpError(413, 'The photo is too large.');
      content = [
        { type: 'text', text: instructions },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${body.image.base64}` } },
      ];
    } else if (typeof body.text === 'string' && body.text.trim()) {
      content = `${instructions}\n\nDOCUMENT:\n${body.text.slice(0, 12_000)}`;
    } else {
      throw new HttpError(400, 'Send a photo or the document text.');
    }
    const { text } = await geminiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      { temperature: 0 },
    );
    return parseProfile(text);
  },

  'POST /email': async (body, ip) => {
    if (!emailEnabled) throw new HttpError(503, 'Email is not set up on the server.');
    const recipients = [...new Set((Array.isArray(body.to) ? body.to : [body.to]).map((e) => String(e || '').trim().toLowerCase()))]
      .filter((e) => EMAIL_PATTERN.test(e) && !e.endsWith('@example.com'))
      .slice(0, 2);
    const content = emailContent(body);
    if (!content) throw new HttpError(400, 'Unknown claim status.');
    if (!recipients.length) return { sent: [] };
    if (!allow(`email:${ip}`, EMAILS_PER_HOUR, HOUR)) throw new HttpError(429, 'Too many emails from this browser. Try again later.');
    const sent = [];
    for (const to of recipients) {
      if (!allow('email:all', EMAILS_PER_DAY, DAY)) throw new HttpError(429, 'The demo has reached its daily email limit.');
      await sendEmail(to, body.patientName, content);
      sent.push(to);
    }
    console.log(`[email] claim #${body.claimId} ${body.status} → ${sent.length} recipient(s)`);
    return { sent };
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireAi(ip) {
  if (!aiEnabled) throw new HttpError(503, 'AI is not set up on the server.');
  if (!allow(`ai:${ip}`, AI_PER_HOUR, HOUR)) throw new HttpError(429, 'You have asked a lot of questions. Try again in a while.');
  if (!allow('ai:all', AI_PER_DAY, DAY)) throw new HttpError(429, 'The demo has reached its daily AI limit.');
}

/** Reads the "KEY: value" lines the model was asked to write (same idea as the Java ProfileExtractor). */
export function parseProfile(reply) {
  const values = {};
  for (const raw of String(reply).split(/\r?\n/)) {
    const m = raw.trim().match(/^[\s*-]*([A-Z_ ]{4,20})[\s*]*:\s*(.+)$/);
    if (!m) continue;
    const value = m[2].replace(/\*\*/g, '').replace(/"/g, '').trim();
    if (!value || /^(unknown|n\/?a|null|none|-+)$/i.test(value)) continue;
    values[m[1].trim().replace(/ /g, '_')] = value;
  }
  const amount = (() => {
    const v = values.SUM_INSURED;
    if (!v) return null;
    const lower = v.toLowerCase();
    const num = lower.match(/\d[\d,]*(?:\.\d+)?/);
    if (!num) return null;
    let n = Number(num[0].replace(/,/g, ''));
    if (lower.includes('crore')) n *= 1e7;
    else if (lower.includes('lakh') || lower.includes('lac')) n *= 1e5;
    return n > 0 ? Math.round(n) : null;
  })();
  const title = (s) => s.toLowerCase().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return {
    name: values.NAME ? title(values.NAME) : null,
    email: values.EMAIL ? values.EMAIL.toLowerCase() : null,
    phone: values.PHONE ?? null,
    policyNumber: values.POLICY_NUMBER ? values.POLICY_NUMBER.toUpperCase() : null,
    coverageLimit: amount,
    method: 'ai',
    note: 'Read from your policy with AI (Gemini). Please check every field.',
  };
}

// ---------- HTTP plumbing ----------
function send(res, status, data, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  res.writeHead(status, headers);
  res.end(data === null ? '' : JSON.stringify(data));
}

function readBody(req, limit = 7_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const path = (req.url || '/').split('?')[0];
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (req.method === 'OPTIONS') return send(res, allowedOrigins.has(origin) ? 204 : 403, null, origin);

  const handler = routes[`${req.method} ${path}`];
  if (!handler) return send(res, 404, { message: 'Not found' }, origin);

  // Browsers always send Origin on cross-site POSTs: only the ClaimFlow site may use the API
  if (req.method === 'POST' && !allowedOrigins.has(origin)) return send(res, 403, { message: 'This API only serves the ClaimFlow site.' }, origin);

  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await handler(body, ip), origin);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof AiError ? (e.status === 429 ? 429 : 502) : 500;
    if (!(e instanceof HttpError)) console.error(`[${path}]`, e.message);
    const message =
      e instanceof HttpError
        ? e.message
        : e instanceof AiError
          ? e.status === 429
            ? "The AI's free limit is used up for now. Try again later."
            : 'The AI is busy right now. Try again in a minute.'
          : 'Something went wrong.';
    send(res, status, { message }, origin);
  }
});

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(PORT, () => {
    console.log(`ClaimFlow API on :${PORT} · AI ${aiEnabled ? `on (${GEMINI_MODEL})` : 'OFF (set GEMINI_API_KEY)'} · email ${
      emailEnabled ? `on (from ${MAIL_FROM})` : 'OFF (set BREVO_API_KEY and MAIL_FROM)'
    } · site ${SITE_URL || '(ALLOWED_ORIGIN not set)'}`);
  });
}
