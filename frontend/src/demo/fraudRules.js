/**
 * The browser demo's copy of claims-service FraudRules.java: the same red flags, points and levels.
 * Dates are "YYYY-MM-DD" strings; createdAt is an ISO timestamp.
 */
const TYPICAL_COST = {
  I21: 300000, I63: 250000, J18: 80000, K35: 120000, K80: 100000, S72: 200000, H25: 40000,
  N20: 60000, A90: 50000, A01: 40000, E11: 40000, O80: 70000, C50: 500000, M17: 250000,
};

const DAY = 86_400_000;
const day = (s) => Date.UTC(...s.slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
const daysBetween = (a, b) => Math.round((day(b) - day(a)) / DAY);
export const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
export const typicalCost = (code) => (code && code.length >= 3 ? TYPICAL_COST[code.slice(0, 3).toUpperCase()] ?? null : null);

/** claim: amount, providerId, diagnosisCode, admissionDate, dischargeDate, createdAt. policy: policyStartDate, coverageLimit, usedAmount. */
export function assessFraud(claim, policy, otherClaims = []) {
  const flags = [];
  const flag = (code, label, points, detail) => flags.push({ code, label, points, detail });
  const submitted = (claim.createdAt ?? new Date().toISOString()).slice(0, 10);
  const { admissionDate: admitted, dischargeDate: discharged } = claim;
  const amount = Number(claim.amount);

  if (admitted && policy.policyStartDate && admitted >= policy.policyStartDate) {
    const days = daysBetween(policy.policyStartDate, admitted);
    if (days < 30) flag('EARLY_CLAIM', 'Soon after policy start', 30, `Admitted ${days} day${days === 1 ? '' : 's'} after cover started`);
    else if (days < 90) flag('EARLY_CLAIM', 'Soon after policy start', 15, `Admitted ${days} days after cover started`);
  }

  const typical = typicalCost(claim.diagnosisCode);
  if (typical) {
    const ratio = Math.round((amount / typical) * 100) / 100;
    if (ratio >= 3) flag('HIGH_FOR_TREATMENT', 'Bill much higher than usual', 35, `${ratio}× the usual ${inr(typical)} for ${claim.diagnosisCode}`);
    else if (ratio >= 2) flag('HIGH_FOR_TREATMENT', 'Bill higher than usual', 20, `${ratio}× the usual ${inr(typical)} for ${claim.diagnosisCode}`);
  }

  const others = otherClaims.filter((c) => c.id !== claim.id);
  const live = others.filter((c) => c.status !== 'REJECTED');
  const within30 = (c) => daysBetween(c.createdAt, submitted) <= 30;

  const dup = live.find((c) => String(c.providerId) === String(claim.providerId) && c.diagnosisCode === claim.diagnosisCode
    && within30(c) && Math.abs(Number(c.amount) - amount) / amount <= 0.02);
  if (dup) flag('POSSIBLE_DUPLICATE', 'Possible duplicate', 40, `Very similar to ${dup.claimNumber} (same hospital and treatment, ${inr(dup.amount)})`);

  if (admitted && discharged) {
    const overlap = live.find((c) => c.admissionDate && c.dischargeDate && String(c.providerId) !== String(claim.providerId)
      && c.admissionDate <= discharged && admitted <= c.dischargeDate);
    if (overlap) flag('OVERLAPPING_STAY', 'Overlapping hospital stay', 35, `Dates overlap with ${overlap.claimNumber} at another hospital`);
  }

  const recent = others.filter(within30).length;
  if (recent >= 3) flag('FREQUENT_CLAIMS', 'Many recent claims', 20, `${recent} other claims in the last 30 days`);

  const remaining = Number(policy.coverageLimit) - Number(policy.usedAmount);
  if (remaining > 0 && amount >= remaining * 0.8 && amount <= remaining) {
    flag('NEAR_LIMIT', 'Uses most of the cover', 15, `Claim is ${Math.round((amount / remaining) * 100)}% of the ${inr(remaining)} cover left`);
  }

  if (admitted && discharged) {
    const nights = Math.max(1, daysBetween(admitted, discharged));
    const perDay = Math.round(amount / nights);
    if (perDay > 150000) flag('HIGH_DAILY_COST', 'High cost per day', 15, `${inr(perDay)} per day over ${nights} day${nights === 1 ? '' : 's'}`);
  }

  if (discharged && daysBetween(discharged, submitted) > 30) {
    flag('LATE_SUBMISSION', 'Filed late', 10, `Submitted ${daysBetween(discharged, submitted)} days after discharge`);
  }

  if (amount >= 50000 && amount % 50000 === 0) flag('ROUND_AMOUNT', 'Round amount', 5, `${inr(amount)} is an exact multiple of ₹50,000`);

  const score = Math.min(100, flags.reduce((s, f) => s + f.points, 0));
  flags.sort((a, b) => b.points - a.points);
  const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  const result = { score, level, flags, assessedAt: new Date().toISOString(), aiStatus: level === 'LOW' ? 'SKIPPED' : 'OFF' };
  if (level !== 'LOW') {
    result.aiSummary = `Main concern: ${flags[0].detail}.${flags.length > 1 ? ` Also: ${flags.slice(1).map((f) => f.label.toLowerCase()).join('; ')}.` : ''} Check the hospital bills and discharge summary before deciding.`;
    result.aiRecommendation = level === 'HIGH' || score >= 45 ? 'INVESTIGATE' : 'APPROVE';
  }
  return result;
}
