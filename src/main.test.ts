import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('main entrypoint guard', () => {
  it('throws when #root is missing', async () => {
    await expect(import('./main')).rejects.toThrow(
      'Root element #root was not found in index.html',
    );
  });

  it('renders the app when #root exists', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    await act(async () => {
      await import('./main');
    });

    await waitFor(() => {
      expect(root.querySelector('h1')?.textContent).toBe('frontend-boilerplate');
    });
  });
});
