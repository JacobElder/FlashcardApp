import { DeckStudy } from '../components/DeckStudy';
import { STORAGE_KEYS } from '../lib/storage';
import { triviaCards } from '../data/triviaCards';

export function TriviaStudy({ isActive }: { isActive: boolean }) {
  return (
    <DeckStudy
      isActive={isActive}
      title="Trivia Study"
      cards={triviaCards}
      storageKey={STORAGE_KEYS.TRIVIA_PROGRESS}
      cardNoun="trivia cards"
    />
  );
}
