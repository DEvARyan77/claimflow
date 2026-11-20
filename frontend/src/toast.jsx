import { useEffect, useState } from 'react';

/**
 * Pop-up notifications ("toasts") in the top-right corner.
 * Call toast({ type, title, message }) from anywhere, even outside React components (api.js does).
 * type: success (green) · error (red) · warning (amber) · info (indigo)
 */
const listeners = new Set();

export function toast({ type = 'info', title, message }) {
  listeners.forEach((listener) => listener({ type, title, message }));
}

const ICONS = {
  success: <path d="M4 10.5l4 4 8-9" />,
  error: <path d="M6 6l8 8M14 6l-8 8" />,
  warning: <path d="M10 4v7M10 15v.5" />,
  info: <path d="M10 9v6M10 5v.5" />,
};

let nextId = 1;

export function ToastViewport() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const timers = new Set();
    const add = (item) => {
      const id = nextId++;
      setItems((current) => {
        // the same toast already on screen? don't stack duplicates
        if (current.some((t) => t.title === item.title && t.message === item.message)) return current;
        return [...current, { ...item, id }].slice(-4);
      });
      const timer = setTimeout(() => {
        setItems((current) => current.filter((t) => t.id !== id));
        timers.delete(timer);
      }, item.type === 'error' ? 9000 : 6000);
      timers.add(timer);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
      timers.forEach(clearTimeout);
    };
  }, []);

  const dismiss = (id) => setItems((current) => current.filter((t) => t.id !== id));

  return (
    <div className="toast-viewport" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[t.type] ?? ICONS.info}
            </svg>
          </span>
          <div className="toast-text">
            {t.title && <strong>{t.title}</strong>}
            {t.message && <span>{t.message}</span>}
          </div>
          <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
