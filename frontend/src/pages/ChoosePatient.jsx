import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { formatINR, initials } from '../format.js';
import { LogoMark, SearchIcon } from '../components/Icons.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import FilePicker from '../components/FilePicker.jsx';
import { toast } from '../toast.jsx';
import { useSmoothWheel } from '../smoothScroll.js';
import { IS_DEMO, resetDemoData } from '../demo/isDemo.js';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: (p) => p.policyActive },
  { id: 'inactive', label: 'Inactive', test: (p) => !p.policyActive },
  // less than a quarter of the yearly sum insured is left
  {
    id: 'low',
    label: 'Under 25% left',
    hint: 'Less than 25% of the yearly cover is left',
    test: (p) => Number(p.remainingCoverage) < 0.25 * Number(p.coverageLimit),
  },
];

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  cover: (a, b) => Number(b.remainingCoverage) - Number(a.remainingCoverage),
  newest: (a, b) => b.id - a.id,
};

/** Wraps the part of the text that matches the search in <mark>. */
function Highlight({ text = '', query }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export default function ChoosePatient() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const listRef = useRef(null);
  useSmoothWheel(listRef);

  const load = useCallback(() => {
    setError(null);
    api
      .patients()
      .then(setPatients)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const choose = (id) => {
    signIn(id);
    navigate('/');
  };

  const q = query.trim();
  const matchesQuery = (p) =>
    !q || [p.name, p.policyNumber, p.email].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
  const searched = patients?.filter(matchesQuery) ?? [];
  const shown = searched.filter(FILTERS.find((f) => f.id === filter).test).sort(SORTS[sort]);

  return (
    <main className="welcome">
      <ThemeToggle className="welcome-theme" />
      <div className="welcome-grid">
        <div className="welcome-card card">
          <div className="brand brand-large">
            <LogoMark size={40} />
            <span>ClaimFlow</span>
          </div>
          <h1>Welcome</h1>
          <p className="lead">
            {IS_DEMO
              ? 'Live demo: everything runs in your browser with sample data. Pick a patient, or set one up from a policy.'
              : 'This is a demo with no passwords. Pick a patient to see their claims.'}
          </p>
          {IS_DEMO && (
            <button type="button" className="link-button optional-toggle" onClick={resetDemoData}>
              Reset demo data
            </button>
          )}

          {error && (
            <div className="banner banner-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {!error && patients === null && <p className="muted">Loading patients…</p>}

          {patients?.length > 0 && (
            <div className="patient-tools">
              <div className="search-box">
                <SearchIcon />
                <label htmlFor="patient-search" className="visually-hidden">
                  Search patients
                </label>
                <input
                  id="patient-search"
                  type="search"
                  placeholder="Search by name, policy number or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                    ×
                  </button>
                )}
              </div>
              <div className="filter-row">
                <div className="filter-chips" role="group" aria-label="Filter patients">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="filter-chip"
                      aria-pressed={filter === f.id}
                      title={f.hint}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                      <span>{searched.filter(f.test).length}</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="patient-sort" className="visually-hidden">
                  Sort patients
                </label>
                <select id="patient-sort" className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="name">Name A–Z</option>
                  <option value="cover">Most cover left</option>
                  <option value="newest">Newest first</option>
                </select>
              </div>
            </div>
          )}

          {patients && shown.length === 0 && (
            <div className="empty-filter">
              <p className="strong">No patients match</p>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear search and filters
              </button>
            </div>
          )}

          {patients && shown.length > 0 && (
            <p className="list-count">
              Showing {shown.length} of {patients.length} patients
            </p>
          )}

          <ul className="patient-list" aria-live="polite" ref={listRef}>
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" className="patient-option" onClick={() => choose(p.id)}>
                  <span className="avatar avatar-static" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <span className="patient-option-text">
                    <span className="option-title">
                      <Highlight text={p.name} query={q} />
                    </span>
                    <span className="option-sub">
                      Policy <Highlight text={p.policyNumber} query={q} /> · {formatINR(p.remainingCoverage)} left
                    </span>
                  </span>
                  {!p.policyActive && <span className="pill pill-rejected">Inactive policy</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <SetupFromPolicy onCreated={choose} />
      </div>
    </main>
  );
}

const EMPTY = { name: '', email: '', phone: '', policyNumber: '', coverageLimit: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Auto-pickup": upload a policy PDF or photo → AI fills in the profile → check it → create. */
function SetupFromPolicy({ onCreated }) {
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const read = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrors({ file: 'Choose your policy PDF or a photo of it.' });
      return;
    }
    setReading(true);
    setErrors({});
    try {
      const profile = await api.extractProfile(file);
      setExtracted(profile);
      setForm({
        name: profile.name ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
        policyNumber: profile.policyNumber ?? '',
        coverageLimit: profile.coverageLimit ? String(profile.coverageLimit) : '',
      });
      const found = ['name', 'email', 'policyNumber', 'coverageLimit'].filter((k) => profile[k]).length;
      toast({
        type: found >= 3 ? 'success' : 'warning',
        title: found >= 3 ? 'Policy read' : 'Some details were missing',
        message: found >= 3 ? 'Check the details below and fix anything that looks wrong.' : 'Please fill in the empty fields yourself.',
      });
    } catch {
      // the red pop-up from api.js already explains what went wrong
    } finally {
      setReading(false);
    }
  };

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((err) => ({ ...err, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Enter the policy holder’s name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email. Claim updates are sent here.';
    if (!form.policyNumber.trim()) next.policyNumber = 'Enter the policy number.';
    const limit = Number(String(form.coverageLimit).replace(/,/g, ''));
    if (!(limit > 0)) next.coverageLimit = 'Enter the sum insured in rupees.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const create = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const patient = await api.createPatient({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        policyNumber: form.policyNumber.trim(),
        coverageLimit: Number(String(form.coverageLimit).replace(/,/g, '')),
      });
      // A PDF/text policy is also added to the Policy Assistant, linked to this policy number
      if (/\.(pdf|txt)$/i.test(file.name)) {
        try {
          await api.uploadPolicy(file, `${patient.name}'s policy`, patient.policyNumber);
        } catch {
          toast({ type: 'warning', title: 'Profile created', message: "But the policy couldn't be added to the assistant. Upload it there later." });
        }
      }
      toast({ type: 'success', title: `Welcome, ${patient.name.split(' ')[0]}!`, message: 'Your profile is ready.' });
      onCreated(patient.id);
    } catch {
      setSaving(false);
    }
  };

  return (
    <section className="card setup-card" aria-labelledby="setup-title">
      <span className="pill pill-approved">New · AI</span>
      <h2 id="setup-title" className="setup-title">
        Set up from your policy
      </h2>
      <p className="muted">
        Upload your policy PDF or a clear photo of it. We'll read your name, email, policy number and cover for you.
      </p>

      {!extracted && (
        <form className="stack-md" onSubmit={read} noValidate>
          <FilePicker
            file={file}
            accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            label="Choose your policy PDF or photo"
            hint="PDF, JPG or PNG · drag it here or browse"
            invalid={Boolean(errors.file)}
            onChange={(f) => {
              setFile(f);
              setErrors({});
            }}
          />
          {errors.file && <p className="field-error">{errors.file}</p>}
          <button type="submit" className="btn btn-primary" disabled={reading}>
            {reading ? 'Reading your policy…' : 'Read my policy'}
          </button>
          <p className="small muted">
            No policy handy?{' '}
            <a href="/sample-policy-schedule.pdf" download>
              Download a sample policy PDF
            </a>{' '}
            and upload it here.
          </p>
        </form>
      )}

      {extracted && (
        <form className="stack-md" onSubmit={create} noValidate>
          <p className="answer-note">{extracted.note}</p>
          <Field id="p-name" label="Full name" value={form.name} onChange={set('name')} error={errors.name} />
          <Field id="p-email" label="Email (claim updates are sent here)" type="email" value={form.email} onChange={set('email')} error={errors.email} />
          <Field id="p-phone" label="Mobile (optional)" value={form.phone} onChange={set('phone')} />
          <Field id="p-policy" label="Policy number" value={form.policyNumber} onChange={set('policyNumber')} error={errors.policyNumber} />
          <Field id="p-cover" label="Sum insured (₹)" inputMode="numeric" value={form.coverageLimit} onChange={set('coverageLimit')} error={errors.coverageLimit} />
          <div className="row-between">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setExtracted(null);
                setForm(EMPTY);
                setFile(null);
              }}
            >
              Use a different file
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create my profile'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ id, label, error, ...input }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="text-input" aria-invalid={Boolean(error)} {...input} />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
