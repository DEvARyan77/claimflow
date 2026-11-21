import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * A friendly date picker instead of the browser's <input type="date">:
 * a button that opens a month calendar (pick month/year quickly, keyboard arrows work).
 * value / min / max are "YYYY-MM-DD" strings (what the API expects), in local time.
 */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayIso = () => toIso(new Date());
export const addDays = (iso, days) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

const pretty = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** "2026-11-21" → "21 Nov 2026" */
export const formatDate = (iso) => (iso ? pretty.format(fromIso(iso)) : '');

export default function DatePicker({ id, value, onChange, min, max, placeholder = 'Choose a date', invalid, describedBy }) {
  const autoId = useId();
  const buttonId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('days'); // days | months | years
  const start = fromIso(value) ?? fromIso(max && max < todayIso() ? max : todayIso());
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [focus, setFocus] = useState(value ?? toIso(start));
  const rootRef = useRef(null);
  const gridRef = useRef(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // keep the focused day visible and focused
  useEffect(() => {
    if (!open || mode !== 'days') return;
    const d = fromIso(focus);
    if (d.getFullYear() !== view.year || d.getMonth() !== view.month) setView({ year: d.getFullYear(), month: d.getMonth() });
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-day="${focus}"]`)?.focus());
  }, [focus, open, mode, view.year, view.month]);

  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);

  const days = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(view.year, view.month, 1 - offset + i);
      cells.push({ iso: toIso(d), day: d.getDate(), outside: d.getMonth() !== view.month });
    }
    // drop a last row that is entirely next month
    return cells.slice(35).every((c) => c.outside) ? cells.slice(0, 35) : cells;
  }, [view]);

  const toggle = () => {
    if (!open) {
      const s = fromIso(value) ?? start;
      setView({ year: s.getFullYear(), month: s.getMonth() });
      setFocus(toIso(s));
      setMode('days');
    }
    setOpen((o) => !o);
  };

  const pick = (iso) => {
    if (!allowed(iso)) return;
    onChange(iso);
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  const shiftMonth = (delta) => setView(({ year, month }) => {
    const d = new Date(year, month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const onGridKey = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      setFocus((f) => addDays(f, moves[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const d = fromIso(focus);
      d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
      setFocus(toIso(d));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focus);
    } else if (e.key === 'Escape') {
      setOpen(false);
      document.getElementById(buttonId)?.focus();
    }
  };

  const minYear = min ? fromIso(min).getFullYear() : view.year - 100;
  const maxYear = max ? fromIso(max).getFullYear() : view.year + 10;
  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);
  const today = todayIso();

  return (
    <div className="datepicker" ref={rootRef}>
      <button
        type="button"
        id={buttonId}
        className={`datepicker-button${value ? '' : ' is-empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={toggle}
      >
        <CalendarIcon />
        <span>{value ? formatDate(value) : placeholder}</span>
      </button>

      {open && (
        <div className="datepicker-pop" role="dialog" aria-label="Choose a date" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="datepicker-head">
            <button type="button" className="datepicker-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)} disabled={mode !== 'days'}>
              ‹
            </button>
            <div className="datepicker-title">
              <button type="button" onClick={() => setMode(mode === 'months' ? 'days' : 'months')} aria-pressed={mode === 'months'}>
                {MONTHS[view.month]}
              </button>
              <button type="button" onClick={() => setMode(mode === 'years' ? 'days' : 'years')} aria-pressed={mode === 'years'}>
                {view.year}
              </button>
            </div>
            <button type="button" className="datepicker-nav" aria-label="Next month" onClick={() => shiftMonth(1)} disabled={mode !== 'days'}>
              ›
            </button>
          </div>

          {mode === 'days' && (
            <div className="datepicker-body" key={`${view.year}-${view.month}`}>
              <div className="datepicker-weekdays" aria-hidden="true">
                {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
              </div>
              <div className="datepicker-grid" role="grid" ref={gridRef} onKeyDown={onGridKey}>
                {days.map((c) => (
                  <button
                    type="button"
                    key={c.iso}
                    data-day={c.iso}
                    role="gridcell"
                    tabIndex={c.iso === focus ? 0 : -1}
                    className={`datepicker-day${c.outside ? ' is-outside' : ''}${c.iso === value ? ' is-selected' : ''}${c.iso === today ? ' is-today' : ''}`}
                    aria-selected={c.iso === value}
                    aria-label={formatDate(c.iso)}
                    disabled={!allowed(c.iso)}
                    onClick={() => pick(c.iso)}
                  >
                    {c.day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'months' && (
            <div className="datepicker-months">
              {MONTHS.map((m, i) => (
                <button
                  type="button"
                  key={m}
                  className={i === view.month ? 'is-selected' : ''}
                  onClick={() => {
                    setView((v) => ({ ...v, month: i }));
                    setMode('days');
                  }}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {mode === 'years' && (
            <div className="datepicker-years">
              {years.map((y) => (
                <button
                  type="button"
                  key={y}
                  className={y === view.year ? 'is-selected' : ''}
                  ref={y === view.year ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
                  onClick={() => {
                    setView((v) => ({ ...v, year: y }));
                    setMode('months');
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <div className="datepicker-foot">
            {allowed(today) && (
              <button type="button" className="link-button" onClick={() => pick(today)}>
                Today
              </button>
            )}
            {value && (
              <button type="button" className="link-button" onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
