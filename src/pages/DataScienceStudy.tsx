import { DeckStudy } from '../components/DeckStudy';
import { STORAGE_KEYS } from '../lib/storage';
import { dataScienceCards } from '../data/dataScienceCards';

export function DataScienceStudy({ isActive }: { isActive: boolean }) {
  return (
    <DeckStudy
      isActive={isActive}
      title="Data Science"
      cards={dataScienceCards}
      storageKey={STORAGE_KEYS.DATA_SCIENCE_PROGRESS}
      cardNoun="data science cards"
    />
  );
}
