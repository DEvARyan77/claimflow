import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { claimLabel, formatINR, TREATMENTS } from '../../format.js';
import DatePicker, { addDays, formatDate, todayIso } from '../../components/DatePicker.jsx';
import { toast } from '../../toast.jsx';

/**
 * Cashless claim: the hospital finds the patient by policy number, checks the cover,
 * and claims the bill directly from the insurer. The patient pays nothing.
 */
export default function CashlessClaim() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [policyNumber, setPolicyNumber] = useState('');
  const [patient, setPatient] = useState(null);
  const [looking, setLooking] = useState(false);
  const [form, setForm] = useState({ diagnosisCode: 'J18', amount: '', admissionDate: '', dischargeDate: '', description: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const lookUp = async (e) => {
    e.preventDefault();
    const number = policyNumber.trim().toUpperCase();
    if (!number) {
      setErrors({ policy: 'Enter the policy number from the patient’s health card.' });
      return;
    }
    setLooking(true);
    setErrors({});
    try {
      setPatient(await api.patientByPolicy(number, { quiet: true }));
    } catch (err) {
      setPatient(null);
      setErrors({ policy: err.status === 404 ? `No policy ${number} found. Check the number on the card.` : err.message });
    } finally {
      setLooking(false);
    }
  };

  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    const amount = Number(form.amount);
    if (!form.amount) next.amount = 'Enter the bill amount.';
    else if (!(amount > 0)) next.amount = 'Enter an amount greater than 0.';
    if (!form.admissionDate) next.admissionDate = 'Choose the admission date.';
    if (form.dischargeDate && form.dischargeDate < form.admissionDate) next.dischargeDate = 'This is before the admission date.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const treatment = TREATMENTS.find((t) => t.code === form.diagnosisCode);
      const claim = await api.submitClaim({
        patientId: patient.id,
        providerId: user.providerId,
        diagnosisCode: form.diagnosisCode,
        treatment: treatment?.label,
        amount: Number(form.amount),
        admissionDate: form.admissionDate,
        dischargeDate: form.dischargeDate || null,
        description: form.description.trim() || null,
      });
      const messages = {
        APPROVED: ['success', `Claim ${claimLabel(claim)} approved ✅`, `${formatINR(claim.amount)} will be paid to you in a few seconds.`],
        REJECTED: ['error', `Claim ${claimLabel(claim)} not approved`, claim.reason],
        UNDER_REVIEW: ['info', `Claim ${claimLabel(claim)} sent for review 🕵️`, 'A claims officer will check it. You’ll see the decision here.'],
      };
      const [type, title, message] = messages[claim.status] ?? ['info', `Claim ${claimLabel(claim)} submitted`, 'Verification is in progress.'];
      toast({ type, title, message });
      navigate(`/claims/${claim.id}`);
    } catch {
      setSubmitting(false);
    }
  };

  const remaining = Number(patient?.remainingCoverage ?? 0);
  const over = patient && Number(form.amount) > remaining;

  return (
    <div className="stack-lg narrow-page">
      <div>
        <Link to="/" className="back-link">← Back to claims</Link>
        <h1>New cashless claim</h1>
        <p className="lead">Find the patient’s policy, then claim the bill. The patient pays nothing for covered treatment.</p>
      </div>

      <form className="card form stack-md" onSubmit={lookUp} noValidate>
        <div className="field">
          <label htmlFor="policy">1 · Policy number</label>
          <div className="input-with-button">
            <input id="policy" className="text-input" placeholder="e.g. POL1001" value={policyNumber} autoComplete="off"
              onChange={(e) => { setPolicyNumber(e.target.value); setErrors({}); }} aria-invalid={Boolean(errors.policy)} />
            <button type="submit" className="btn btn-secondary" disabled={looking}>{looking ? 'Finding…' : 'Find policy'}</button>
          </div>
          {errors.policy && <p className="field-error">{errors.policy}</p>}
          <p className="field-hint">Demo policies: POL1001 (Rahul), POL1002 (Priya, new policy), POL1003 (Amit, inactive).</p>
        </div>

        {patient && (
          <div className={`policy-card${patient.policyActive ? '' : ' is-inactive'}`}>
            <div>
              <p className="strong">{patient.name}</p>
              <p className="small muted">Policy {patient.policyNumber}{patient.policyStartDate && ` · since ${formatDate(patient.policyStartDate)}`}</p>
            </div>
            <div className="policy-card-right">
              {patient.policyActive ? <span className="pill pill-paid">Active</span> : <span className="pill pill-rejected">Inactive</span>}
              <span className="strong">{formatINR(remaining)} left</span>
            </div>
          </div>
        )}
      </form>

      {patient && (
        <form className="card form stack-md pop-card" onSubmit={submit} noValidate>
          <p className="field-legend">2 · Treatment and bill</p>
          {!patient.policyActive && <p className="field-warning">This policy is inactive, so the claim will be rejected.</p>}
          <div className="field">
            <label htmlFor="treatment">Treatment</label>
            <select id="treatment" value={form.diagnosisCode} onChange={(e) => set('diagnosisCode')(e.target.value)}>
              {TREATMENTS.map((t) => <option key={t.code} value={t.code}>{t.label} ({t.code})</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="adm">Admitted on</label>
              <DatePicker id="adm" value={form.admissionDate} min={addDays(todayIso(), -180)} max={todayIso()} invalid={Boolean(errors.admissionDate)}
                onChange={(v) => { set('admissionDate')(v); if (form.dischargeDate && v > form.dischargeDate) set('dischargeDate')(''); }} />
              {errors.admissionDate && <p className="field-error">{errors.admissionDate}</p>}
            </div>
            <div className="field">
              <label htmlFor="dis">Discharge <span className="muted">(or expected)</span></label>
              <DatePicker id="dis" value={form.dischargeDate} min={form.admissionDate || addDays(todayIso(), -180)} max={addDays(todayIso(), 30)}
                invalid={Boolean(errors.dischargeDate)} onChange={set('dischargeDate')} placeholder="Still admitted" />
              {errors.dischargeDate && <p className="field-error">{errors.dischargeDate}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="bill">Bill amount (₹)</label>
            <input id="bill" type="number" inputMode="numeric" min="1" placeholder="e.g. 85000" value={form.amount}
              onChange={(e) => set('amount')(e.target.value)} aria-invalid={Boolean(errors.amount)} />
            {errors.amount && <p className="field-error">{errors.amount}</p>}
            {over && !errors.amount && <p className="field-warning">This is more than the {formatINR(remaining)} cover left, so it will be rejected.</p>}
          </div>
          <div className="field">
            <label htmlFor="notes">Notes <span className="muted">(optional)</span></label>
            <textarea id="notes" rows="3" maxLength="255" placeholder="e.g. Emergency admission, ICU 2 days" value={form.description}
              onChange={(e) => set('description')(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-large btn-pill" disabled={submitting}>
            {submitting ? 'Submitting…' : `Claim ${form.amount ? formatINR(form.amount) : ''} for ${patient.name.split(' ')[0]}`}
          </button>
        </form>
      )}
    </div>
  );
}
