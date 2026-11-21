import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSession } from '../../session.jsx';
import { EMAIL_PATTERN, firstName, formatINR } from '../../format.js';
import { toast } from '../../toast.jsx';
import FilePicker from '../../components/FilePicker.jsx';
import GoogleButton from '../../components/GoogleButton.jsx';
import AuthLayout, { Field, PasswordField } from './AuthLayout.jsx';

const EMPTY = { name: '', email: '', alternateEmail: '', phone: '', policyNumber: '', coverageLimit: '', password: '' };

const MODES = [
  { id: 'new', label: 'New policy' },
  { id: 'existing', label: 'I have a policy' },
  { id: 'upload', label: 'Upload my policy' },
];

/**
 * Policyholders sign up here, three ways:
 *  - new policy: a ₹5,00,000 policy starting today
 *  - I have a policy: link it by policy number (the email must match the policy)
 *  - upload my policy: the AI reads name, email, phone, policy number and cover from the PDF or photo;
 *    the person checks them, and the policy is created (or linked if it's already on file)
 */
export default function Register() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [extracted, setExtracted] = useState(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((err) => ({ ...err, [key]: undefined, form: undefined }));
  };

  const switchMode = (id) => {
    setMode(id);
    setErrors({});
  };

  const readPolicy = async () => {
    if (!file) {
      setErrors({ file: 'Choose your policy PDF or a clear photo of it.' });
      return;
    }
    setReading(true);
    setErrors({});
    try {
      const profile = await api.extractProfile(file);
      setExtracted(profile);
      setForm((f) => ({
        ...f,
        name: profile.name ?? f.name,
        email: profile.email ?? f.email,
        phone: profile.phone ?? f.phone,
        policyNumber: profile.policyNumber ?? '',
        coverageLimit: profile.coverageLimit ? String(profile.coverageLimit) : '',
      }));
      const found = ['name', 'email', 'policyNumber', 'coverageLimit'].filter((k) => profile[k]).length;
      toast({
        type: found >= 3 ? 'success' : 'warning',
        title: found >= 3 ? 'Policy read' : 'Some details were missing',
        message: found >= 3 ? 'Check the details below and fix anything that looks wrong.' : 'Please fill in the empty fields yourself.',
      });
    } catch {
      // the pop-up from api.js explains what went wrong
    } finally {
      setReading(false);
    }
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email. Claim updates are sent here.';
    if (form.alternateEmail.trim() && !EMAIL_PATTERN.test(form.alternateEmail.trim())) next.alternateEmail = 'Enter a valid email, or leave it empty.';
    if (form.alternateEmail.trim() && form.alternateEmail.trim().toLowerCase() === form.email.trim().toLowerCase()) next.alternateEmail = 'Use a different email from your main one.';
    if (form.phone.trim() && !/^[0-9+\- ]{6,20}$/.test(form.phone.trim())) next.phone = 'Enter a valid mobile number.';
    if (mode !== 'new' && !form.policyNumber.trim()) next.policyNumber = 'Enter your policy number.';
    if (mode === 'upload' && !(Number(String(form.coverageLimit).replace(/,/g, '')) > 0)) next.coverageLimit = 'Enter the sum insured in rupees.';
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
        policyNumber: mode === 'new' ? null : form.policyNumber.trim().toUpperCase(),
        fromPolicyDocument: mode === 'upload',
        coverageLimit: mode === 'upload' ? Number(String(form.coverageLimit).replace(/,/g, '')) : null,
        password: form.password,
      });
      signIn(result);
      // The uploaded policy also goes to the Policy Assistant, linked to this policy number
      if (mode === 'upload' && file && /\.(pdf|txt)$/i.test(file.name)) {
        try {
          await api.uploadPolicy(file, `${result.user.name}'s policy`, form.policyNumber.trim().toUpperCase());
        } catch {
          toast({ type: 'warning', title: 'Account created', message: "Your policy couldn't be added to the assistant. Upload it there later." });
        }
      }
      toast({ type: 'success', title: `Welcome, ${firstName(result.user.name)}`, message: 'Your account is ready.' });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setSaving(false);
    }
  };

  const index = MODES.findIndex((m) => m.id === mode);
  const showForm = mode !== 'upload' || extracted;

  return (
    <AuthLayout
      title="Create your account"
      lead="For policyholders. Hospitals and insurer staff get their accounts from an admin."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <div className="segmented segmented-modes" role="radiogroup" aria-label="How do you want to sign up?">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => switchMode(m.id)}>
            {m.label}
          </button>
        ))}
        <span className="segmented-thumb" style={{ width: `calc(${100 / 3}% - 2.67px)`, transform: `translateX(${index * 100}%)` }} aria-hidden="true" />
      </div>

      {errors.form && <div className="banner banner-error" role="alert"><p>{errors.form}</p></div>}

      {mode === 'upload' && !extracted && (
        <div className="stack-md pop-card">
          <p className="small muted">Upload your policy PDF or a clear photo of it. We'll read your name, email, policy number and cover for you to check.</p>
          <FilePicker
            file={file}
            accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            label="Choose your policy PDF or photo"
            hint="PDF, JPG or PNG · drag it here or browse"
            invalid={Boolean(errors.file)}
            onChange={(f) => {
              setFile(f);
              setErrors({});
            }}
          />
          {errors.file && <p className="field-error">{errors.file}</p>}
          <button type="button" className="btn btn-primary btn-pill" onClick={readPolicy} disabled={reading}>
            {reading ? 'Reading your policy…' : 'Read my policy'}
          </button>
          <p className="small muted">
            No policy handy? <a href="/sample-policy-schedule.pdf" download>Download a sample policy PDF</a>.
          </p>
        </div>
      )}

      {showForm && (
        <form className="stack-md" onSubmit={submit} noValidate>
          {mode === 'upload' && extracted?.note && <p className="answer-note">{extracted.note}</p>}
          <Field id="r-name" label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name}
            hint={mode === 'new' ? undefined : 'As written on your policy. It can’t be changed later.'} />
          <Field id="r-email" label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email}
            hint={mode === 'existing' ? 'Use the email that’s on your policy.' : undefined} />
          {mode !== 'new' && (
            <div className={mode === 'upload' ? 'field-row' : undefined}>
              <Field id="r-policy" label="Policy number" placeholder="e.g. POL1004" value={form.policyNumber} onChange={set('policyNumber')} error={errors.policyNumber} />
              {mode === 'upload' && (
                <Field id="r-cover" label="Sum insured (₹)" inputMode="numeric" value={form.coverageLimit} onChange={set('coverageLimit')} error={errors.coverageLimit}
                  hint={Number(form.coverageLimit) > 0 ? formatINR(form.coverageLimit) : undefined} />
              )}
            </div>
          )}
          {mode === 'new' && <p className="small muted">You'll get a new policy with ₹5,00,000 cover, starting today.</p>}
          <Field id="r-alt" label="Alternate email (optional)" type="email" value={form.alternateEmail} onChange={set('alternateEmail')}
            error={errors.alternateEmail} hint="Gets a copy of every claim update, e.g. a family member." />
          <Field id="r-phone" label="Mobile (optional)" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
          <PasswordField id="r-password" label="Password" autoComplete="new-password" value={form.password} onChange={set('password')}
            error={errors.password} hint="At least 8 characters." />
          <div className="row-between">
            {mode === 'upload' ? (
              <button type="button" className="link-button" onClick={() => { setExtracted(null); setFile(null); }}>Use a different file</button>
            ) : <span />}
            <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>
              {saving ? 'Creating your account…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <GoogleButton onSignedIn={() => navigate('/', { replace: true })} onError={(message) => setErrors({ form: message })} />
    </AuthLayout>
  );
}
