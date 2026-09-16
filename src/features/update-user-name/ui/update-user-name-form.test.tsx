import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toUserId } from '@/entities/user';
import { toHttpError } from '@/shared/api';
import type { HttpClient, ResponseSchema } from '@/shared/api';
import { createHttpClientStub, renderWithProviders } from '@/shared/testing';

import { MAXIMUM_NAME_LENGTH } from '../model/user-name-change-schema';

import { UpdateUserNameForm } from './update-user-name-form';

interface RecordedRequest {
  readonly url: string;
  readonly body: unknown;
}

const ada = { id: toUserId('u_1'), firstName: 'Ada', lastName: 'Lovelace' };

async function parseEmptyResponse<TValue>(schema: ResponseSchema<TValue>): Promise<TValue> {
  const result = await schema['~standard'].validate(null);

  if (result.issues !== undefined) {
    throw toHttpError(new Error('the response does not satisfy the request schema'));
  }

  return result.value;
}

function createRecordingClient(requests: RecordedRequest[]): HttpClient {
  return createHttpClientStub({
    patch: (url, config) => {
      requests.push({ url, body: config.body });

      return parseEmptyResponse(config.schema);
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

  it('sends the trimmed snake_case payload when a valid name is submitted', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderForm(createRecordingClient(requests));

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), '  King  ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(requests).toStrictEqual([
        { url: '/users/u_1', body: { first_name: 'Ada', last_name: 'King' } },
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

    expect(await formFields().findByText('Use at most 80 characters.')).toBeInTheDocument();
    expect(requests).toStrictEqual([]);
  });

  it('announces the update once the request resolves', async () => {
    const { user } = renderForm(createRecordingClient([]));

    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Name updated.')).toBeInTheDocument();
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
    const { user } = renderForm(createRecordingClient([]));

    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Name updated.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('First name'), 'a');

    await waitFor(() => {
      expect(screen.queryByText('Name updated.')).not.toBeInTheDocument();
    });
  });

  it('shows the pending label on a disabled button while the request is in flight', async () => {
    const deferred = createDeferred();
    const { user } = renderForm(
      createHttpClientStub({
        patch: async (_url, config) => {
          await deferred.promise;

          return parseEmptyResponse(config.schema);
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
