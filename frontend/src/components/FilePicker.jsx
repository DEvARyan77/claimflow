import { useId, useRef, useState } from 'react';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A good-looking replacement for <input type="file">: click to browse or drag a file onto it.
 * The real input is still there (visually hidden), so keyboard and screen readers work.
 */
export default function FilePicker({ file, onChange, accept, label, hint, invalid }) {
  const id = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pick = (chosen) => onChange(chosen ?? null);

  const clear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = '';
    pick(null);
  };

  return (
    <label
      htmlFor={id}
      className={`file-drop${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}${invalid ? ' is-invalid' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="visually-hidden"
        accept={accept}
        aria-label={label}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <span className="file-drop-icon" aria-hidden="true">
        {file ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 14l2 2 4-4" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
      </span>
      <span className="file-drop-text">
        <span className="file-drop-title">{file ? file.name : label}</span>
        <span className="file-drop-sub">{file ? `${formatSize(file.size)} · ready` : hint}</span>
      </span>
      {file ? (
        <button type="button" className="file-drop-remove" onClick={clear} aria-label={`Remove ${file.name}`}>
          ×
        </button>
      ) : (
        <span className="file-drop-action" aria-hidden="true">
          Browse
        </span>
      )}
    </label>
  );
}
