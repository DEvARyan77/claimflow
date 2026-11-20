import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useMediaQuery } from '../useMediaQuery.js';
import AnswerCard from './AnswerCard.jsx';

/**
 * Chat with the Policy Assistant about the claim being filled in.
 *  - big screens: a panel next to the form
 *  - phones: a round chat button in the bottom-right corner that opens the chat as a sheet
 * Each question is sent with a short summary of the claim, so "is this covered?" means THIS claim.
 */
export default function ClaimChat({ documentId, claimContext, diagnosisLabel }) {
  const isPhone = useMediaQuery('(max-width: 899px)');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const [unread, setUnread] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const floating = isPhone;
  const visible = !floating || open;

  useEffect(() => {
    if (visible) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, asking, visible]);

  // Phone sheet: focus the input when it opens, close with Escape, stop the page behind from scrolling
  useEffect(() => {
    if (!floating || !open) return undefined;
    setUnread(false);
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [floating, open]);

  const suggestions = [
    diagnosisLabel ? `Is ${diagnosisLabel.toLowerCase()} treatment covered?` : 'Is my treatment covered?',
    'Is there a waiting period for this?',
    'What is the room rent limit?',
    'Will I have to pay anything myself?',
  ];

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q) {
      setError('Type a question first.');
      return;
    }
    if (!documentId) {
      setError('No policy document found yet. Upload one on the Policy assistant page.');
      return;
    }
    setError(null);
    setAsking(true);
    setQuestion('');
    const id = Date.now();
    setMessages((m) => [...m, { id, question: q }]);
    try {
      const full = claimContext ? `My claim: ${claimContext}.\nQuestion: ${q}` : q;
      const answer = await api.askPolicy(full, documentId);
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, answer } : msg)));
    } catch (e) {
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, failed: e.message } : msg)));
    } finally {
      setAsking(false);
      setUnread(true);
    }
  };

  const panel = (
    <section className="card claim-chat" aria-labelledby="claim-chat-title">
      <div className="claim-chat-head">
        <div>
          <h2 id="claim-chat-title" className="card-title">
            Ask about this claim
          </h2>
          {claimContext && <p className="small muted">About: {claimContext}</p>}
        </div>
        {floating && (
          <button type="button" className="chat-close" aria-label="Close chat" onClick={() => setOpen(false)}>
            ×
          </button>
        )}
      </div>

      <div className="claim-chat-body" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="small muted">Your policy, answered in plain English, with the page it comes from.</p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip-button" onClick={() => ask(s)} disabled={asking}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="chat-turn">
            <p className="chat-question">{m.question}</p>
            {m.answer && <AnswerCard answer={m.answer} />}
            {m.failed && <p className="field-error">{m.failed}</p>}
            {!m.answer && !m.failed && <p className="small muted chat-typing">Reading your policy…</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="claim-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <label htmlFor="claim-chat-question" className="visually-hidden">
          Your question
        </label>
        <input
          ref={inputRef}
          id="claim-chat-question"
          type="text"
          maxLength={400}
          placeholder="Ask anything about your cover…"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error) setError(null);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={asking}>
          Ask
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
    </section>
  );

  if (!floating) return <div className="chat-dock">{panel}</div>;

  return (
    <>
      <button
        type="button"
        className={`chat-fab${open ? ' is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Ask the AI about this claim"
        aria-expanded={open}
        aria-controls="claim-chat-sheet"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
          <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
        </svg>
        <span className="chat-fab-label">Ask AI</span>
        {unread && !open && <span className="chat-fab-dot" aria-label="New answer" />}
      </button>

      <div className={`chat-backdrop${open ? ' is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        id="claim-chat-sheet"
        className={`chat-sheet${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-chat-title"
        inert={!open}
      >
        {panel}
      </div>
    </>
  );
}
