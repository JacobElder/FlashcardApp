import { useEffect, useRef, useState } from 'react';

interface QuickCaptureProps {
  /** Queue the words; returns the ones actually added (new to the deck). */
  onCapture: (words: string[]) => string[];
  autoFocus?: boolean;
}

/** Split on commas, semicolons, and newlines so a pasted list captures every word. */
export function splitWords(text: string): string[] {
  return text.split(/[,;\n]/).map(w => w.trim()).filter(Boolean);
}

export function QuickCapture({ onCapture, autoFocus }: QuickCaptureProps) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = splitWords(text);
    if (words.length === 0) return;
    const added = onCapture(words);
    const skipped = words.length - added.length;
    setMessage(
      added.length === 0
        ? 'Already in your deck.'
        : `Saved ${added.join(', ')}. ${added.length === 1 ? 'Its definition' : 'Definitions'} will be filled in automatically.`
        + (skipped > 0 ? ` (${skipped} already in your deck.)` : '')
    );
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 pt-4">
      <label htmlFor="quick-capture" className="sr-only">Capture a word to define later</label>
      <div className="flex gap-2 max-w-md mx-auto">
        <input
          ref={inputRef}
          id="quick-capture"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage('');
          }}
          placeholder="Jot down a word to learn…"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          Save
        </button>
      </div>
      {message && (
        <p className="max-w-md mx-auto text-xs text-slate-400 mt-2" role="status">{message}</p>
      )}
    </form>
  );
}
