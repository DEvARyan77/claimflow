import { CheckIcon, CrossIcon } from './Icons.jsx';
import { formatINR, formatWhen, claimLabel } from '../format.js';

/**
 * Turns a claim (+ its notifications) into the 5-step journey:
 * Submitted → Verified → Approved/Rejected → Payment → Notified
 */
export function buildSteps(claim, providerName, notifications) {
  const { status } = claim;
  const notificationFor = (claimStatus) =>
    notifications.find((n) => n.claimId === claim.id && n.claimStatus === claimStatus);

  const steps = [
    { key: 'submitted', label: 'Submitted', state: 'done', note: formatWhen(claim.createdAt) },
    {
      key: 'verified',
      label: 'Verified',
      state: status === 'SUBMITTED' ? 'current' : 'done',
      note: status === 'SUBMITTED' ? 'Checking policy, hospital & coverage' : 'Policy, hospital & coverage checked',
    },
  ];

  // Claims the fraud check sent to an officer get an extra "Review" step
  const inReview = status === 'UNDER_REVIEW' || status === 'INFO_REQUESTED';
  const reviewed = (claim.reviewNotes ?? []).some((n) => n.action === 'APPROVE' || n.action === 'REJECT');
  if ((inReview || reviewed) && status !== 'REJECTED') {
    steps.push({
      key: 'review',
      label: status === 'INFO_REQUESTED' ? 'Info needed' : 'Review',
      state: inReview ? (status === 'INFO_REQUESTED' ? 'waiting' : 'current') : 'done',
      note: status === 'INFO_REQUESTED' ? 'Waiting for your reply' : inReview ? 'A claims officer is checking it' : 'Checked by the claims team',
    });
  }

  if (status === 'REJECTED') {
    const notified = notificationFor('REJECTED');
    const reviewedOut = (claim.reviewNotes ?? []).some((n) => n.action === 'REJECT');
    if (reviewedOut) {
      // Passed the checks, then rejected by the claims team: the Review step fails
      steps.push({ key: 'review', label: 'Review', state: 'failed', note: `Not approved · ${formatWhen(claim.decidedAt)}` });
    } else {
      // Failed a check (policy, hospital or cover): verification itself fails, nothing further happens
      steps[1] = { key: 'verified', label: 'Not verified', state: 'failed', note: claim.reason ?? 'A check failed' };
    }
    steps.push(
      {
        key: 'notified',
        label: 'Notified',
        state: notified ? 'done' : 'current',
        note: notified ? `${notified.channel === 'EMAIL' ? 'Email' : 'Message'} sent · ${formatWhen(notified.sentAt)}` : 'Emailing you',
      },
    );
    return steps;
  }

  const notifiedPaid = notificationFor('PAID');
  steps.push(
    {
      key: 'decision',
      label: 'Approved',
      state: status === 'SUBMITTED' || inReview ? 'todo' : 'done',
      note: status === 'SUBMITTED' ? 'Waiting for verification' : inReview ? 'After the review' : formatWhen(claim.decidedAt),
    },
    {
      key: 'payment',
      label: 'Payment',
      state: status === 'PAID' ? 'done' : status === 'APPROVED' ? 'current' : 'todo',
      note:
        status === 'PAID'
          ? `Paid · ${formatWhen(claim.paidAt)}`
          : `Releasing ${formatINR(claim.amount)} to ${providerName}`,
    },
    {
      key: 'notified',
      label: 'Notified',
      state: notifiedPaid ? 'done' : status === 'PAID' ? 'current' : 'todo',
      note: notifiedPaid
        ? `${notifiedPaid.channel === 'EMAIL' ? 'Email' : 'Message'} sent · ${formatWhen(notifiedPaid.sentAt)}`
        : 'Email when payment is done',
    },
  );
  return steps;
}

export default function ClaimTracker({ claim, providerName, notifications }) {
  const steps = buildSteps(claim, providerName, notifications);

  return (
    <ol className="tracker" aria-label={`Progress of claim ${claimLabel(claim)}`}>
      {steps.map((step) => (
        <li key={step.key} className={`tracker-step is-${step.state}`} aria-current={step.state === 'current' || step.state === 'waiting' ? 'step' : undefined}>
          <span className="tracker-bar" aria-hidden="true" />
          <span className="tracker-head">
            <span className="tracker-dot" aria-hidden="true">
              {step.state === 'done' && <CheckIcon />}
              {step.state === 'failed' && <CrossIcon />}
              {step.state === 'waiting' && <span aria-hidden="true">!</span>}
            </span>
            <span className="tracker-label">{step.label}</span>
          </span>
          <span className="tracker-note">{step.note}</span>
          <span className="visually-hidden">
            {step.state === 'done' ? '(completed)' : step.state === 'current' ? '(in progress)' : step.state === 'waiting' ? '(waiting for you)' : step.state === 'failed' ? '(failed)' : '(not started)'}
          </span>
        </li>
      ))}
    </ol>
  );
}
