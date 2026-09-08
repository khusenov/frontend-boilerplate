import { isHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import type { RefreshResult } from '../model/refresh-result';

import { refreshSessionResponseDtoSchema } from './session-dto';
import { toRefreshedAccessToken } from './session-mapper';

const REFRESH_SESSION_PATH = '/auth/refresh';
const UNAUTHORIZED_STATUS = 401;

export type SessionWriteClient = Pick<HttpClient, 'post'>;

export interface SessionApi {
  readonly refresh: () => Promise<RefreshResult>;
}

export function createSessionApi(unauthenticatedClient: SessionWriteClient): SessionApi {
  return {
    refresh: async () => {
      try {
        const dto = await unauthenticatedClient.post(REFRESH_SESSION_PATH, {
          body: {},
          schema: refreshSessionResponseDtoSchema,
        });

        return { status: 'refreshed', accessToken: toRefreshedAccessToken(dto) };
      } catch (error: unknown) {
        if (!isHttpError(error)) {
          throw error;
        }

        return error.status === UNAUTHORIZED_STATUS
          ? { status: 'expired' }
          : { status: 'unavailable' };
      }
    },
  };
}
