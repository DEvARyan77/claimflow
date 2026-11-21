import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { formatINR } from '../../format.js';
import { statusLabel } from '../../components/StatusPill.jsx';
import ClaimTable, { providerMap, StatTiles } from '../../components/ClaimTable.jsx';

const ORDER = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'PAID', 'REJECTED'];

/** Admin dashboard: how claims are flowing, the fraud mix, and shortcuts. */
export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState(null);
  const [users, setUsers] = useState([]);
  const [providers, setProviders] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api.claimStats().then(setStats).catch((e) => setError(e.message));
    api.reviewQueue({ quiet: true }).then(setQueue).catch(() => setQueue([]));
    api.users({ quiet: true }).then(setUsers).catch(() => {});
    api.providers({ quiet: true }).then((l) => setProviders(providerMap(l))).catch(() => {});
  }, []);

  const bucket = (s) => stats?.byStatus?.[s] ?? { count: 0, amount: 0 };
  const paid = bucket('PAID');
  const max = Math.max(1, ...ORDER.map((s) => bucket(s).count));
  const risk = stats?.byRisk ?? {};
  const riskTotal = (risk.LOW ?? 0) + (risk.MEDIUM ?? 0) + (risk.HIGH ?? 0) || 1;
  const autoRate = stats?.total ? Math.round(((risk.LOW ?? 0) / riskTotal) * 100) : 0;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lead">How claims are moving through ClaimFlow.</p>
        </div>
        <div className="row-gap">
          <Link to="/people" className="btn btn-secondary btn-pill">Add staff</Link>
          <Link to="/hospitals" className="btn btn-secondary btn-pill">Add hospital</Link>
        </div>
      </div>
      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}

      <StatTiles tiles={[
        { label: 'Claims', value: stats?.total ?? '…' },
        { label: 'Paid to hospitals', value: formatINR(paid.amount), sub: `${paid.count} claims`, tone: 'good' },
        { label: 'Decided automatically', value: `${autoRate}%`, sub: 'low-risk claims' },
        { label: 'Waiting for review', value: queue?.length ?? '…', tone: queue?.length ? 'warn' : undefined },
        { label: 'Accounts', value: users.length || '…' },
      ]} />

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Claims by status</h2>
          <ul className="bar-list">
            {ORDER.map((s, i) => (
              <li key={s} style={{ '--i': i }}>
                <span className="bar-label">{statusLabel(s)}</span>
                <span className="bar-track"><span className={`bar-fill bar-${s.toLowerCase().replace('_', '-')}`} style={{ width: `${(bucket(s).count / max) * 100}%` }} /></span>
                <span className="bar-value">{bucket(s).count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="card-title">Fraud check results</h2>
          <div className="risk-split" role="img" aria-label={`Low ${risk.LOW ?? 0}, medium ${risk.MEDIUM ?? 0}, high ${risk.HIGH ?? 0}`}>
            {['LOW', 'MEDIUM', 'HIGH'].map((l) => (
              <span key={l} className={`risk-split-${l.toLowerCase()}`} style={{ flexGrow: risk[l] ?? 0 }} />
            ))}
          </div>
          <ul className="legend">
            <li><i className="risk-split-low" /> Low risk · {risk.LOW ?? 0} <span className="muted small">auto-decided</span></li>
            <li><i className="risk-split-medium" /> Medium · {risk.MEDIUM ?? 0} <span className="muted small">officer review</span></li>
            <li><i className="risk-split-high" /> High · {risk.HIGH ?? 0} <span className="muted small">officer review, first</span></li>
          </ul>
        </section>
      </div>

      <section className="stack-md">
        <h2 className="section-title">Review queue</h2>
        <ClaimTable claims={queue} providers={providers} showRisk showFilters={false} empty="Nothing waiting for review." />
      </section>
    </div>
  );
}
