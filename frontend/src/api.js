import { toast } from './toast.jsx';
import { IS_DEMO } from './demo/isDemo.js';

// Every request goes to /api/... which is forwarded to the API Gateway (vite.config.js / nginx.conf).
const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const OFFLINE_MESSAGE =
  "We can't reach the ClaimFlow services right now. If you just started them, give them a minute and try again.";

/**
 * options.quiet = true: don't show a red pop-up on failure (used for background refreshes,
 * so a short outage doesn't flood the screen; the page still gets the error).
 */
async function request(path, options = {}) {
  const { quiet, ...fetchOptions } = options;
  // JSON bodies need a Content-Type; file uploads (FormData) must let the browser set it
  const headers = { Accept: 'application/json' };
  if (typeof fetchOptions.body === 'string') headers['Content-Type'] = 'application/json';

  const fail = (message, status) => {
    if (!quiet) {
      toast({
        type: 'error',
        title: status === 0 || status >= 500 ? "Couldn't reach ClaimFlow" : 'Something went wrong',
        message,
      });
    }
    return new ApiError(message, status);
  };

  // Free demo site: the "backend" runs in the browser (src/demo/demoServer.js)
  if (IS_DEMO) {
    const { demoRequest } = await import('./demo/demoServer.js');
    try {
      return await demoRequest(path, fetchOptions);
    } catch (e) {
      throw fail(e.message, e.status ?? 500);
    }
  }

  let response;
  try {
    response = await fetch(BASE + path, { ...fetchOptions, headers });
  } catch {
    throw fail(OFFLINE_MESSAGE, 0);
  }

  if (!response.ok) {
    if ([502, 503, 504].includes(response.status)) throw fail(OFFLINE_MESSAGE, response.status);
    let message = `Something went wrong (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // body wasn't JSON; keep the generic message
    }
    throw fail(message, response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}

const post = (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body), ...opts });

export const api = {
  patients: () => request('/patients'),
  patient: (id, opts) => request(`/patients/${id}`, opts),
  createPatient: (patient) => post('/patients', patient),
  providers: (opts) => request('/providers', opts),
  claimsForPatient: (patientId, opts) => request(`/claims/patient/${patientId}`, opts),
  submitClaim: (claim) => post('/claims', claim),
  notificationsForPatient: (patientId, opts) => request(`/notifications/patient/${patientId}`, opts),
  paymentsForPatient: (patientId, opts) => request(`/payments/patient/${patientId}`, opts),

  // Policy Assistant (RAG)
  assistantStatus: () => request('/policies/assistant/status', { quiet: true }),
  policyDocuments: (opts) => request('/policies', opts),
  uploadPolicy: (file, title, policyNumber) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (policyNumber) form.append('policyNumber', policyNumber);
    return request('/policies', { method: 'POST', body: form });
  },
  extractProfile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/policies/extract-profile', { method: 'POST', body: form });
  },
  deletePolicy: (id) => request(`/policies/${id}`, { method: 'DELETE' }),
  askPolicy: (question, documentId) => post('/policies/ask', { question, documentId }),
  precheckClaim: (body) => post('/policies/precheck', body),
};
