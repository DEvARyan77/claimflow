import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { formatWhen } from '../format.js';
import { defaultDocumentFor, documentsFor } from '../policyDocs.js';
import AnswerCard from '../components/AnswerCard.jsx';
import { toast } from '../toast.jsx';
import FilePicker from '../components/FilePicker.jsx';
import { useAiOff } from '../components/AiToggle.jsx';

const SUGGESTIONS = [
  'Is cataract surgery covered?',
  'What is the waiting period for pre-existing diseases?',
  'Is there a limit on room rent?',
  'What is not covered by my policy?',
  'Do I have to pay anything myself (co-payment)?',
  'How do I make a cashless claim?',
];

export default function PolicyAssistant() {
  const { patient } = useOutletContext();
  const [documents, setDocuments] = useState(null);
  const [documentId, setDocumentId] = useState(null);
  const [status, setStatus] = useState(null);
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const inputRef = useRef(null);
  const bodyRef = useRef(null);
  const chatRef = useRef(null);
  const lastTurnRef = useRef(null);
  const aiIsOff = useAiOff();

  const loadDocuments = useCallback(async (selectId) => {
    try {
      const list = documentsFor(await api.policyDocuments(), patient);
      setDocuments(list);
      setDocumentId((current) => selectId ?? (list.some((d) => d.id === current) ? current : defaultDocumentFor(list, patient)?.id ?? null));
    } catch (e) {
      setError(e.message);
      setDocuments([]);
    }
  }, [patient]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    api.assistantStatus().then(setStatus).catch(() => setStatus(null));
  }, [aiIsOff]);

  // Newest question at the bottom, like a chat: scroll the chat (not the page) to it
  useEffect(() => {
    const body = bodyRef.current;
    const turn = lastTurnRef.current;
    if (!body) return;
    const top = turn ? turn.offsetTop - body.offsetTop - 8 : body.scrollHeight;
    body.scrollTo({ top, behavior: 'smooth' });
  }, [conversation.length, pending]);

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q) {
      setError('Type a question first.');
      inputRef.current?.focus();
      return;
    }
    setAsking(true);
    setError(null);
    setPending(q);
    setQuestion('');
    chatRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // phones: bring the whole chat into view
    try {
      const answer = await api.askPolicy(q, documentId);
      setConversation((items) => [...items, { id: Date.now(), question: q, answer }]);
    } catch (e) {
      setError(e.message);
      setQuestion(q);
    } finally {
      setPending(null);
      setAsking(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const selected = documents?.find((d) => d.id === documentId);

  return (
    <div className="stack-lg">
      <div>
        <h1>Policy assistant</h1>
        <p className="lead">
          Your AI representative reads your policy so you don't have to. Every answer shows the exact page it came from.
        </p>
      </div>

      <div className="hero assistant-hero">
        <section className="hero-main">
          <div className="card assistant-chat" ref={chatRef}>
            <div className="assistant-chat-head">
              <p className="ask-label">Ask about {selected ? selected.title : 'your policy'}</p>
              <span className={`pill ${aiIsOff ? 'pill-neutral' : 'pill-paid'}`}>{aiIsOff ? 'RAG only' : 'AI + RAG'}</span>
            </div>

            <div className="assistant-chat-body" ref={bodyRef} aria-live="polite">
              {conversation.length === 0 && !pending && (
                <div className="chat-empty">
                  <p className="small muted">Try one of these, or type your own question below.</p>
                  <div className="suggestions" aria-label="Suggested questions">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" className="chip-button" onClick={() => ask(s)} disabled={asking || !documentId}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="callout">
                    <strong>Tip: </strong>Before you submit a claim, use <em>Check compliance</em> on the New claim page
                    to see waiting periods, sub-limits and exclusions that may apply.
                  </div>
                </div>
              )}
              {conversation.map((item, i) => (
                <div key={item.id} className="chat-turn" ref={!pending && i === conversation.length - 1 ? lastTurnRef : undefined}>
                  <p className="chat-question">{item.question}</p>
                  <AnswerCard answer={item.answer} />
                </div>
              ))}
              {pending && (
                <div className="chat-turn" ref={lastTurnRef}>
                  <p className="chat-question">{pending}</p>
                  <p className="small muted chat-typing">Reading your policy</p>
                </div>
              )}
            </div>

            <form
              className="assistant-chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <label htmlFor="question" className="visually-hidden">
                Your question
              </label>
              <div className="ask-row">
                <input
                  id="question"
                  ref={inputRef}
                  type="text"
                  maxLength={500}
                  autoComplete="off"
                  placeholder="e.g. Is knee replacement covered, and how much will they pay?"
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={Boolean(error)}
                />
                <button type="submit" className="btn btn-primary" disabled={asking || !documentId}>
                  {asking ? 'Reading…' : 'Ask'}
                </button>
              </div>
              {error && <p className="field-error">{error}</p>}
            </form>
          </div>
        </section>

        <aside className="hero-side">
          <div className="card docs-card">
            <h2 className="card-title">Policy documents</h2>
            {documents === null && <p className="muted small">Loading…</p>}
            {documents?.length === 0 && <p className="muted small">No documents yet.</p>}
            {documents?.some((d) => d.sample) && (
              <p className="small muted">You haven't uploaded your own policy yet, so you're seeing a sample. Upload yours below.</p>
            )}
            <div className="doc-list" role="radiogroup" aria-label="Policy document to ask about">
              {documents?.map((d) => (
                <label key={d.id} className={`doc-option${d.id === documentId ? ' is-selected' : ''}`}>
                  <input type="radio" name="document" checked={d.id === documentId} onChange={() => setDocumentId(d.id)} />
                  <span className="doc-option-body">
                    <span className="option-title">{d.title}</span>
                    <span className="option-sub">
                      {d.pages} pages · {d.sample ? 'Sample policy' : `Uploaded ${formatWhen(d.uploadedAt)}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <UploadPolicy patient={patient} onUploaded={(doc) => loadDocuments(doc.id)} />
          </div>

          <div className="card status-card">
            <h2 className="card-title">How answers are made</h2>
            {status ? (
              <p className="small">
                {status.aiOff ? (
                  <>
                    <strong>Live AI off · RAG only.</strong> Your question is matched to the most relevant clauses of your
                    policy right in your browser, and the answer is built from those clauses without AI. Turn AI on in
                    the top bar to let Gemini write the answers.
                  </>
                ) : status.provider === 'demo' && status.waking ? (
                  <>
                    <strong>Live AI is waking up.</strong> The free server sleeps when nobody uses it and takes about a
                    minute to start. Until then, answers are prepared ones that cite the exact clauses.
                  </>
                ) : status.provider === 'demo' ? (
                  <>
                    <strong>Demo site.</strong> Common questions get prepared answers that cite the exact clauses of the
                    sample policy; other questions show the best-matching clauses. The full app sends those clauses to
                    Gemini, which writes the answer.
                  </>
                ) : status.aiEnabled ? (
                  <>
                    <strong>AI on</strong> · {status.provider} ({status.chatModel}). Your question is matched to the most
                    relevant policy clauses, and the model answers using only those clauses.
                  </>
                ) : (
                  <>
                    <strong>Search-only mode.</strong> No AI key is set, so you'll see the policy clauses that best match
                    your question. Add an API key to get written answers (see README).
                  </>
                )}
              </p>
            ) : (
              <p className="muted small">Status unavailable.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function UploadPolicy({ patient, onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Choose a PDF or .txt file first.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('The file is larger than 20 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const doc = await api.uploadPolicy(file, `${patient.name}'s policy`, patient.policyNumber);
      setMessage(`Added "${doc.title}" (${doc.pages} pages).`);
      toast({ type: 'success', title: 'Policy uploaded', message: `${doc.title} is ready. Ask anything about it.` });
      setFile(null);
      e.target.reset();
      onUploaded(doc);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="upload" onSubmit={upload}>
      <p className="small strong">Upload your own policy</p>
      <FilePicker
        file={file}
        accept=".pdf,.txt,application/pdf,text/plain"
        label="Choose your policy PDF"
        hint="PDF or .txt · drag it here or browse"
        onChange={(f) => {
          setFile(f);
          setError(null);
        }}
      />
      <button type="submit" className="btn btn-secondary" disabled={uploading}>
        {uploading ? 'Reading your policy…' : 'Upload'}
      </button>
      {error && <p className="field-error">{error}</p>}
      {message && <p className="small success">{message}</p>}
    </form>
  );
}
