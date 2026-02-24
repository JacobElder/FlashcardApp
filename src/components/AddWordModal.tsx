import { useState } from 'react';
import type { NewWordFormData } from '../types';

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: NewWordFormData) => void;
}

export function AddWordModal({ isOpen, onClose, onAdd }: AddWordModalProps) {
  const [formData, setFormData] = useState<NewWordFormData>({
    word: '',
    definition: '',
    partOfSpeech: '',
    example: '',
  });
  const [errors, setErrors] = useState<Partial<NewWordFormData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const newErrors: Partial<NewWordFormData> = {};
    if (!formData.word.trim()) {
      newErrors.word = 'Word is required';
    }
    if (!formData.definition.trim()) {
      newErrors.definition = 'Definition is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onAdd({
      word: formData.word.trim(),
      definition: formData.definition.trim(),
      partOfSpeech: formData.partOfSpeech?.trim() || undefined,
      example: formData.example?.trim() || undefined,
    });

    // Reset form
    setFormData({ word: '', definition: '', partOfSpeech: '', example: '' });
    setErrors({});
    onClose();
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
      <div className="relative bg-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Add New Word</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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
              <input
                type="text"
                id="word"
                name="word"
                value={formData.word}
                onChange={handleChange}
                className={`w-full bg-slate-700 border ${
                  errors.word ? 'border-red-500' : 'border-slate-600'
                } rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                placeholder="Enter word"
                autoComplete="off"
              />
              {errors.word && (
                <p className="text-red-400 text-sm mt-1">{errors.word}</p>
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
              />
              {errors.definition && (
                <p className="text-red-400 text-sm mt-1">{errors.definition}</p>
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
                Add Word
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
