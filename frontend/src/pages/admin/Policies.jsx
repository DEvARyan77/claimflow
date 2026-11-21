import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { formatINR, initials } from '../../format.js';
import { formatDate } from '../../components/DatePicker.jsx';
import { SearchIcon } from '../../components/Icons.jsx';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: (p) => p.policyActive },
  { id: 'inactive', label: 'Inactive', test: (p) => !p.policyActive },
  { id: 'low', label: 'Under 25% left', test: (p) => Number(p.remainingCoverage) < 0.25 * Number(p.coverageLimit) },
];

/** Admin: every policy and how much cover is left. */
export default function Policies() {
  const [patients, setPatients] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.patients().then(setPatients).catch((e) => setError(e.message));
  }, []);

  const q = query.trim().toLowerCase();
  const searched = (patients ?? []).filter((p) => !q || [p.name, p.policyNumber, p.email].some((v) => v?.toLowerCase().includes(q)));
  const shown = searched.filter(FILTERS.find((f) => f.id === filter).test).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack-lg">
      <div>
        <h1>Policies</h1>
        <p className="lead">{patients ? `${patients.length} policies` : 'Loading…'}</p>
      </div>
      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}
      <div className="table-tools">
        <div className="search-box">
          <SearchIcon />
          <label htmlFor="policy-search" className="visually-hidden">Search policies</label>
          <input id="policy-search" type="search" placeholder="Search by name, policy number or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="filter-chips" role="group" aria-label="Filter policies">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="filter-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<span>{searched.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="policy-grid">
        {shown.map((p, i) => {
          const used = Math.min(100, Math.round((Number(p.usedAmount) / Number(p.coverageLimit)) * 100) || 0);
          return (
            <article key={p.id} className="card policy-tile" style={{ '--i': Math.min(i, 10) }}>
              <div className="row-between">
                <span className="row-gap">
                  <span className="avatar avatar-static" aria-hidden="true">{initials(p.name)}</span>
                  <span><strong>{p.name}</strong><span className="small muted block">{p.policyNumber}</span></span>
                </span>
                {p.policyActive ? <span className="pill pill-paid">Active</span> : <span className="pill pill-rejected">Inactive</span>}
              </div>
              <p className="small muted">{p.email}{p.policyStartDate && ` · since ${formatDate(p.policyStartDate)}`}</p>
              <div className="meter" role="img" aria-label={`${used}% used`}><div className="meter-fill" style={{ width: `${used}%` }} /></div>
              <div className="row-between small">
                <span><strong>{formatINR(p.remainingCoverage)}</strong> left</span>
                <span className="muted">of {formatINR(p.coverageLimit)}</span>
              </div>
            </article>
          );
        })}
      </div>
      {patients && shown.length === 0 && <p className="muted">No policies match.</p>}
    </div>
  );
}
