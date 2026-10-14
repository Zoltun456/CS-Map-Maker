import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('agent tools', () => {
  it('rejects malformed input without replacing the map, then evaluates valid JSON', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Agent tools' }));
    const source = screen.getByLabelText('Agent map JSON') as HTMLTextAreaElement;
    const valid = source.value;
    fireEvent.change(source, { target: { value: '{"format":"wrong"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply JSON' }));
    expect(screen.getByRole('status')).toHaveTextContent('Invalid agent map');

    fireEvent.change(source, { target: { value: valid } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply JSON' }));
    expect(screen.getByRole('status')).toHaveTextContent('Agent map loaded');
    fireEvent.change(screen.getByLabelText('Simulation rounds'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate map' }));
    await waitFor(() => expect(screen.getByText(/\/100$/)).toBeVisible(), { timeout: 10000 });

    fireEvent.change(screen.getByLabelText('Simulation rounds'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Evaluate map' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
