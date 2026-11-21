import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { EMAIL_PATTERN, formatWhen, initials, ROLE_NAMES } from '../../format.js';
import { toast } from '../../toast.jsx';
import { SearchIcon } from '../../components/Icons.jsx';

const ROLES = ['ALL', 'POLICYHOLDER', 'HOSPITAL', 'OFFICER', 'ADMIN'];
const EMPTY = { name: '', email: '', alternateEmail: '', password: '', role: 'OFFICER', providerId: '' };

/** Admin: every account, switch accounts off/on, and create hospital / officer / admin accounts. */
export default function People() {
  const { user: me } = useOutletContext();
  const [users, setUsers] = useState(null);
  const [providers, setProviders] = useState([]);
  const [role, setRole] = useState('ALL');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.users().then(setUsers).catch((e) => setError(e.message));
    api.providers({ quiet: true }).then(setProviders).catch(() => {});
  }, []);

  const toggle = async (u) => {
    try {
      const updated = await api.setUserActive(u.id, !u.active);
      setUsers((list) => list.map((x) => (x.id === u.id ? updated : x)));
      toast({ type: updated.active ? 'success' : 'info', title: `${u.name} ${updated.active ? 'can sign in again' : 'is switched off'}` });
    } catch {
      // pop-up shown
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => (role === 'ALL' || u.role === role) && (!q || [u.name, u.email].some((v) => v?.toLowerCase().includes(q))));
  const hospitalName = (id) => providers.find((p) => String(p.id) === String(id))?.name;

  return (
    <div className="stack-lg">
      <div>
        <h1>People</h1>
        <p className="lead">Everyone who can sign in. Policyholders sign up themselves; you create staff and hospital accounts.</p>
      </div>
      {error && <div className="banner banner-error" role="alert"><p>{error}</p></div>}

      <div className="detail-layout">
        <section className="stack-md detail-main">
          <div className="table-tools">
            <div className="search-box">
              <SearchIcon />
              <label htmlFor="people-search" className="visually-hidden">Search people</label>
              <input id="people-search" type="search" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="filter-chips" role="group" aria-label="Filter by role">
              {ROLES.map((r) => (
                <button key={r} type="button" className="filter-chip" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'ALL' ? 'All' : ROLE_NAMES[r]}
                  <span>{(users ?? []).filter((u) => r === 'ALL' || u.role === r).length}</span>
                </button>
              ))}
            </div>
          </div>
          {users === null && !error && <p className="muted">Loading accounts…</p>}
          <ul className="people-list">
            {shown.map((u, i) => (
              <li key={u.id} className={`card person${u.active ? '' : ' is-off'}`} style={{ '--i': Math.min(i, 10) }}>
                <span className="avatar avatar-static" aria-hidden="true">{initials(u.name)}</span>
                <span className="person-text">
                  <strong>{u.name}</strong>
                  <span className="small muted">{u.email}{u.alternateEmail && ` · copy to ${u.alternateEmail}`}</span>
                  <span className="small muted">
                    {u.role === 'HOSPITAL' && hospitalName(u.providerId) ? `${hospitalName(u.providerId)} · ` : ''}
                    {u.lastLoginAt ? `Last signed in ${formatWhen(u.lastLoginAt).toLowerCase()}` : 'Never signed in'}
                  </span>
                </span>
                <span className={`role-chip role-${u.role.toLowerCase()}`}>{ROLE_NAMES[u.role]}</span>
                {u.id !== me.id && (
                  <button type="button" className={`switch${u.active ? ' is-on' : ''}`} role="switch" aria-checked={u.active}
                    aria-label={`${u.name} can sign in`} onClick={() => toggle(u)}>
                    <span />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <aside className="detail-side">
          <CreateStaff providers={providers} onCreated={(u) => setUsers((list) => [u, ...(list ?? [])])} />
        </aside>
      </div>
    </div>
  );
}

function CreateStaff({ providers, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter the name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email.';
    if (form.alternateEmail.trim() && !EMAIL_PATTERN.test(form.alternateEmail.trim())) next.alternateEmail = 'Enter a valid email, or leave it empty.';
    if (form.password.length < 8) next.password = 'At least 8 characters.';
    if (form.role === 'HOSPITAL' && !form.providerId) next.providerId = 'Choose the hospital.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const u = await api.createStaff({
        name: form.name.trim(), email: form.email.trim(), alternateEmail: form.alternateEmail.trim() || null,
        password: form.password, role: form.role, providerId: form.role === 'HOSPITAL' ? form.providerId : null,
      });
      toast({ type: 'success', title: `Account created for ${u.name}`, message: 'They’ll get a welcome email. Share the password with them yourself.' });
      onCreated(u);
      setForm(EMPTY);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form stack-md" onSubmit={save} noValidate>
      <h2 className="card-title">Create a staff account</h2>
      {errors.form && <div className="banner banner-error" role="alert"><p>{errors.form}</p></div>}
      <div className="segmented segmented-3" role="radiogroup" aria-label="Role">
        {['OFFICER', 'HOSPITAL', 'ADMIN'].map((r) => (
          <button key={r} type="button" role="radio" aria-checked={form.role === r} onClick={() => setForm((f) => ({ ...f, role: r }))}>
            {r === 'OFFICER' ? 'Officer' : r === 'HOSPITAL' ? 'Hospital' : 'Admin'}
          </button>
        ))}
      </div>
      {form.role === 'HOSPITAL' && (
        <div className="field">
          <label htmlFor="s-hosp">Hospital</label>
          <select id="s-hosp" value={form.providerId} onChange={set('providerId')} aria-invalid={Boolean(errors.providerId)}>
            <option value="">Choose…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.city}</option>)}
          </select>
          {errors.providerId && <p className="field-error">{errors.providerId}</p>}
        </div>
      )}
      {[['name', 'Name', 'text'], ['email', 'Email', 'email'], ['alternateEmail', 'Alternate email (optional)', 'email'], ['password', 'Starting password', 'text']].map(([k, label, type]) => (
        <div className="field" key={k}>
          <label htmlFor={`s-${k}`}>{label}</label>
          <input id={`s-${k}`} className="text-input" type={type} value={form[k]} onChange={set(k)} aria-invalid={Boolean(errors[k])} autoComplete="off" />
          {errors[k] && <p className="field-error">{errors[k]}</p>}
        </div>
      ))}
      <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
    </form>
  );
}
