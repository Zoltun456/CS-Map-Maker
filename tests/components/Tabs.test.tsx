import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('application tabs', () => {
  it('supports arrow navigation and roving focus', () => {
    render(<App />);
    const lab = screen.getByRole('tab', { name: 'Layout lab' });
    lab.focus();
    fireEvent.keyDown(lab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Agent tools' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: 'Agent tools' })).toBeVisible();
  });
});
