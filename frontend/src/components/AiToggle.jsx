import { useSyncExternalStore } from 'react';
import { IS_DEMO } from '../demo/isDemo.js';
import { API_URL, aiOff, setAiOff, subscribeAi } from '../demo/aiClient.js';
import { toast } from '../toast.jsx';

/** Live AI on/off. Off = RAG only: answers are built from the policy clauses found in the browser, no Gemini. */
export function useAiOff() {
  return useSyncExternalStore(subscribeAi, aiOff, () => false);
}

export default function AiToggle() {
  const off = useAiOff();
  if (!IS_DEMO || !API_URL) return null;

  const flip = () => {
    setAiOff(!off);
    toast(
      off
        ? { type: 'success', title: 'Live AI on', message: 'Gemini writes the answers, using only your policy clauses.' }
        : { type: 'info', title: 'Live AI off', message: 'RAG only: answers come straight from your policy clauses. Photos need AI.' },
    );
  };

  return (
    <button
      type="button"
      className={`ai-toggle${off ? ' is-off' : ''}`}
      role="switch"
      aria-checked={!off}
      onClick={flip}
      title={off ? 'Live AI is off (RAG only). Click to turn it on.' : 'Live AI is on. Click to use RAG only.'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
      </svg>
      <span className="ai-toggle-label">AI</span>
      <span className="ai-toggle-track" aria-hidden="true">
        <span className="ai-toggle-thumb" />
      </span>
      <span className="visually-hidden">{off ? 'Live AI off' : 'Live AI on'}</span>
    </button>
  );
}
