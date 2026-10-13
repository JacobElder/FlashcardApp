import { useEffect, useId, useRef, useState } from 'react';
import type { NewWordFormData, VocabularyCard } from '../types';

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NewWordFormData) => void;
  /** Word being edited; omit to add a new word. */
  initialData?: VocabularyCard;
  /** Lowercased words already in the deck, for duplicate detection. */
  existingWords: string[];
}

const EMPTY_FORM: NewWordFormData = { word: '', definition: '', partOfSpeech: '', example: '' };

export function AddWordModal({ isOpen, onClose, onSave, initialData, existingWords }: AddWordModalProps) {
  const [formData, setFormData] = useState<NewWordFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<NewWordFormData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isEditing = Boolean(initialData);
  // Read through a ref so a new onClose identity doesn't re-run the focus effect (and steal focus)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Load the form whenever the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setFormData(initialData
      ? {
          word: initialData.word,
          definition: initialData.definition,
          partOfSpeech: initialData.partOfSpeech ?? '',
          example: initialData.example ?? '',
        }
      : EMPTY_FORM);
    setErrors({});
    setFetchError('');
  }, [isOpen, initialData]);

  // Focus management: focus the first field, trap Tab, close on Escape, restore focus on close
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const newErrors: Partial<NewWordFormData> = {};
    const word = formData.word.trim();
    if (!word) {
      newErrors.word = 'Word is required';
    } else if (existingWords.includes(word.toLowerCase())) {
      newErrors.word = `"${word}" is already in your deck`;
    }
    if (!formData.definition.trim()) {
      newErrors.definition = 'Definition is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      word,
      definition: formData.definition.trim(),
      partOfSpeech: formData.partOfSpeech?.trim() || undefined,
      example: formData.example?.trim() || undefined,
    });
    onClose();
  };

  const handleAutoFill = async () => {
    if (!formData.word.trim()) {
      setErrors({ word: 'Please enter a word to auto-fill' });
      return;
    }

    setIsLoading(true);
    setFetchError('');

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(formData.word.trim())}`);
      if (!res.ok) {
        throw new Error('Word not found or API error');
      }
      const data = await res.json();

      const firstMeaning = data[0]?.meanings[0];
      const firstDefinition = firstMeaning?.definitions[0];

      setFormData(prev => ({
        ...prev,
        definition: firstDefinition?.definition || prev.definition,
        partOfSpeech: firstMeaning?.partOfSpeech || prev.partOfSpeech,
        example: firstDefinition?.example || prev.example,
      }));
      setErrors({});
    } catch {
      setFetchError('Could not find definition for this word.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof NewWordFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 id={titleId} className="text-xl font-semibold text-white">
              {isEditing ? 'Edit Word' : 'Add New Word'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Close dialog"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="word"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Word <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="word"
                  name="word"
                  value={formData.word}
                  onChange={handleChange}
                  className={`flex-1 w-full bg-slate-700 border ${
                    errors.word ? 'border-red-500' : 'border-slate-600'
                  } rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter word"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.word)}
                  aria-describedby={errors.word ? 'word-error' : undefined}
                />
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={isLoading || !formData.word.trim()}
                  className="bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {isLoading ? 'Loading...' : 'Auto-fill'}
                </button>
              </div>
              {errors.word && (
                <p id="word-error" className="text-red-400 text-sm mt-1">{errors.word}</p>
              )}
              {fetchError && (
                <p className="text-yellow-400 text-sm mt-1" role="status">{fetchError}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="definition"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Definition <span className="text-red-400">*</span>
              </label>
              <textarea
                id="definition"
                name="definition"
                value={formData.definition}
                onChange={handleChange}
                rows={3}
                className={`w-full bg-slate-700 border ${
                  errors.definition ? 'border-red-500' : 'border-slate-600'
                } rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none`}
                placeholder="Enter definition"
                aria-invalid={Boolean(errors.definition)}
                aria-describedby={errors.definition ? 'definition-error' : undefined}
              />
              {errors.definition && (
                <p id="definition-error" className="text-red-400 text-sm mt-1">{errors.definition}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="partOfSpeech"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Part of Speech
              </label>
              <select
                id="partOfSpeech"
                name="partOfSpeech"
                value={formData.partOfSpeech}
                onChange={handleChange}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select (optional)</option>
                <option value="noun">Noun</option>
                <option value="verb">Verb</option>
                <option value="adjective">Adjective</option>
                <option value="adverb">Adverb</option>
                <option value="preposition">Preposition</option>
                <option value="conjunction">Conjunction</option>
                <option value="interjection">Interjection</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="example"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Example Sentence
              </label>
              <input
                type="text"
                id="example"
                name="example"
                value={formData.example}
                onChange={handleChange}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Use the word in a sentence (optional)"
                autoComplete="off"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors"
              >
                {isEditing ? 'Save Changes' : 'Add Word'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
