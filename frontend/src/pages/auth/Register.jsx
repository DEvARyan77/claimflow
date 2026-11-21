import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSession } from '../../session.jsx';
import { EMAIL_PATTERN, firstName } from '../../format.js';
import { toast } from '../../toast.jsx';
import AuthLayout, { Field, PasswordField } from './AuthLayout.jsx';

const EMPTY = { name: '', email: '', alternateEmail: '', phone: '', policyNumber: '', password: '' };

/** Policyholders sign up here: link an existing policy by number, or get a new ₹5,00,000 policy. */
export default function Register() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [hasPolicy, setHasPolicy] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((err) => ({ ...err, [key]: undefined, form: undefined }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email. Claim updates are sent here.';
    if (form.alternateEmail.trim() && !EMAIL_PATTERN.test(form.alternateEmail.trim())) next.alternateEmail = 'Enter a valid email, or leave it empty.';
    if (form.alternateEmail.trim() && form.alternateEmail.trim().toLowerCase() === form.email.trim().toLowerCase()) next.alternateEmail = 'Use a different email from your main one.';
    if (form.phone.trim() && !/^[0-9+\- ]{6,20}$/.test(form.phone.trim())) next.phone = 'Enter a valid mobile number.';
    if (hasPolicy && !form.policyNumber.trim()) next.policyNumber = 'Enter your policy number.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await api.register({
        name: form.name.trim(),
        email: form.email.trim(),
        alternateEmail: form.alternateEmail.trim() || null,
        phone: form.phone.trim() || null,
        policyNumber: hasPolicy ? form.policyNumber.trim().toUpperCase() : null,
        password: form.password,
      });
      signIn(result);
      toast({ type: 'success', title: `Welcome, ${firstName(result.user.name)}! 🎉`, message: 'Your account is ready.' });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setSaving(false);
    }
  };

  return (
    <AuthLayout title="Create your account" lead="For policyholders. Hospitals and insurer staff get their accounts from an admin."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      {errors.form && <div className="banner banner-error" role="alert"><p>{errors.form}</p></div>}
      <form className="stack-md" onSubmit={submit} noValidate>
        <Field id="r-name" label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Field id="r-email" label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Field id="r-alt" label="Alternate email (optional)" type="email" value={form.alternateEmail} onChange={set('alternateEmail')}
          error={errors.alternateEmail} hint="Gets a copy of every claim update, e.g. a family member." />
        <Field id="r-phone" label="Mobile (optional)" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />

        <div className="segmented" role="radiogroup" aria-label="Your policy">
          <button type="button" role="radio" aria-checked={!hasPolicy} onClick={() => setHasPolicy(false)}>New policy</button>
          <button type="button" role="radio" aria-checked={hasPolicy} onClick={() => setHasPolicy(true)}>I have a policy</button>
          <span className="segmented-thumb" data-right={hasPolicy || undefined} aria-hidden="true" />
        </div>
        {hasPolicy ? (
          <Field id="r-policy" label="Policy number" placeholder="e.g. POL1004" value={form.policyNumber} onChange={set('policyNumber')}
            error={errors.policyNumber} hint="Use the email that's on your policy." />
        ) : (
          <p className="small muted">You'll get a new policy with ₹5,00,000 cover, starting today.</p>
        )}

        <PasswordField id="r-password" label="Password" autoComplete="new-password" value={form.password} onChange={set('password')}
          error={errors.password} hint="At least 8 characters." />
        <button type="submit" className="btn btn-primary btn-large btn-pill" disabled={saving}>
          {saving ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
