import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SearchIcon } from '../components/Icons.jsx';

export default function Hospitals() {
  const [providers, setProviders] = useState(null);
  const [query, setQuery] = useState('');
  const [networkOnly, setNetworkOnly] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    if (!providers) return [];
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (networkOnly && !p.inNetwork) return false;
      if (!q) return true;
      return [p.name, p.city, ...(p.specializations ?? [])].some((text) => text.toLowerCase().includes(q));
    });
  }, [providers, query, networkOnly]);

  return (
    <div className="stack-lg">
      <div>
        <h1>Hospitals</h1>
        <p className="lead">In-network hospitals are paid directly by ClaimFlow. Claims from out-of-network hospitals are rejected.</p>
      </div>

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <span className="visually-hidden">Search hospitals</span>
          <input
            type="search"
            placeholder="Search by name, city or speciality"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={networkOnly} onChange={(e) => setNetworkOnly(e.target.checked)} />
          In-network only
        </label>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {providers === null && !error && <p className="muted">Loading hospitals…</p>}
      {providers && visible.length === 0 && <p className="muted">No hospitals match your search.</p>}

      <div className="hospital-grid">
        {visible.map((p) => (
          <article key={p.id} className="card hospital-card">
            <div className="row-between">
              <h2 className="hospital-name">{p.name}</h2>
              {p.inNetwork ? (
                <span className="pill pill-paid">In network</span>
              ) : (
                <span className="pill pill-rejected">Out of network</span>
              )}
            </div>
            <p className="muted small">
              {p.city} · {p.registrationNumber}
            </p>
            <ul className="chips" aria-label="Specialities">
              {[...(p.specializations ?? [])].sort().map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {p.inNetwork && (
              <Link to={`/new?provider=${p.id}`} className="btn btn-secondary">
                Claim for treatment here
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
