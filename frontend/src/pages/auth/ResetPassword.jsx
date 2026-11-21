import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useSession } from '../../session.jsx';
import { toast } from '../../toast.jsx';
import AuthLayout, { PasswordField } from './AuthLayout.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (!token || !email) {
    return (
      <AuthLayout title="This link isn't complete" lead="Open the link from your email again, or ask for a new one."
        footer={<Link to="/forgot-password">Send a new link</Link>} />
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'The two passwords don’t match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const result = await api.resetPassword(email, token, password);
      signIn(result);
      toast({ type: 'success', title: 'Password changed', message: 'You’re signed in with your new password.' });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" lead={`For ${email}`} footer={<Link to="/login">← Back to sign in</Link>}>
      {errors.form && (
        <div className="banner banner-error" role="alert">
          <p>{errors.form}</p>
          <Link to="/forgot-password" className="btn btn-secondary">Get a new link</Link>
        </div>
      )}
      <form className="stack-md" onSubmit={submit} noValidate>
        <PasswordField id="n-password" label="New password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters." />
        <PasswordField id="n-confirm" label="Type it again" autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <button type="submit" className="btn btn-primary btn-pill" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthLayout>
  );
}
