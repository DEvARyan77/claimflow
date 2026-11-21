import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSession } from '../../session.jsx';
import { EMAIL_PATTERN, firstName } from '../../format.js';
import { toast } from '../../toast.jsx';
import { IS_DEMO, resetDemoData } from '../../demo/isDemo.js';
import AuthLayout, { Field, PasswordField } from './AuthLayout.jsx';

/** Demo accounts (seeded by auth-service and by the browser demo). Password for all: password123 */
const DEMO_ACCOUNTS = [
  { role: 'Policyholder', emoji: '🙋', email: 'rahul@claimflow.dev', who: 'Rahul Sharma' },
  { role: 'New policy', emoji: '🆕', email: 'priya@claimflow.dev', who: 'Priya Nair' },
  { role: 'Hospital', emoji: '🏥', email: 'apollo@claimflow.dev', who: 'Apollo Hospital' },
  { role: 'Claims officer', emoji: '🕵️', email: 'officer@claimflow.dev', who: 'Neha Kapoor' },
  { role: 'Admin', emoji: '🛠️', email: 'admin@claimflow.dev', who: 'Admin' },
];
const DEMO_PASSWORD = 'password123';

export default function Login() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);

  const go = async (mail, pass, key) => {
    setBusy(key);
    setErrors({});
    try {
      const result = await api.login(mail.trim(), pass);
      signIn(result);
      toast({ type: 'success', title: `Welcome back, ${firstName(result.user.name)}!` });
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (e) {
      setErrors({ form: e.status === 401 || e.status === 400 ? 'That email and password don’t match.' : e.message });
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter your email.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length === 0) go(email, password, 'form');
  };

  return (
    <AuthLayout
      title="Sign in"
      lead="Track your claims, or review them if you work at a hospital or the insurer."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      {errors.form && <div className="banner banner-error" role="alert"><p>{errors.form}</p></div>}
      <form className="stack-md" onSubmit={submit} noValidate>
        <Field id="email" label="Email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordField id="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="row-between">
          <Link to="/forgot-password" className="small">Forgot password?</Link>
          <button type="submit" className="btn btn-primary btn-pill" disabled={busy !== null}>
            {busy === 'form' ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>

      <div className="demo-accounts">
        <p className="card-title">Try a demo account</p>
        <div className="demo-account-grid">
          {DEMO_ACCOUNTS.map((a, i) => (
            <button key={a.email} type="button" className="demo-account" style={{ '--i': i }}
              disabled={busy !== null} onClick={() => go(a.email, DEMO_PASSWORD, a.email)}>
              <span className="demo-account-emoji" aria-hidden="true">{a.emoji}</span>
              <span>
                <strong>{busy === a.email ? 'Signing in…' : a.role}</strong>
                <span className="small muted">{a.who}</span>
              </span>
            </button>
          ))}
        </div>
        {IS_DEMO && (
          <button type="button" className="link-button small" onClick={resetDemoData}>Reset demo data</button>
        )}
      </div>
    </AuthLayout>
  );
}
