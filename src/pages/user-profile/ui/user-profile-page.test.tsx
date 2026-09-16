import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { SessionEnderProvider } from '@/entities/session';
import { toUserId } from '@/entities/user';
import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';
import { createHttpClientStub, parseStubResponse, renderWithProviders } from '@/shared/testing';

import { UserProfilePage } from './user-profile-page';

interface RenamingBackend {
  readonly httpClient: HttpClient;
  readonly readPaths: readonly string[];
}

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ADA_RESOURCE_PATH = `/users/${ADA_ID}`;

const adaPayload = {
  id: ADA_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-01-05T12:00:00.000Z',
};

const namePatchSchema = z.object({ firstName: z.string(), lastName: z.string() });

const resolvingClient = createHttpClientStub({
  get: (_url, config) => parseStubResponse(config.schema, adaPayload),
});

const failingClient = createHttpClientStub({
  get: () => Promise.reject(toHttpError(new Error('offline'))),
});

const pendingClient = createHttpClientStub({ get: () => new Promise<never>(() => undefined) });

const sessionEnder = { signOut: () => Promise.resolve({ status: 'signed-out' } as const) };

function createRenamingBackend(): RenamingBackend {
  const readPaths: string[] = [];
  let currentPayload = adaPayload;

  const httpClient = createHttpClientStub({
    get: (url, config) => {
      readPaths.push(url);

      return parseStubResponse(config.schema, currentPayload);
    },
    patch: async (_url, config) => {
      const namePatch = namePatchSchema.safeParse(config.body);

      if (!namePatch.success) {
        throw toHttpError(namePatch.error);
      }

      const { firstName, lastName } = namePatch.data;

      currentPayload = {
        ...currentPayload,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      };

      return parseStubResponse(config.schema, currentPayload);
    },
  });

  return { httpClient, readPaths };
}

function renderPage(httpClient: HttpClient) {
  const { user } = renderWithProviders(
    <UserProfilePage userId={toUserId(ADA_ID)} onSignedOut={vi.fn()} />,
    {
      httpClient,
      wrappers: [
        ({ children }) => (
          <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>
        ),
      ],
    },
  );

  return { user };
}

describe('UserProfilePage', () => {
  it('announces that the profile is loading', () => {
    renderPage(pendingClient);

    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');
  });

  it('renders the profile once the query resolves', async () => {
    renderPage(resolvingClient);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ada Lovelace');
  });

  it('raises an alert when the profile cannot be loaded', async () => {
    renderPage(failingClient);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });

  it('shows the saved name from the update response without reading the profile again', async () => {
    const backend = createRenamingBackend();
    const { user } = renderPage(backend.httpClient);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ada Lovelace');

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'King');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ada King' })).toBeInTheDocument();
    expect(backend.readPaths).toStrictEqual([ADA_RESOURCE_PATH]);
  });

  it('offers a way out while the profile is failing to load', async () => {
    renderPage(failingClient);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
