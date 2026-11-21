import { useState } from 'react';
import { api } from '../api.js';
import { formatWhen } from '../format.js';
import { toast } from '../toast.jsx';

const ACTION_TEXT = {
  APPROVE: { text: 'Approved' },
  REJECT: { text: 'Rejected' },
  REQUEST_INFO: { text: 'Asked for information' },
  INFO_ADDED: { text: 'Replied' },
  NOTE: { text: 'Internal note' },
};

/** The conversation between the claims team and the policyholder / hospital, oldest first. */
export default function ReviewThread({ notes }) {
  if (!notes?.length) return null;
  return (
    <ol className="thread" aria-label="Review history">
      {notes.map((n, i) => {
        const a = ACTION_TEXT[n.action] ?? { text: n.action };
        const mine = n.action === 'INFO_ADDED';
        return (
          <li key={i} className={`thread-item${mine ? ' is-reply' : ''}${n.action === 'NOTE' ? ' is-internal' : ''}`} style={{ '--i': i }}>
            <span className={`thread-icon thread-${n.action.toLowerCase()}`} aria-hidden="true" />
            <div className="thread-bubble">
              <p className="thread-meta">
                <strong>{n.byName ?? 'Claims team'}</strong> · {a.text} · {formatWhen(n.at)}
              </p>
              {n.note && <p>{n.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Shown to the policyholder / hospital while the officer is waiting for more information. */
export function ReplyBox({ claim, onReplied }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const question = claim.reason?.replace(/^More information needed:\s*/, '');

  const send = async (e) => {
    e.preventDefault();
    if (text.trim().length < 3) {
      setError('Write your reply.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.replyToClaim(claim.id, text.trim());
      toast({ type: 'success', title: 'Reply sent', message: 'The claims team will pick it up from here.' });
      setText('');
      onReplied?.(updated);
    } catch {
      // pop-up already shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card reply-box" onSubmit={send} noValidate>
      <p className="strong">The claims team needs more information</p>
      {question && <p className="reply-question">“{question}”</p>}
      <label htmlFor="reply" className="visually-hidden">Your reply</label>
      <textarea id="reply" rows="3" maxLength="1000" placeholder="e.g. The discharge summary is attached at the hospital desk; the surgery was an emergency."
        value={text} onChange={(e) => { setText(e.target.value); setError(null); }} aria-invalid={Boolean(error)} />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-pill" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
    </form>
  );
}
