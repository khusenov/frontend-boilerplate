import { toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

function rejectUnexpectedRequest(method: string) {
  return (): Promise<never> =>
    Promise.reject(
      toHttpError(new Error(`The subject under test made an unexpected ${method} request.`)),
    );
}

export function createHttpClientStub(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: rejectUnexpectedRequest('GET'),
    post: rejectUnexpectedRequest('POST'),
    put: rejectUnexpectedRequest('PUT'),
    patch: rejectUnexpectedRequest('PATCH'),
    delete: rejectUnexpectedRequest('DELETE'),
    ...overrides,
  };
}
