import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR, claimLabel } from '../format.js';
import { defaultDocumentFor } from '../policyDocs.js';
import AnswerCard from '../components/AnswerCard.jsx';
import ClaimChat from '../components/ClaimChat.jsx';
import { toast } from '../toast.jsx';

const DIAGNOSES = [
  { code: 'I21', label: 'Heart attack' },
  { code: 'J18', label: 'Pneumonia' },
  { code: 'S72', label: 'Hip / thigh fracture' },
  { code: 'K35', label: 'Appendicitis' },
  { code: 'A90', label: 'Dengue fever' },
  { code: 'N20', label: 'Kidney stone' },
  { code: 'E11', label: 'Type 2 diabetes care' },
];

export default function NewClaim() {
  const { patient, refreshPatient } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState(searchParams.get('provider') ?? '');
  const [diagnosisCode, setDiagnosisCode] = useState('I21');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [extraEmail, setExtraEmail] = useState('');
  const [showExtraEmail, setShowExtraEmail] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [precheck, setPrecheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [policyDocumentId, setPolicyDocumentId] = useState(null);

  useEffect(() => {
    api.providers().then(setProviders).catch(() => setProviders([]));
    api
      .policyDocuments({ quiet: true })
      .then((docs) => setPolicyDocumentId(defaultDocumentFor(docs, patient)?.id ?? null))
      .catch(() => setPolicyDocumentId(null));
  }, [patient]);

  // Any change to the claim makes an earlier compliance check out of date
  useEffect(() => {
    setPrecheck(null);
  }, [providerId, diagnosisCode, amount]);

  const chosen = useMemo(() => providers?.find((p) => String(p.id) === String(providerId)), [providers, providerId]);
  const diagnosis = DIAGNOSES.find((d) => d.code === diagnosisCode);

  /** Plain-English summary of the claim so far; the chat sends it along with each question. */
  const claimContext = [
    diagnosis && `treatment for ${diagnosis.label} (ICD-10 ${diagnosis.code})`,
    chosen && `at ${chosen.name}${chosen.inNetwork ? '' : ' (out of network)'}`,
    Number(amount) > 0 && `bill ${formatINR(amount)}`,
  ]
    .filter(Boolean)
    .join(', ');

  const validate = () => {
    const next = {};
    if (!providerId) next.provider = 'Choose the hospital that treated you.';
    if (!diagnosisCode) next.diagnosis = 'Choose what you were treated for.';
    const value = Number(amount);
    if (!amount) next.amount = 'Enter the bill amount.';
    else if (!Number.isFinite(value) || value <= 0) next.amount = 'Enter an amount greater than 0.';
    if (extraEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extraEmail.trim())) {
      next.extraEmail = 'Enter a valid email, or leave it empty.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const runComplianceCheck = async () => {
    if (!validate()) return;
    setChecking(true);
    try {
      const result = await api.precheckClaim({
        documentId: policyDocumentId,
        diagnosisCode,
        diagnosisLabel: diagnosis?.label,
        amount: Number(amount),
        hospitalName: chosen?.name,
      });
      setPrecheck(result);
    } catch {
      // red pop-up already shown
    } finally {
      setChecking(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const claim = await api.submitClaim({
        patientId: patient.id,
        providerId,
        diagnosisCode,
        description: description.trim() || null,
        amount: Number(amount),
        extraEmail: extraEmail.trim() || null,
      });
      if (claim.status === 'APPROVED') {
        toast({ type: 'success', title: `Claim ${claimLabel(claim)} approved`, message: `${formatINR(claim.amount)} will be paid to ${chosen?.name ?? 'the hospital'}.` });
      } else if (claim.status === 'REJECTED') {
        toast({ type: 'error', title: `Claim ${claimLabel(claim)} not approved`, message: claim.reason });
      } else {
        toast({ type: 'info', title: `Claim ${claimLabel(claim)} submitted`, message: 'We’re still verifying it. You’ll get an update shortly.' });
      }
      await refreshPatient();
      navigate('/', { state: { claimId: claim.id } });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <Link to="/" className="back-link">
          ← Back to my claims
        </Link>
        <h1>Submit a claim</h1>
        <p className="lead">
          You have <strong>{formatINR(patient.remainingCoverage)}</strong> of coverage left. Ask the AI anything about your
          cover while you fill this in.
        </p>
      </div>

      <div className="claim-layout">
        <form className="card form claim-form" onSubmit={submit} noValidate>
          <fieldset className="field">
            <legend>Hospital</legend>
            {providers === null && <p className="muted small">Loading hospitals…</p>}
            <div className="option-grid">
              {providers?.map((p) => (
                <label key={p.id} className={`option${String(p.id) === String(providerId) ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={String(p.id) === String(providerId)}
                    onChange={(e) => {
                      setProviderId(e.target.value);
                      setErrors((err) => ({ ...err, provider: undefined }));
                    }}
                  />
                  <span className="option-body">
                    <span className="option-title">{p.name}</span>
                    <span className="option-sub">{p.city}</span>
                    {p.inNetwork ? <span className="pill pill-paid">In network</span> : <span className="pill pill-rejected">Out of network</span>}
                  </span>
                </label>
              ))}
            </div>
            {errors.provider && <p className="field-error">{errors.provider}</p>}
            {chosen && !chosen.inNetwork && (
              <p className="field-warning">
                {chosen.name} is out of network, so this claim will be rejected. Choose an in-network hospital to get it paid.
              </p>
            )}
          </fieldset>

          <div className="field">
            <label htmlFor="diagnosis">Treated for</label>
            <select id="diagnosis" value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)}>
              {DIAGNOSES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label} ({d.code})
                </option>
              ))}
            </select>
            {errors.diagnosis && <p className="field-error">{errors.diagnosis}</p>}
          </div>

          <div className="field">
            <label htmlFor="amount">Bill amount (₹)</label>
            <input
              id="amount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="e.g. 25000"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((err) => ({ ...err, amount: undefined }));
              }}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'amount-error' : undefined}
            />
            {errors.amount && (
              <p className="field-error" id="amount-error">
                {errors.amount}
              </p>
            )}
            {Number(amount) > Number(patient.remainingCoverage) && !errors.amount && (
              <p className="field-warning">This is more than your remaining coverage, so the claim will be rejected.</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="description">
              Notes <span className="muted">(optional)</span>
            </label>
            <textarea
              id="description"
              rows="3"
              maxLength="255"
              placeholder="e.g. 3 nights in ward, angioplasty"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            {!showExtraEmail ? (
              <button type="button" className="link-button optional-toggle" onClick={() => setShowExtraEmail(true)}>
                + Also send updates to another email
              </button>
            ) : (
              <>
                <label htmlFor="extra-email">
                  Also send updates to <span className="muted">(optional)</span>
                </label>
                <input
                  id="extra-email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. family member or your work email"
                  value={extraEmail}
                  onChange={(e) => {
                    setExtraEmail(e.target.value);
                    setErrors((err) => ({ ...err, extraEmail: undefined }));
                  }}
                  aria-invalid={Boolean(errors.extraEmail)}
                  aria-describedby="extra-email-hint"
                />
                <p className="field-hint" id="extra-email-hint">
                  They'll get the same emails as you: received, approved or not, and paid.
                </p>
                {errors.extraEmail && <p className="field-error">{errors.extraEmail}</p>}
              </>
            )}
          </div>

          <div className="precheck">
            <div>
              <p className="strong">Check compliance with AI</p>
              <p className="muted small">Checks this claim against your policy: waiting periods, sub-limits, room rent, exclusions.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={runComplianceCheck} disabled={checking}>
              {checking ? 'Checking your policy…' : 'Check compliance'}
            </button>
          </div>
          {precheck && <AnswerCard answer={precheck} showVerdict />}

          <button type="submit" className="btn btn-primary btn-large" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit claim'}
          </button>
        </form>

        <ClaimChat documentId={policyDocumentId} claimContext={claimContext} diagnosisLabel={diagnosis?.label} />
      </div>
    </div>
  );
}
