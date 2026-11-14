import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillChart } from './SkillChart';

const data = [
  { step: 1, ability: 0.1, date: '1/1/2026' },
  { step: 2, ability: 0.5, date: '1/2/2026' },
  { step: 3, ability: -0.3, date: '1/3/2026' },
];

describe('SkillChart', () => {
  it('describes the trajectory for screen readers', () => {
    render(<SkillChart data={data} />);
    expect(screen.getByRole('img', { name: 'Skill level over 3 answers, from 0.1 to -0.3.' })).toBeInTheDocument();
  });

  it('shows the nearest answer on hover and hides it on leave', () => {
    render(<SkillChart data={data} />);
    const svg = screen.getByRole('img');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(svg, { clientX: 310, clientY: 50 });
    expect(screen.getByText('Answer 3 · 1/3/2026')).toBeInTheDocument();
    expect(screen.getByText('Skill level -0.3')).toBeInTheDocument();
    fireEvent.pointerLeave(svg);
    expect(screen.queryByText(/Answer 3/)).not.toBeInTheDocument();
  });

  it('renders nothing without data', () => {
    const { container } = render(<SkillChart data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
