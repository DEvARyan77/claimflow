const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** 435000 -> "₹4,35,000" */
export function formatINR(value) {
  const number = Number(value ?? 0);
  return rupees.format(Number.isFinite(number) ? number : 0);
}

const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 10:42" / "Yesterday, 18:20" / "18 Nov, 16:05" */
export function formatWhen(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `Today, ${time.format(date)}`;
  if (sameDay(date, yesterday)) return `Yesterday, ${time.format(date)}`;
  return `${dayMonth.format(date)}, ${time.format(date)}`;
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function firstName(name = '') {
  return name.split(' ')[0] || name;
}

/** "CLM-2026-000123" (readable claim number), or "#12" for claims made before claim numbers existed. */
export const claimLabel = (claim) => claim?.claimNumber ?? `#${claim?.id}`;

/** Same for a notification, which carries claimNumber and claimId. */
export const notificationClaimLabel = (n) => n?.claimNumber ?? `#${n?.claimId}`;
