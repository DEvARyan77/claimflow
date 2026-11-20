import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { firstName, formatINR, formatWhen } from '../format.js';
import ClaimTracker from '../components/ClaimTracker.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { PlusIcon } from '../components/Icons.jsx';
import { toast } from '../toast.jsx';

const ACTIVE_STATUSES = ['SUBMITTED', 'APPROVED'];

export default function MyClaims() {
  const { patient, refreshPatient } = useOutletContext();
  const location = useLocation();
  const [claims, setClaims] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [providers, setProviders] = useState({});
  const [selectedId, setSelectedId] = useState(location.state?.claimId ?? null);
  const [error, setError] = useState(null);

  // Remember what we've already seen, so a change shows a pop-up exactly once
  const lastStatuses = useRef(null);
  const seenMessages = useRef(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const [claimList, messageList] = await Promise.all([
        api.claimsForPatient(patient.id, { quiet }),
        api.notificationsForPatient(patient.id, { quiet: true }).catch(() => []),
      ]);
      announceChanges(claimList, messageList, lastStatuses, seenMessages);
      setClaims(claimList);
      setNotifications(messageList);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [patient.id]);

  useEffect(() => {
    load();
    api
      .providers()
      .then((list) => setProviders(Object.fromEntries(list.map((p) => [p.id, p]))))
      .catch(() => setProviders({}));
  }, [load]);

  const selected = useMemo(() => {
    if (!claims || claims.length === 0) return null;
    return claims.find((c) => c.id === selectedId) ?? claims[0];
  }, [claims, selectedId]);

  // Keep the tracker live while a claim is still moving (checking → approved → paid → notified)
  const stillMoving =
    claims?.some((c) => ACTIVE_STATUSES.includes(c.status)) ||
    (selected?.status === 'PAID' && !notifications.some((n) => n.claimId === selected.id && n.claimStatus === 'PAID'));

  useEffect(() => {
    if (!stillMoving) return undefined;
    const timer = setInterval(() => {
      load(true);
      refreshPatient(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [stillMoving, load, refreshPatient]);

  const providerName = (id) => providers[id]?.name ?? `Hospital #${id}`;
  const usedPercent = Math.min(100, Math.round((Number(patient.usedAmount) / Number(patient.coverageLimit)) * 100) || 0);

  if (error && !claims) {
    return (
      <div className="banner banner-error" role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="hero">
        <section className="hero-main" aria-live="polite">
          {claims === null && <p className="muted">Loading your claims…</p>}

          {claims && !selected && (
            <div className="card empty">
              <h1>Hi {firstName(patient.name)}, you have no claims yet</h1>
              <p className="muted">
                When a hospital treats you, submit the bill here. We check it in seconds and pay the hospital directly.
              </p>
              <Link to="/new" className="btn btn-primary btn-pill">
                <PlusIcon /> Submit your first claim
              </Link>
            </div>
          )}

          {selected && (
            <>
              <div>
                <h1>{headline(selected, patient)}</h1>
                <p className="lead">
                  Claim #{selected.id} at {providerName(selected.providerId)} · {formatINR(selected.amount)} · submitted{' '}
                  {formatWhen(selected.createdAt).toLowerCase()}
                </p>
              </div>
              <div className="card tracker-card">
                <ClaimTracker claim={selected} providerName={providerName(selected.providerId)} notifications={notifications} />
              </div>
              <NextStep claim={selected} providerName={providerName(selected.providerId)} />
            </>
          )}
        </section>

        <aside className="hero-side">
          <div className="card coverage-card">
            <div className="row-between">
              <h2 className="card-title">Your coverage · {patient.policyNumber}</h2>
              {patient.policyActive ? (
                <span className="pill pill-paid">Policy active</span>
              ) : (
                <span className="pill pill-rejected">Policy inactive</span>
              )}
            </div>
            <p className="big-number">
              {formatINR(patient.remainingCoverage)} <span>left this year</span>
            </p>
            <div className="meter" role="img" aria-label={`${usedPercent}% of your coverage used`}>
              <div className="meter-fill" style={{ width: `${usedPercent}%` }} />
            </div>
            <div className="row-between small muted">
              <span>Used {formatINR(patient.usedAmount)}</span>
              <span>Limit {formatINR(patient.coverageLimit)}</span>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Messages</h2>
            {notifications.length === 0 && <p className="muted small">No messages yet.</p>}
            <ul className="message-list">
              {notifications.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <p>{n.message}</p>
                  <span>{formatWhen(n.sentAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {claims && claims.length > 0 && (
        <section className="stack-md" aria-labelledby="your-claims">
          <div className="row-between">
            <h2 id="your-claims" className="section-title">
              Your claims
            </h2>
            <span className="muted small">Select a claim to track it</span>
          </div>
          <div className="claim-grid">
            {claims.map((claim) => (
              <button
                type="button"
                key={claim.id}
                className={`card claim-card${selected?.id === claim.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(claim.id)}
                aria-pressed={selected?.id === claim.id}
              >
                <span className="row-between">
                  <span className="claim-card-id">Claim #{claim.id}</span>
                  <StatusPill status={claim.status} />
                </span>
                <span className="claim-card-amount">{formatINR(claim.amount)}</span>
                <span className="claim-card-provider">{providerName(claim.providerId)}</span>
                <span className="claim-card-detail">{detailLine(claim)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Pop-ups for claims that changed status and for emails that were just sent (or failed). */
function announceChanges(claimList, messageList, lastStatuses, seenMessages) {
  if (lastStatuses.current) {
    claimList.forEach((claim) => {
      const before = lastStatuses.current.get(claim.id);
      if (!before || before === claim.status) return;
      if (claim.status === 'APPROVED') {
        toast({ type: 'success', title: `Claim #${claim.id} approved`, message: `${formatINR(claim.amount)} will be paid to the hospital.` });
      } else if (claim.status === 'PAID') {
        toast({ type: 'success', title: `Claim #${claim.id} paid`, message: `${formatINR(claim.amount)} has been paid to the hospital.` });
      } else if (claim.status === 'REJECTED') {
        toast({ type: 'error', title: `Claim #${claim.id} not approved`, message: claim.reason });
      }
    });
  }
  lastStatuses.current = new Map(claimList.map((c) => [c.id, c.status]));

  if (seenMessages.current) {
    messageList
      .filter((n) => !seenMessages.current.has(n.id))
      .forEach((n) => {
        if (n.channel === 'EMAIL' && n.deliveryStatus === 'SENT') {
          toast({ type: 'info', title: 'Email sent', message: `Update for claim #${n.claimId} sent to ${n.recipient}.` });
        } else if (n.deliveryStatus === 'FAILED') {
          toast({ type: 'warning', title: "Email couldn't be sent", message: 'Check MAIL_USERNAME and MAIL_PASSWORD in your .env file.' });
        }
      });
  }
  seenMessages.current = new Set(messageList.map((n) => n.id));
}

function headline(claim, patient) {
  const name = firstName(patient.name);
  switch (claim.status) {
    case 'SUBMITTED':
      return `Hi ${name}, we're checking your claim`;
    case 'APPROVED':
      return `Hi ${name}, your claim is on its way`;
    case 'PAID':
      return `Hi ${name}, this claim is fully paid`;
    case 'REJECTED':
      return `Hi ${name}, this claim wasn't approved`;
    default:
      return `Hi ${name}`;
  }
}

function detailLine(claim) {
  switch (claim.status) {
    case 'SUBMITTED':
      return claim.reason ?? 'Verification in progress';
    case 'APPROVED':
      return `${formatWhen(claim.decidedAt)} · payment in progress`;
    case 'PAID':
      return `${formatWhen(claim.paidAt)} · paid to hospital`;
    case 'REJECTED':
      return claim.reason;
    default:
      return '';
  }
}

function NextStep({ claim, providerName }) {
  let text;
  switch (claim.status) {
    case 'SUBMITTED':
      text = claim.reason
        ? claim.reason
        : "We're checking your policy, the hospital and your remaining coverage. This usually takes a few seconds.";
      break;
    case 'APPROVED':
      text = `ClaimFlow pays ${providerName} directly. You don't need to pay anything for this treatment, and you'll get an email as soon as the payment is done.`;
      break;
    case 'PAID':
      text = `${providerName} has been paid ${formatINR(claim.amount)}${
        claim.paymentReference ? ` (reference ${claim.paymentReference})` : ''
      }. There's nothing more you need to do.`;
      break;
    case 'REJECTED':
      text = `${claim.reason}. ${advice(claim.reason)}`;
      break;
    default:
      return null;
  }
  return (
    <div className={`callout${claim.status === 'REJECTED' ? ' callout-warning' : ''}`}>
      <strong>{claim.status === 'REJECTED' ? 'Why: ' : 'What happens next: '}</strong>
      {text}
    </div>
  );
}

function advice(reason = '') {
  if (reason.includes('out of network')) return 'Choose an in-network hospital from the Hospitals page next time.';
  if (reason.includes('Coverage')) return 'Your remaining coverage is shown on the right.';
  if (reason.includes('inactive')) return 'Please contact your insurer to renew your policy.';
  return 'Contact support if you think this is a mistake.';
}
