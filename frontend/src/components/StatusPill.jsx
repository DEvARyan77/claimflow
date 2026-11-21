const LABELS = {
  SUBMITTED: 'Checking',
  UNDER_REVIEW: 'In review',
  INFO_REQUESTED: 'Info needed',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
};

export const statusLabel = (status) => LABELS[status] ?? status;

export default function StatusPill({ status }) {
  return <span className={`pill pill-${(status || '').toLowerCase().replace('_', '-')}`}>{statusLabel(status)}</span>;
}

/** Fraud risk badge for staff: LOW / MEDIUM / HIGH with the score. */
export function RiskBadge({ fraud }) {
  if (!fraud) return null;
  return (
    <span className={`risk risk-${fraud.level.toLowerCase()}`} title={`Risk score ${fraud.score} of 100`}>
      <span className="risk-dot" aria-hidden="true" />
      {fraud.level === 'LOW' ? 'Low' : fraud.level === 'MEDIUM' ? 'Medium' : 'High'} risk · {fraud.score}
    </span>
  );
}
