import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { EMAIL_PATTERN, formatINR, initials, ROLE_NAMES } from '../format.js';
import DatePicker, { addDays, formatDate, todayIso } from '../components/DatePicker.jsx';
import { PasswordField } from './auth/AuthLayout.jsx';
import { toast } from '../toast.jsx';

/** Everyone: name, alternate email, password. Policyholders also: phone, address, date of birth, gender. */
export default function Profile() {
  const { user, patient, refreshPatient } = useOutletContext();
  const { updateUser } = useSession();

  return (
    <div className="stack-lg">
      <div className="profile-head">
        <span className="avatar avatar-xl" aria-hidden="true">{initials(user.name)}</span>
        <div>
          <h1>{user.name}</h1>
          <p className="lead">{ROLE_NAMES[user.role]} · {user.email}</p>
        </div>
      </div>
      <div className="profile-grid">
        <AccountCard user={user} onSaved={updateUser} />
        {patient && <PersonalCard patient={patient} onSaved={() => refreshPatient(true)} />}
        <PasswordCard />
        {patient && (
          <section className="card">
            <h2 className="card-title">Your policy</h2>
            <dl className="facts">
              <dt>Policy</dt><dd>{patient.policyNumber}</dd>
              <dt>Started</dt><dd>{patient.policyStartDate ? formatDate(patient.policyStartDate) : '—'}</dd>
              <dt>Cover</dt><dd>{formatINR(patient.coverageLimit)}</dd>
              <dt>Left</dt><dd>{formatINR(patient.remainingCoverage)}</dd>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function AccountCard({ user, onSaved }) {
  const [name, setName] = useState(user.name);
  const [alt, setAlt] = useState(user.alternateEmail ?? '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // A policyholder's name is the one on the policy (KYC), so it isn't editable here
  const nameLocked = user.role === 'POLICYHOLDER';
  const changed = name.trim() !== user.name || alt.trim() !== (user.alternateEmail ?? '');

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    if (name.trim().length < 2) next.name = 'Enter your name.';
    if (alt.trim() && !EMAIL_PATTERN.test(alt.trim())) next.alt = 'Enter a valid email, or leave it empty to stop the copies.';
    if (alt.trim().toLowerCase() === user.email.toLowerCase()) next.alt = 'Use a different email from your main one.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      onSaved(await api.updateMe(nameLocked ? { alternateEmail: alt.trim() } : { name: name.trim(), alternateEmail: alt.trim() }));
      toast({ type: 'success', title: 'Saved', message: alt.trim() ? `Copies of every email now also go to ${alt.trim()}.` : undefined });
    } catch {
      // pop-up shown
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form stack-md" onSubmit={save} noValidate>
      <h2 className="card-title">Account</h2>
      <div className="field">
        <label htmlFor="pf-name">Name</label>
        <input id="pf-name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)}
          readOnly={nameLocked} aria-describedby={nameLocked ? 'pf-name-hint' : undefined} />
        {errors.name && <p className="field-error">{errors.name}</p>}
        {nameLocked && <p className="field-hint" id="pf-name-hint">As written on your policy. Contact your insurer to correct it.</p>}
      </div>
      <div className="field">
        <label htmlFor="pf-email">Email</label>
        <input id="pf-email" className="text-input" value={user.email} readOnly aria-describedby="pf-email-hint" />
        <p className="field-hint" id="pf-email-hint">You sign in with this. It can’t be changed here.</p>
      </div>
      <div className="field">
        <label htmlFor="pf-alt">Alternate email</label>
        <input id="pf-alt" className="text-input" type="email" placeholder="e.g. a family member" value={alt}
          onChange={(e) => setAlt(e.target.value)} aria-invalid={Boolean(errors.alt)} />
        {errors.alt ? <p className="field-error">{errors.alt}</p> : <p className="field-hint">Gets a copy of every email. It also works for password resets.</p>}
      </div>
      <button type="submit" className="btn btn-primary btn-pill self-start" disabled={saving || !changed}>{saving ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

function PersonalCard({ patient, onSaved }) {
  const [form, setForm] = useState({
    phone: patient.phone ?? '', address: patient.address ?? '', dateOfBirth: patient.dateOfBirth ?? '', gender: patient.gender ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.phone.trim() && !/^[0-9+\- ]{6,20}$/.test(form.phone.trim())) {
      setErrors({ phone: 'Enter a valid mobile number.' });
      return;
    }
    setSaving(true);
    try {
      await api.updatePatientProfile(patient.id, {
        phone: form.phone.trim(), address: form.address.trim(), dateOfBirth: form.dateOfBirth || null, gender: form.gender,
      });
      onSaved();
      toast({ type: 'success', title: 'Personal details saved' });
    } catch {
      // pop-up shown
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form stack-md" onSubmit={save} noValidate>
      <h2 className="card-title">Personal details</h2>
      <div className="field">
        <label htmlFor="pf-phone">Mobile</label>
        <input id="pf-phone" className="text-input" type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} aria-invalid={Boolean(errors.phone)} />
        {errors.phone && <p className="field-error">{errors.phone}</p>}
      </div>
      <div className="field">
        <label htmlFor="pf-dob">Date of birth</label>
        <DatePicker id="pf-dob" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={addDays(todayIso(), -1)} min="1920-01-01" />
      </div>
      <fieldset className="field">
        <legend>Gender</legend>
        <div className="segmented segmented-3" role="radiogroup" aria-label="Gender" aria-describedby={patient.gender ? 'pf-gender-hint' : undefined}>
          {['female', 'male', 'other'].map((g) => (
            <button key={g} type="button" role="radio" aria-checked={form.gender === g} disabled={Boolean(patient.gender)} onClick={() => set('gender')(g)}>
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        {patient.gender && <p className="field-hint" id="pf-gender-hint">Recorded on your policy. Contact your insurer to correct it.</p>}
      </fieldset>
      <div className="field">
        <label htmlFor="pf-address">Address</label>
        <textarea id="pf-address" rows="2" maxLength="300" value={form.address} onChange={(e) => set('address')(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-pill self-start" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
    </form>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!current) er.current = 'Enter your current password.';
    if (next.length < 8) er.next = 'Use at least 8 characters.';
    else if (next === current) er.next = 'Choose a different password.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await api.changePassword(current, next);
      toast({ type: 'success', title: 'Password changed', message: 'We’ve emailed you to confirm.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setErrors({ current: err.status === 400 || err.status === 401 ? 'That isn’t your current password.' : err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form stack-md" onSubmit={save} noValidate>
      <h2 className="card-title">Password</h2>
      <PasswordField id="pw-current" label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
      <PasswordField id="pw-new" label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} hint="At least 8 characters." />
      <button type="submit" className="btn btn-secondary btn-pill self-start" disabled={saving}>{saving ? 'Changing…' : 'Change password'}</button>
    </form>
  );
}
