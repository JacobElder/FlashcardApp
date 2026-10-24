import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useStudyShortcuts } from './useStudyShortcuts';
import { RATING_VALUES } from '../types';

function setup(overrides: Partial<Parameters<typeof useStudyShortcuts>[0]> = {}) {
  const handlers = { onFlip: vi.fn(), onRate: vi.fn(), onSkip: vi.fn() };
  const props = { enabled: true, canFlip: true, isFlipped: false, ...handlers, ...overrides };
  const hook = renderHook((p: typeof props) => useStudyShortcuts(p), { initialProps: props });
  return { ...handlers, rerender: (next: Partial<typeof props>) => hook.rerender({ ...props, ...next }) };
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key, ...init });

describe('useStudyShortcuts', () => {
  it('flips with Space or Enter', () => {
    const { onFlip } = setup();
    press(' ');
    press('Enter');
    expect(onFlip).toHaveBeenCalledTimes(2);
  });

  it('rates with 1-4 only once the card is flipped', () => {
    const { onRate, rerender } = setup();
    press('3');
    expect(onRate).not.toHaveBeenCalled();
    rerender({ isFlipped: true });
    press('1'); press('2'); press('3'); press('4');
    expect(onRate.mock.calls.map(c => c[0])).toEqual([
      RATING_VALUES.again, RATING_VALUES.hard, RATING_VALUES.good, RATING_VALUES.easy,
    ]);
  });

  it('skips with S in either case', () => {
    const { onSkip } = setup();
    press('s');
    press('S');
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it('ignores flip and rating keys on a multiple-choice card', () => {
    const { onFlip, onRate } = setup({ canFlip: false, isFlipped: true });
    press(' ');
    press('3');
    expect(onFlip).not.toHaveBeenCalled();
    expect(onRate).not.toHaveBeenCalled();
  });

  it('does nothing while typing in a field or inside a dialog', () => {
    const { onFlip, onSkip } = setup();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inDialog = document.createElement('span');
    dialog.append(inDialog);
    document.body.append(input, textarea, dialog);

    for (const target of [input, textarea, inDialog]) {
      press('s', {}, target);
      press(' ', {}, target);
    }
    expect(onSkip).not.toHaveBeenCalled();
    expect(onFlip).not.toHaveBeenCalled();
    input.remove(); textarea.remove(); dialog.remove();
  });

  it('leaves Space/Enter to a focused button, which activates itself', () => {
    const { onFlip } = setup();
    const button = document.createElement('button');
    document.body.append(button);
    press(' ', {}, button);
    expect(onFlip).not.toHaveBeenCalled();
    button.remove();
  });

  it('ignores modifier chords and auto-repeat', () => {
    const { onSkip } = setup();
    press('s', { metaKey: true });
    press('s', { ctrlKey: true });
    press('s', { altKey: true });
    press('s', { repeat: true });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (another tab is showing or the modal is open)', () => {
    const { onFlip, onSkip, rerender } = setup({ enabled: false });
    press(' ');
    press('s');
    expect(onFlip).not.toHaveBeenCalled();
    rerender({ enabled: true });
    press('s');
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
