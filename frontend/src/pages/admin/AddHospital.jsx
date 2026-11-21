import { useState } from 'react';
import { api } from '../../api.js';
import { toast } from '../../toast.jsx';

const EMPTY = { name: '', city: '', registrationNumber: '', specializations: '', inNetwork: true };

/** Admin: add a hospital to the network (shown on the Hospitals page). */
export default function AddHospital({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  if (!open) {
    return <button type="button" className="btn btn-primary btn-pill self-start" onClick={() => setOpen(true)}>Add a hospital</button>;
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();
    const specs = form.specializations.split(',').map((s) => s.trim()).filter(Boolean);
    const next = {};
    if (!form.name.trim()) next.name = 'Enter the hospital name.';
    if (!form.city.trim()) next.city = 'Enter the city.';
    if (!form.registrationNumber.trim()) next.registrationNumber = 'Enter the registration number.';
    if (!specs.length) next.specializations = 'Add at least one speciality.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const p = await api.createProvider({ name: form.name.trim(), city: form.city.trim(), registrationNumber: form.registrationNumber.trim().toUpperCase(), specializations: specs, inNetwork: form.inNetwork });
      toast({ type: 'success', title: `${p.name} added`, message: 'Create a hospital account for it on the People page.' });
      onAdded(p);
      setForm(EMPTY);
      setOpen(false);
    } catch {
      // pop-up shown
    } finally {
      setSaving(false);
    }
  };

  const field = (k, label, placeholder) => (
    <div className="field">
      <label htmlFor={`h-${k}`}>{label}</label>
      <input id={`h-${k}`} className="text-input" placeholder={placeholder} value={form[k]} onChange={set(k)} aria-invalid={Boolean(errors[k])} />
      {errors[k] && <p className="field-error">{errors[k]}</p>}
    </div>
  );

  return (
    <form className="card form stack-md pop-card" onSubmit={save} noValidate>
      <h2 className="card-title">Add a hospital</h2>
      <div className="field-row">
        {field('name', 'Name', 'e.g. Medanta')}
        {field('city', 'City', 'e.g. Gurugram')}
      </div>
      <div className="field-row">
        {field('registrationNumber', 'Registration number', 'e.g. ROH-HR-1010')}
        {field('specializations', 'Specialities (comma separated)', 'Cardiology, Oncology')}
      </div>
      <label className="checkbox"><input type="checkbox" checked={form.inNetwork} onChange={set('inNetwork')} /> In network (cashless claims allowed)</label>
      <div className="row-between">
        <button type="button" className="link-button" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>{saving ? 'Adding…' : 'Add hospital'}</button>
      </div>
    </form>
  );
}
