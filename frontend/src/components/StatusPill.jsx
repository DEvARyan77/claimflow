const LABELS = {
  SUBMITTED: 'Checking',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
};

export default function StatusPill({ status }) {
  return <span className={`pill pill-${(status || '').toLowerCase()}`}>{LABELS[status] ?? status}</span>;
}
