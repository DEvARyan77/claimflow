import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { EMAIL_PATTERN } from '../../format.js';
import AuthLayout, { Field } from './AuthLayout.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch {
      // pop-up already shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Forgot your password?" lead={sent ? null : 'Enter your email or your alternate email. We’ll send you a link to choose a new password.'}
      footer={<Link to="/login">← Back to sign in</Link>}>
      {sent ? (
        <div className="success-panel">
          <span className="success-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></span>
          <p className="strong">Check your inbox</p>
          <p className="muted">If an account uses <strong>{email.trim()}</strong>, a reset link is on its way. It works once and expires in 30 minutes.</p>
        </div>
      ) : (
        <form className="stack-md" onSubmit={submit} noValidate>
          <Field id="f-email" label="Email" type="email" autoComplete="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }} error={error} />
          <button type="submit" className="btn btn-primary btn-pill" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthLayout>
  );
}
