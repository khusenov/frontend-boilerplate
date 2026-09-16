import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toUserId } from '@/entities/user';
import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';
import { createHttpClientStub, parseStubResponse, renderWithProviders } from '@/shared/testing';

import { MAXIMUM_NAME_LENGTH } from '../model/user-name-change-schema';

import { UpdateUserNameForm } from './update-user-name-form';

interface RecordedRequest {
  readonly url: string;
  readonly body: unknown;
}

const ADA_ID = '0198f0a2-7b1c-7d3e-8f00-123456789abc';
const ADA_RESOURCE_PATH = `/users/${ADA_ID}`;

const ada = { id: toUserId(ADA_ID), firstName: 'Ada', lastName: 'Lovelace' };

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

function createRecordingClient(requests: RecordedRequest[]): HttpClient {
  return createHttpClientStub({
    patch: async (url, config) => {
      requests.push({ url, body: config.body });

      const namePatch = namePatchSchema.safeParse(config.body);

      if (!namePatch.success) {
        throw toHttpError(namePatch.error);
      }

      const { firstName, lastName } = namePatch.data;

      return parseStubResponse(config.schema, {
        ...adaPayload,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      });
    },
  });
}

const failingClient = createHttpClientStub({
  patch: () => Promise.reject(toHttpError(new Error('offline'))),
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolveRequest) => {
    resolve = resolveRequest;
  });

  return { promise, resolve };
}

function renderForm(httpClient: HttpClient) {
  return renderWithProviders(<UpdateUserNameForm user={ada} />, { httpClient });
}

function formFields() {
  return within(screen.getByRole('form', { name: 'Update name' }));
}

describe('UpdateUserNameForm', () => {
  it('prefills both controls from the name the user has now', () => {
    renderForm(createRecordingClient([]));

    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Last name')).toHaveValue('Lovelace');
  });

  it('names itself by its visible heading and declares both autocomplete purposes', () => {
    renderForm(createRecordingClient([]));

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Update name');
    expect(screen.getByLabelText('First name')).toHaveAttribute('autocomplete', 'given-name');
    expect(screen.getByLabelText('Last name')).toHaveAttribute('autocomplete', 'family-name');
  });

  it('sends the trimmed camelCase payload when a valid name is submitted', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderForm(createRecordingClient(requests));

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), '  King  ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(requests).toStrictEqual([
        { url: ADA_RESOURCE_PATH, body: { firstName: 'Ada', lastName: 'King' } },
      ]);
    });
  });

  it('reports an emptied control and sends no request', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderForm(createRecordingClient(requests));

    await user.clear(screen.getByLabelText('First name'));
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await formFields().findByText('Enter a first name.')).toBeInTheDocument();
    expect(requests).toStrictEqual([]);
  });

  it('interpolates the length limit into the message when a name is one character too long', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderForm(createRecordingClient(requests));

    await user.clear(screen.getByLabelText('First name'));
    await user.paste('a'.repeat(MAXIMUM_NAME_LENGTH + 1));
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await formFields().findByText('Use at most 100 characters.')).toBeInTheDocument();
    expect(requests).toStrictEqual([]);
  });

  it('announces the update through the notifier once the request resolves', async () => {
    const { notifications, user } = renderForm(createRecordingClient([]));

    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(notifications).toStrictEqual([{ message: 'Name updated.' }]);
    });
  });

  it('announces a failure and keeps the typed values in place', async () => {
    const { user } = renderForm(failingClient);

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'King');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('The name could not be updated.')).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toHaveValue('King');
  });

  it('clears a settled outcome as soon as the user edits a field again', async () => {
    const { user } = renderForm(failingClient);

    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('The name could not be updated.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('First name'), 'a');

    await waitFor(() => {
      expect(screen.queryByText('The name could not be updated.')).not.toBeInTheDocument();
    });
  });

  it('shows the pending label on a disabled button while the request is in flight', async () => {
    const deferred = createDeferred();
    const { user } = renderForm(
      createHttpClientStub({
        patch: async (_url, config) => {
          await deferred.promise;

          return parseStubResponse(config.schema, adaPayload);
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    });
  });
});
