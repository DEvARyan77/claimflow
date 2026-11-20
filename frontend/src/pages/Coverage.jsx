import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR, formatWhen, claimLabel } from '../format.js';
import StatusPill from '../components/StatusPill.jsx';

export default function Coverage() {
  const { patient } = useOutletContext();
  const [claims, setClaims] = useState([]);
  const [payments, setPayments] = useState([]);
  const [providers, setProviders] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.claimsForPatient(patient.id),
      api.paymentsForPatient(patient.id).catch(() => []),
      api.providers().catch(() => []),
    ])
      .then(([claimList, paymentList, providerList]) => {
        setClaims(claimList.filter((c) => c.status === 'APPROVED' || c.status === 'PAID'));
        setPayments(paymentList);
        setProviders(Object.fromEntries(providerList.map((p) => [p.id, p.name])));
      })
      .catch((e) => setError(e.message));
  }, [patient.id]);

  const usedPercent = Math.min(100, Math.round((Number(patient.usedAmount) / Number(patient.coverageLimit)) * 100) || 0);
  const paymentFor = (claimId) => payments.find((p) => p.claimId === claimId);

  return (
    <div className="stack-lg">
      <div>
        <h1>Your coverage</h1>
        <p className="lead">How much of your policy you've used this year, and what used it.</p>
      </div>

      <div className="coverage-layout">
        <section className="card coverage-card">
          <div className="row-between">
            <h2 className="card-title">Policy {patient.policyNumber}</h2>
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
          <dl className="facts">
            <div>
              <dt>Coverage limit</dt>
              <dd>{formatINR(patient.coverageLimit)}</dd>
            </div>
            <div>
              <dt>Used so far</dt>
              <dd>{formatINR(patient.usedAmount)}</dd>
            </div>
            <div>
              <dt>Policy holder</dt>
              <dd>{patient.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{patient.email}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2 className="card-title">What used your coverage</h2>
          {error && <p className="field-error">{error}</p>}
          {!error && claims.length === 0 && <p className="muted small">Nothing yet. Approved claims will show here.</p>}
          <ul className="usage-list">
            {claims.map((claim) => {
              const payment = paymentFor(claim.id);
              return (
                <li key={claim.id}>
                  <div>
                    <p className="usage-title">{providers[claim.providerId] ?? `Hospital #${claim.providerId}`}</p>
                    <p className="muted small">
                      Claim {claimLabel(claim)} · {claim.diagnosisCode} · {formatWhen(claim.decidedAt)}
                      {payment ? ` · ${payment.reference}` : ''}
                    </p>
                  </div>
                  <div className="usage-right">
                    <span className="usage-amount">{formatINR(claim.amount)}</span>
                    <StatusPill status={claim.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
