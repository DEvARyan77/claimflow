import { useState } from 'react';

const VERDICTS = [
  { text: 'LIKELY COVERED', tone: 'good', label: 'Likely covered' },
  { text: 'PARTLY COVERED', tone: 'warn', label: 'Partly covered' },
  { text: 'NOT COVERED', tone: 'bad', label: 'Not covered' },
  { text: 'NOT STATED IN POLICY', tone: 'neutral', label: 'Not stated in policy' },
];

/** Finds "LIKELY COVERED" etc. at the start of a pre-check answer and removes it from the text. */
function splitVerdict(text) {
  const start = text.replace(/^[\s*#>-]+/, '');
  const verdict = VERDICTS.find((v) => start.toUpperCase().startsWith(v.text));
  if (!verdict) return { verdict: null, body: text };
  const body = start.slice(verdict.text.length).replace(/^[\s*:.\-–—]+/, '');
  return { verdict, body };
}

/** Renders **bold**, [1] citations and "- " bullet lines from the model's plain-text answer. */
function RichText({ text }) {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) blocks.push({ type: 'ul', items: bullets });
    bullets = [];
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return flush();
    const bullet = line.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (bullet) bullets.push(bullet[2]);
    else {
      flush();
      blocks.push({ type: 'p', text: line.replace(/^#+\s*/, '') });
    }
  });
  flush();

  const inline = (value) =>
    value.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (/^\[\d+\]$/.test(part)) return <sup key={i} className="cite">{part.slice(1, -1)}</sup>;
      return part;
    });

  return (
    <div className="rich-text">
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}

function SourceItem({ source }) {
  const [open, setOpen] = useState(false);
  const long = source.excerpt.length > 260;
  const shown = open || !long ? source.excerpt : `${source.excerpt.slice(0, 260)}…`;
  return (
    <li className="source">
      <div className="source-head">
        <span className="source-number">{source.number}</span>
        <span className="source-where">
          {source.documentTitle} · page {source.page}
        </span>
      </div>
      <p className="source-text">{shown}</p>
      {long && (
        <button type="button" className="link-button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Show full clause'}
        </button>
      )}
    </li>
  );
}

export default function AnswerCard({ answer, question, showVerdict = false }) {
  const written = answer.mode === 'ai' || answer.mode === 'demo';
  const { verdict, body } = showVerdict && written ? splitVerdict(answer.answer) : { verdict: null, body: answer.answer };
  const badge = answer.mode === 'ai' ? 'AI answer · Gemini · cites your policy' : answer.mode === 'demo' ? 'Prepared answer · cites the policy' : 'Search only';

  return (
    <article className="card answer-card">
      {question && <p className="answer-question">{question}</p>}
      <div className="answer-meta">
        <span className={`pill ${written ? 'pill-approved' : 'pill-neutral'}`}>{badge}</span>
        {verdict && <span className={`verdict verdict-${verdict.tone}`}>{verdict.label}</span>}
      </div>
      {answer.note && <p className="answer-note">{answer.note}</p>}
      <RichText text={body} />
      {answer.sources?.length > 0 && (
        <details className="sources" open={!written}>
          <summary>
            {written ? `Sources from your policy (${answer.sources.length})` : 'Matching clauses'}
          </summary>
          <ol className="source-list">
            {answer.sources.map((s) => (
              <SourceItem key={s.number} source={s} />
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
