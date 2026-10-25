import { DeckStudy } from '../components/DeckStudy';
import { STORAGE_KEYS } from '../lib/storage';
import { dataScienceCards, DATA_SCIENCE_CATEGORIES } from '../data/dataScienceCards';

export function DataScienceStudy({ isActive }: { isActive: boolean }) {
  return (
    <DeckStudy
      isActive={isActive}
      title="Data Science"
      deck="data-science"
      cards={dataScienceCards}
      categories={DATA_SCIENCE_CATEGORIES}
      storageKey={STORAGE_KEYS.DATA_SCIENCE_PROGRESS}
      cardNoun="data science cards"
    />
  );
}
