/**
 * Talks to the ClaimFlow API (the small Node.js server in /api) from the demo site.
 * The server holds the Gemini and Brevo keys, so they never reach the browser.
 * Render's free plan puts it to sleep after 15 idle minutes; the site wakes it on the first visit
 * and uses prepared answers until it is awake.
 */
const HOST = (import.meta.env.VITE_API_HOST || import.meta.env.VITE_API_URL || '').trim();
// Render passes just the service name ("claimflow-api-x"), so add the domain when it's missing
const withDomain = (h) => (h.includes('.') ? h : `${h}.onrender.com`);
export const API_URL = HOST ? (/^https?:\/\//.test(HOST) ? HOST : `https://${withDomain(HOST)}`).replace(/\/$/, '') : '';

let health = null; // { ok, ai, email, model } once the server has answered
let waking = null;

/** Starts waking the server (once). Resolves with its health, or null if it can't be reached. */
export function wakeApi() {
  if (!API_URL) return Promise.resolve(null);
  if (!waking) {
    waking = fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(120_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        health = h;
        return h;
      })
      .catch(() => {
        waking = null; // try again next time
        return null;
      });
  }
  return waking;
}

/** What we know right now, without waiting: null = not awake yet (or no API). */
export const apiHealth = () => health;

/**
 * POSTs to the API. Waits longer when the server is known to be awake.
 * Returns { ok: true, data } or { ok: false, reason: 'off' | 'waking' | 'error', message }.
 */
export async function callApi(path, body, { awakeTimeout = 45_000, coldTimeout = 12_000 } = {}) {
  if (!API_URL) return { ok: false, reason: 'off' };
  wakeApi();
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(health ? awakeTimeout : coldTimeout),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    return { ok: false, reason: 'error', status: res.status, message: data.message };
  } catch {
    return { ok: false, reason: health ? 'error' : 'waking' };
  }
}

/** Shrinks a phone photo to at most 1600 px (JPEG) so it uploads quickly. Returns base64 without the data: prefix. */
export async function imageToBase64(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
