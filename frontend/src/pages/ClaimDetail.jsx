import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { claimLabel, formatINR, formatWhen, treatmentName } from '../format.js';
import StatusPill, { RiskBadge } from '../components/StatusPill.jsx';
import ReviewThread, { ReplyBox } from '../components/ReviewThread.jsx';
import { formatDate } from '../components/DatePicker.jsx';
import { toast } from '../toast.jsx';

const REVIEWABLE = ['UNDER_REVIEW', 'INFO_REQUESTED'];

/** One claim, for hospitals (their own claims) and for claims officers / admins (with the fraud check). */
export default function ClaimDetail() {
  const { claimId } = useParams();
  const { user } = useOutletContext();
  const isStaff = user.role === 'OFFICER' || user.role === 'ADMIN';
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState(null);
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async (quiet = false) => {
    try {
      setClaim(await api.claim(claimId, { quiet }));
      setError(null);
    } catch (e) {
      setError(e.status === 404 ? 'This claim doesn’t exist, or it isn’t yours to see.' : e.message);
    }
  }, [claimId]);

  useEffect(() => {
    load();
  }, [load]);

  // details around the claim: the hospital, and for staff the policy and the patient's other claims
  useEffect(() => {
    if (!claim) return;
    api.providers({ quiet: true }).then((list) => setProvider(list.find((p) => String(p.id) === String(claim.providerId)) ?? null)).catch(() => {});
    if (isStaff) {
      api.patient(claim.patientId, { quiet: true }).then(setPatient).catch(() => setPatient(null));
      api.claimsForPatient(claim.patientId, { quiet: true })
        .then((list) => setHistory(list.filter((c) => String(c.id) !== String(claim.id))))
        .catch(() => setHistory([]));
    }
  }, [claim?.id, claim?.providerId, claim?.patientId, isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  // the AI review arrives a few seconds after the claim; payment a few seconds after approval
  const waiting = claim && (claim.fraud?.aiStatus === 'PENDING' || claim.status === 'APPROVED' || claim.status === 'SUBMITTED');
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const back = user.role === 'HOSPITAL' ? '/' : user.role === 'OFFICER' ? '/' : '/claims';
  const backLabel = user.role === 'OFFICER' ? 'Back to the review queue' : user.role === 'HOSPITAL' ? 'Back to claims' : 'Back to all claims';

  if (error) {
    return (
      <div className="stack-lg">
        <Link to={back} className="back-link">← {backLabel}</Link>
        <div className="banner banner-error" role="alert"><p>{error}</p></div>
      </div>
    );
  }
  if (!claim) return <p className="muted loading">Loading the claim…</p>;

  return (
    <div className="stack-lg">
      <div>
        <Link to={back} className="back-link">← {backLabel}</Link>
        <div className="title-row">
          <h1>Claim {claimLabel(claim)}</h1>
          <StatusPill status={claim.status} />
          {isStaff && <RiskBadge fraud={claim.fraud} />}
        </div>
        <p className="lead">
          {treatmentName(claim)} · {formatINR(claim.amount)} · {claim.patientName ?? 'Policyholder'}
          {claim.policyNumber && ` (${claim.policyNumber})`} · {provider?.name ?? 'Hospital'}
        </p>
      </div>

      <div className="detail-layout">
        <div className="stack-md detail-main">
          {claim.reason && (
            <div className={`callout${claim.status === 'REJECTED' || claim.status === 'INFO_REQUESTED' ? ' callout-warning' : ''}`}>
              <strong>{claim.status === 'REJECTED' ? 'Why: ' : 'Status: '}</strong>{claim.reason}
            </div>
          )}

          {isStaff && claim.fraud && <FraudPanel fraud={claim.fraud} />}
          {isStaff && REVIEWABLE.includes(claim.status) && <ReviewActions claim={claim} onDone={setClaim} />}
          {user.role === 'HOSPITAL' && claim.status === 'INFO_REQUESTED' && <ReplyBox claim={claim} onReplied={setClaim} />}

          <section className="card">
            <div className="row-between">
              <h2 className="card-title">Review history</h2>
              {isStaff && !REVIEWABLE.includes(claim.status) && <NoteButton claim={claim} onDone={setClaim} />}
            </div>
            {claim.reviewNotes?.length ? <ReviewThread notes={claim.reviewNotes} /> : <p className="muted small">No review activity yet.</p>}
          </section>
        </div>

        <aside className="stack-md detail-side">
          <section className="card">
            <h2 className="card-title">Claim details</h2>
            <dl className="facts">
              <dt>Type</dt><dd>{claim.type === 'CASHLESS' ? '🏥 Cashless (hospital)' : '🧾 Reimbursement'}</dd>
              <dt>Treatment</dt><dd>{treatmentName(claim)} <code>{claim.diagnosisCode}</code></dd>
              <dt>Bill</dt><dd>{formatINR(claim.amount)}</dd>
              {claim.admissionDate && (<><dt>Stay</dt><dd>{formatDate(claim.admissionDate)}{claim.dischargeDate && ` – ${formatDate(claim.dischargeDate)}`}</dd></>)}
              <dt>Submitted</dt><dd>{formatWhen(claim.createdAt)}{claim.submittedByName && ` by ${claim.submittedByName}`}</dd>
              {claim.decidedAt && (<><dt>Decided</dt><dd>{formatWhen(claim.decidedAt)}</dd></>)}
              {claim.paidAt && (<><dt>Paid</dt><dd>{formatWhen(claim.paidAt)} · {claim.paymentReference}</dd></>)}
              {claim.description && (<><dt>Notes</dt><dd>{claim.description}</dd></>)}
            </dl>
          </section>

          {isStaff && patient && (
            <section className="card">
              <h2 className="card-title">Policy {patient.policyNumber}</h2>
              <dl className="facts">
                <dt>Holder</dt><dd>{patient.name}</dd>
                <dt>Started</dt><dd>{patient.policyStartDate ? formatDate(patient.policyStartDate) : '—'}</dd>
                <dt>Cover left</dt><dd>{formatINR(patient.remainingCoverage)} of {formatINR(patient.coverageLimit)}</dd>
                <dt>Status</dt><dd>{patient.policyActive ? 'Active' : 'Inactive'}</dd>
              </dl>
            </section>
          )}

          {isStaff && (
            <section className="card">
              <h2 className="card-title">Other claims on this policy</h2>
              {history.length === 0 && <p className="muted small">None. This is the first claim.</p>}
              <ul className="mini-list">
                {history.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to={`/claims/${c.id}`}>{claimLabel(c)}</Link>
                    <span>{treatmentName(c)} · {formatINR(c.amount)}</span>
                    <StatusPill status={c.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function FraudPanel({ fraud }) {
  const advice = { APPROVE: ['good', 'Looks fine to approve'], INVESTIGATE: ['warn', 'Check before deciding'], REJECT: ['bad', 'Leans towards rejecting'] };
  const [tone, adviceText] = advice[fraud.aiRecommendation] ?? [];
  return (
    <section className={`card fraud-panel fraud-${fraud.level.toLowerCase()}`} aria-labelledby="fraud-title">
      <div className="row-between">
        <h2 className="card-title" id="fraud-title">🛡️ Fraud check</h2>
        <RiskBadge fraud={fraud} />
      </div>
      <div className="risk-meter" role="img" aria-label={`Risk score ${fraud.score} of 100`}>
        <div className="risk-meter-fill" style={{ width: `${Math.max(4, fraud.score)}%` }} />
        <span className="risk-mark" style={{ left: '30%' }} />
        <span className="risk-mark" style={{ left: '60%' }} />
      </div>

      {fraud.flags.length === 0 ? (
        <p className="muted small">No red flags. This claim was decided automatically.</p>
      ) : (
        <ul className="flag-list">
          {fraud.flags.map((f, i) => (
            <li key={f.code + i} style={{ '--i': i }}>
              <span className="flag-points">+{f.points}</span>
              <span><strong>{f.label}</strong><span className="small muted">{f.detail}</span></span>
            </li>
          ))}
        </ul>
      )}

      {fraud.aiStatus && fraud.aiStatus !== 'SKIPPED' && (
        <div className="ai-review">
          <p className="ai-review-title">
            ✨ {fraud.aiStatus === 'DONE' ? 'AI review (Gemini)' : fraud.aiStatus === 'PENDING' ? 'AI review' : 'Summary'}
            {adviceText && <span className={`verdict verdict-${tone}`}>{adviceText}</span>}
          </p>
          {fraud.aiStatus === 'PENDING' ? (
            <p className="muted small typing-line">Gemini is reading the claim<span className="dots"><i /><i /><i /></span></p>
          ) : (
            <p>{fraud.aiSummary}</p>
          )}
          <p className="small muted">Advice only. You make the decision.</p>
        </div>
      )}
    </section>
  );
}

function ReviewActions({ claim, onDone }) {
  const [action, setAction] = useState(null); // REJECT | REQUEST_INFO | NOTE
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (chosen) => {
    if (chosen !== 'APPROVE' && note.trim().length < 3) {
      setError(chosen === 'REJECT' ? 'Write the reason. The policyholder will see it.' : chosen === 'REQUEST_INFO' ? 'Write what you need. The policyholder will see it.' : 'Write the note.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.reviewClaim(claim.id, chosen, chosen === 'APPROVE' ? note.trim() || null : note.trim());
      const titles = { APPROVE: '✅ Claim approved', REJECT: '⛔ Claim rejected', REQUEST_INFO: '❓ Information requested', NOTE: '📝 Note saved' };
      toast({
        type: updated.status === 'REJECTED' && chosen === 'APPROVE' ? 'warning' : 'success',
        title: updated.status === 'REJECTED' && chosen === 'APPROVE' ? 'Couldn’t approve' : titles[chosen],
        message: updated.status === 'REJECTED' && chosen === 'APPROVE' ? updated.reason : undefined,
      });
      setNote('');
      setAction(null);
      onDone(updated);
    } catch {
      // pop-up already shown
    } finally {
      setBusy(false);
    }
  };

  const placeholder = {
    REJECT: 'e.g. The bill is 5× the usual cost and no itemised bill was provided.',
    REQUEST_INFO: 'e.g. Please share the discharge summary and the itemised bill.',
    NOTE: 'Only staff can see this.',
  };

  return (
    <section className="card review-actions" aria-labelledby="decide-title">
      <h2 className="card-title" id="decide-title">Your decision</h2>
      <div className="decision-buttons">
        <button type="button" className="btn btn-approve" disabled={busy} onClick={() => run('APPROVE')}>✅ Approve</button>
        <button type="button" className={`btn btn-secondary${action === 'REQUEST_INFO' ? ' is-active' : ''}`} disabled={busy}
          onClick={() => { setAction('REQUEST_INFO'); setError(null); }}>❓ Ask for info</button>
        <button type="button" className={`btn btn-reject${action === 'REJECT' ? ' is-active' : ''}`} disabled={busy}
          onClick={() => { setAction('REJECT'); setError(null); }}>⛔ Reject</button>
        <button type="button" className={`btn btn-ghost${action === 'NOTE' ? ' is-active' : ''}`} disabled={busy}
          onClick={() => { setAction('NOTE'); setError(null); }}>📝 Note</button>
      </div>
      {action && (
        <div className="decision-note">
          <label htmlFor="review-note" className="strong">
            {action === 'REJECT' ? 'Reason for rejecting' : action === 'REQUEST_INFO' ? 'What do you need?' : 'Internal note'}
          </label>
          <textarea id="review-note" rows="3" maxLength="1000" value={note} placeholder={placeholder[action]} autoFocus
            onChange={(e) => { setNote(e.target.value); setError(null); }} aria-invalid={Boolean(error)} />
          {error && <p className="field-error">{error}</p>}
          <div className="row-between">
            <button type="button" className="link-button" onClick={() => setAction(null)}>Cancel</button>
            <button type="button" className={`btn btn-pill ${action === 'REJECT' ? 'btn-reject' : 'btn-primary'}`} disabled={busy} onClick={() => run(action)}>
              {busy ? 'Saving…' : action === 'REJECT' ? 'Reject claim' : action === 'REQUEST_INFO' ? 'Send request' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function NoteButton({ claim, onDone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) return <button type="button" className="link-button small" onClick={() => setOpen(true)}>+ Add note</button>;
  const save = async () => {
    if (note.trim().length < 3) return;
    try {
      onDone(await api.reviewClaim(claim.id, 'NOTE', note.trim()));
      setOpen(false);
      setNote('');
    } catch {
      // pop-up shown
    }
  };
  return (
    <div className="inline-note">
      <input className="text-input" value={note} placeholder="Internal note" onChange={(e) => setNote(e.target.value)} aria-label="Internal note" />
      <button type="button" className="btn btn-secondary" onClick={save}>Save</button>
    </div>
  );
}
