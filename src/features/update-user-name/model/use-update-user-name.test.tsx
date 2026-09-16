import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toUserId } from '@/entities/user';
import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';
import { createHttpClientStub, parseStubResponse, renderHookWithProviders } from '@/shared/testing';

import { useUpdateUserName } from './use-update-user-name';

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';

const savedAdaKingPayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'King',
  fullName: 'Ada King',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-03-09T08:15:00.000Z',
};

const resolvingClient = createHttpClientStub({
  patch: (_url, config) => parseStubResponse(config.schema, savedAdaKingPayload),
});

const failingClient = createHttpClientStub({
  patch: () => Promise.reject(toHttpError(new Error('offline'))),
});

const SAVED_MESSAGE = 'Name updated.';

function renderUpdateUserName(httpClient: HttpClient) {
  return renderHookWithProviders(
    () => useUpdateUserName(toUserId(ADA_ID), { savedMessage: SAVED_MESSAGE }),
    { httpClient },
  );
}

const renameToAdaKing = { firstName: 'Ada', lastName: 'King' };

describe('useUpdateUserName', () => {
  it('reports an idle status before anything is submitted', () => {
    const { result } = renderUpdateUserName(resolvingClient);

    expect(result.current.status).toBe('idle');
  });

  it('reports a saved status once the request resolves', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    await act(async () => {
      await result.current.submit(renameToAdaKing);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('saved');
    });
  });

  it('raises exactly one notification once the request resolves', async () => {
    const { notifications, result } = renderUpdateUserName(resolvingClient);

    await act(async () => {
      await result.current.submit(renameToAdaKing);
    });

    await waitFor(() => {
      expect(notifications).toStrictEqual([{ message: SAVED_MESSAGE }]);
    });
  });

  it('raises no notification when the request fails', async () => {
    const { notifications, result } = renderUpdateUserName(failingClient);

    await act(async () => {
      await result.current.submit(renameToAdaKing);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(notifications).toStrictEqual([]);
  });

  it('reports a failed status without rejecting when the request fails', async () => {
    const { result } = renderUpdateUserName(failingClient);

    await act(async () => {
      await expect(result.current.submit(renameToAdaKing)).resolves.toBeUndefined();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
  });

  it('returns a settled success to idle when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    await act(async () => {
      await result.current.submit(renameToAdaKing);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('saved');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('returns a settled failure to idle when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(failingClient);

    await act(async () => {
      await result.current.submit(renameToAdaKing);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('leaves an idle status alone when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(resolvingClient);

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
  });

  it('leaves an in flight request alone when the outcome is dismissed', async () => {
    const { result } = renderUpdateUserName(
      createHttpClientStub({ patch: () => new Promise<never>(() => undefined) }),
    );

    act(() => {
      void result.current.submit(renameToAdaKing);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('saving');
    });

    act(() => {
      result.current.dismissOutcome();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('saving');
    });
  });
});
