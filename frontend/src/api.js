import { toast } from './toast.jsx';
import { IS_DEMO } from './demo/isDemo.js';
import { currentToken, signOutEverywhere } from './session.jsx';

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
  const token = currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;

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
      return await demoRequest(path, { ...fetchOptions, token });
    } catch (e) {
      if (e.status === 401 && token) signOutEverywhere();
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
    // the login expired or the account was switched off: back to the sign-in page
    if (response.status === 401 && token) {
      signOutEverywhere();
      throw fail('Your session has ended. Please sign in again.', 401);
    }
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
const patch = (path, body, opts) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...opts });

export const api = {
  // Accounts (auth-service)
  login: (email, password) => post('/auth/login', { email, password }, { quiet: true }),
  register: (form) => post('/auth/register', form, { quiet: true }),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (email, token, password) => post('/auth/reset-password', { email, token, password }, { quiet: true }),
  me: (opts) => request('/auth/me', opts),
  updateMe: (changes) => patch('/auth/me', changes),
  changePassword: (currentPassword, newPassword) => post('/auth/me/password', { currentPassword, newPassword }, { quiet: true }),
  users: (opts) => request('/auth/users', opts),
  createStaff: (form) => post('/auth/users', form, { quiet: true }),
  setUserActive: (id, active) => patch(`/auth/users/${id}/active`, { active }),

  // Policies and policyholders
  patients: (opts) => request('/patients', opts),
  patient: (id, opts) => request(`/patients/${id}`, opts),
  patientByPolicy: (policyNumber, opts) => request(`/patients/by-policy/${encodeURIComponent(policyNumber)}`, opts),
  createPatient: (patient) => post('/patients', patient),
  updatePatientProfile: (id, profile) => patch(`/patients/${id}/profile`, profile),

  // Hospitals
  providers: (opts) => request('/providers', opts),
  createProvider: (provider) => post('/providers', provider),

  // Claims
  allClaims: (opts) => request('/claims', opts),
  claim: (id, opts) => request(`/claims/${id}`, opts),
  claimsForPatient: (patientId, opts) => request(`/claims/patient/${patientId}`, opts),
  claimsForProvider: (providerId, opts) => request(`/claims/provider/${providerId}`, opts),
  reviewQueue: (opts) => request('/claims/review-queue', opts),
  claimStats: (opts) => request('/claims/stats', opts),
  submitClaim: (claim) => post('/claims', claim),
  reviewClaim: (id, action, note) => post(`/claims/${id}/review`, { action, note }),
  replyToClaim: (id, note) => post(`/claims/${id}/info`, { note }),

  // Payments and messages
  notificationsForPatient: (patientId, opts) => request(`/notifications/patient/${patientId}`, opts),
  paymentsForPatient: (patientId, opts) => request(`/payments/patient/${patientId}`, opts),
  paymentsForProvider: (providerId, opts) => request(`/payments/provider/${providerId}`, opts),
  allPayments: (opts) => request('/payments', opts),

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
