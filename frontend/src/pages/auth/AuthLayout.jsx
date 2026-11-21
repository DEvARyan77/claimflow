import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../../components/Icons.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';

/** Shared frame for sign-in, register and password pages: a story panel and the form card. */
export default function AuthLayout({ title, lead, children, footer }) {
  return (
    <main className="auth">
      <ThemeToggle className="welcome-theme" />
      <div className="auth-grid">
        <section className="auth-story" aria-hidden="true">
          <Link to="/login" className="brand brand-large brand-on-dark" tabIndex={-1}>
            <LogoMark size={40} />
            <span>ClaimFlow</span>
          </Link>
          <h2>Health claims, decided in seconds.</h2>
          <ul className="auth-points">
            <li><span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> Clean claims approved automatically</li>
            <li><span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> Cashless claims straight from the hospital</li>
            <li><span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> Unusual claims checked by an officer with AI help</li>
            <li><span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> Every update by email, with a copy to your alternate email</li>
          </ul>
          <div className="auth-bubbles"><i /><i /><i /></div>
        </section>
        <section className="card auth-card">
          <Link to="/login" className="brand auth-brand-small" aria-label="ClaimFlow">
            <LogoMark size={32} />
            <span>ClaimFlow</span>
          </Link>
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </section>
      </div>
    </main>
  );
}

export function Field({ id, label, error, hint, children, ...input }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ?? <input id={id} className="text-input" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...input} />}
      {hint && !error && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, error, hint, autoComplete = 'current-password' }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <PasswordInput id={id} value={value} onChange={onChange} invalid={Boolean(error)} autoComplete={autoComplete}
        describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined} />
    </Field>
  );
}


function PasswordInput({ id, value, onChange, invalid, autoComplete, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input id={id} className="text-input" type={shown ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} aria-invalid={invalid} aria-describedby={describedBy} />
      <button type="button" className="password-toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
