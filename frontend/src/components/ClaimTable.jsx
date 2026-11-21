import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { claimLabel, formatINR, formatWhen, treatmentName } from '../format.js';
import StatusPill, { RiskBadge, statusLabel } from './StatusPill.jsx';
import { SearchIcon } from './Icons.jsx';

/**
 * Searchable, filterable list of claims; each row opens /claims/:id.
 * Becomes stacked cards on phones (CSS).
 */
export default function ClaimTable({ claims, providers = {}, showRisk = false, showFilters = true, empty = 'No claims yet.' }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const statuses = useMemo(() => ['ALL', ...new Set((claims ?? []).map((c) => c.status))], [claims]);
  const q = query.trim().toLowerCase();
  const shown = (claims ?? []).filter((c) =>
    (status === 'ALL' || c.status === status) &&
    (!q || [c.claimNumber, c.patientName, c.policyNumber, treatmentName(c), providers[c.providerId]?.name]
      .some((v) => v?.toLowerCase().includes(q))));

  if (claims === null) return <p className="muted">Loading claims…</p>;

  return (
    <div className="stack-md">
      {showFilters && claims.length > 0 && (
        <div className="table-tools">
          <div className="search-box">
            <SearchIcon />
            <label htmlFor="claim-search" className="visually-hidden">Search claims</label>
            <input id="claim-search" type="search" placeholder="Search claim number, name, policy, treatment"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="filter-chips" role="group" aria-label="Filter by status">
            {statuses.map((s) => (
              <button key={s} type="button" className="filter-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === 'ALL' ? 'All' : statusLabel(s)}
                <span>{s === 'ALL' ? claims.length : claims.filter((c) => c.status === s).length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card empty-filter"><p className="muted">{claims.length === 0 ? empty : 'No claims match.'}</p></div>
      ) : (
        <div className="claim-table" role="table" aria-label="Claims">
          <div className="claim-table-head" role="row">
            <span role="columnheader">Claim</span>
            <span role="columnheader">Policyholder</span>
            <span role="columnheader">Treatment</span>
            <span role="columnheader" className="num">Amount</span>
            {showRisk && <span role="columnheader">Risk</span>}
            <span role="columnheader">Status</span>
          </div>
          {shown.map((c, i) => (
            <Link key={c.id} to={`/claims/${c.id}`} className="claim-table-row" role="row" style={{ '--i': Math.min(i, 10) }}>
              <span role="cell" className="claim-table-id">
                <strong>{claimLabel(c)}</strong>
                <span className="small muted">{c.type === 'CASHLESS' ? 'Cashless' : 'Reimbursement'} · {formatWhen(c.createdAt)}</span>
              </span>
              <span role="cell">
                {c.patientName ?? '—'}
                <span className="small muted">{c.policyNumber}</span>
              </span>
              <span role="cell">
                {treatmentName(c)}
                <span className="small muted">{providers[c.providerId]?.name ?? ''}</span>
              </span>
              <span role="cell" className="num strong">{formatINR(c.amount)}</span>
              {showRisk && <span role="cell">{c.fraud ? <RiskBadge fraud={c.fraud} /> : <span className="muted small">—</span>}</span>}
              <span role="cell"><StatusPill status={c.status} /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small number tiles at the top of dashboards. */
export function StatTiles({ tiles }) {
  return (
    <div className="stat-tiles">
      {tiles.map((t, i) => (
        <div key={t.label} className={`card stat-tile${t.tone ? ` stat-${t.tone}` : ''}`} style={{ '--i': i }}>
          <span className="stat-value">{t.value}</span>
          <span className="stat-label">{t.label}</span>
          {t.sub && <span className="small muted">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export const providerMap = (list) => Object.fromEntries((list ?? []).map((p) => [p.id, p]));
