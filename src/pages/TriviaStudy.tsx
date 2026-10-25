import { DeckStudy } from '../components/DeckStudy';
import { STORAGE_KEYS } from '../lib/storage';
import { triviaCards, TRIVIA_CATEGORIES } from '../data/triviaCards';

export function TriviaStudy({ isActive }: { isActive: boolean }) {
  return (
    <DeckStudy
      isActive={isActive}
      title="Trivia Study"
      deck="trivia"
      cards={triviaCards}
      categories={TRIVIA_CATEGORIES}
      storageKey={STORAGE_KEYS.TRIVIA_PROGRESS}
      cardNoun="trivia cards"
    />
  );
}
