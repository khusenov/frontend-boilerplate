import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionEnderProvider } from '@/entities/session';
import { toUserId } from '@/entities/user';
import { toHttpError } from '@/shared/api';
import type { HttpClient, ResponseSchema } from '@/shared/api';
import { createHttpClientStub, renderWithProviders } from '@/shared/testing';

import { UserProfilePage } from './user-profile-page';

const adaPayload = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

interface NamePayload {
  readonly first_name: string;
  readonly last_name: string;
}

function isNamePayload(body: unknown): body is NamePayload {
  return (
    typeof body === 'object' &&
    body !== null &&
    'first_name' in body &&
    'last_name' in body &&
    typeof body.first_name === 'string' &&
    typeof body.last_name === 'string'
  );
}

async function parse<TValue>(schema: ResponseSchema<TValue>, payload: unknown): Promise<TValue> {
  const result = await schema['~standard'].validate(payload);

  if (result.issues !== undefined) {
    throw toHttpError(new Error('the payload does not satisfy the request schema'));
  }

  return result.value;
}

const resolvingClient = createHttpClientStub({
  get: (_url, config) => parse(config.schema, adaPayload),
});

const failingClient = createHttpClientStub({
  get: () => Promise.reject(toHttpError(new Error('offline'))),
});

const pendingClient = createHttpClientStub({ get: () => new Promise<never>(() => undefined) });

const sessionEnder = { signOut: () => Promise.resolve({ status: 'signed-out' } as const) };

function createRenamingClient(): HttpClient {
  let currentPayload = adaPayload;

  return createHttpClientStub({
    get: (_url, config) => parse(config.schema, currentPayload),
    patch: (_url, config) => {
      if (!isNamePayload(config.body)) {
        throw toHttpError(new Error('the patch body does not carry both name parts'));
      }

      currentPayload = { ...currentPayload, ...config.body };

      return parse(config.schema, null);
    },
  });
}

function renderPage(httpClient: HttpClient) {
  const onSignedOut = vi.fn();

  const { user } = renderWithProviders(
    <UserProfilePage userId={toUserId('u_1')} onSignedOut={onSignedOut} />,
    {
      httpClient,
      wrappers: [
        ({ children }) => (
          <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>
        ),
      ],
    },
  );

  return { onSignedOut, user };
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

  it('refetches the profile so the heading shows the name the form just saved', async () => {
    const { user } = renderPage(createRenamingClient());

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ada Lovelace');

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'King');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ada King' })).toBeInTheDocument();
  });

  it('offers a way out while the profile is failing to load', async () => {
    renderPage(failingClient);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
