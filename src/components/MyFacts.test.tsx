import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStorageValue } from '../hooks/useStorageValue';
import { STORAGE_KEYS } from '../lib/storage';
import { EMPTY_FACTS } from '../lib/facts';
import type { UserFacts } from '../types';
import { MyFacts } from './MyFacts';

function Harness() {
  const { facts } = useStorageValue<UserFacts>(STORAGE_KEYS.USER_FACTS, EMPTY_FACTS);
  return <MyFacts deck="data-science" facts={facts} categories={['Statistics', 'Probability']} defaultCategory="Probability" />;
}

describe('MyFacts', () => {
  it('adds a fact with or without an answer and lists it with its status', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a fact' }));
    expect(screen.getByLabelText('Category')).toHaveValue('Probability');

    fireEvent.change(screen.getByLabelText(/Question/), { target: { value: 'What is a martingale?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('look up the answer');

    fireEvent.change(screen.getByLabelText(/Question/), { target: { value: 'Mean of Poisson(λ)?' } });
    fireEvent.change(screen.getByLabelText(/Answer/), { target: { value: 'λ' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Statistics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('added to your deck');

    fireEvent.click(screen.getByRole('button', { name: /Your facts \(2, 2 waiting\)/ }));
    expect(screen.getByText('Waiting for an answer · Probability')).toBeInTheDocument();
    expect(screen.getByText('Not yet fact-checked · Statistics')).toBeInTheDocument();
  });

  it('deletes a fact after confirmation', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a fact' }));
    fireEvent.change(screen.getByLabelText(/Question/), { target: { value: 'Delete me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: /Your facts/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete fact: Delete me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText("You haven't added any facts yet.")).toBeInTheDocument();
  });
});
