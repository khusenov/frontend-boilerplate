import { isHttpError, noContentSchema } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import type { Credentials } from '../model/credentials';
import type { RefreshResult } from '../model/refresh-result';
import type { SignInResult } from '../model/sign-in-result';
import type { SignOutOutcome } from '../model/sign-out-outcome';

import { refreshSessionResponseDtoSchema, signInResponseDtoSchema } from './session-dto';
import { toIssuedAccessToken, toRefreshedAccessToken, toSignInRequestDto } from './session-mapper';

const REFRESH_SESSION_PATH = '/auth/refresh';
const SIGN_IN_PATH = '/auth/login';
const SIGN_OUT_PATH = '/auth/logout';
const UNAUTHORIZED_STATUS = 401;
const TOO_MANY_REQUESTS_STATUS = 429;

export type SessionWriteClient = Pick<HttpClient, 'post'>;

export interface SessionApi {
  readonly refresh: () => Promise<RefreshResult>;
  readonly signIn: (credentials: Credentials) => Promise<SignInResult>;
  readonly signOut: () => Promise<SignOutOutcome>;
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
    signIn: async (credentials) => {
      try {
        const dto = await unauthenticatedClient.post(SIGN_IN_PATH, {
          body: toSignInRequestDto(credentials),
          schema: signInResponseDtoSchema,
        });

        return { status: 'signed-in', accessToken: toIssuedAccessToken(dto) };
      } catch (error: unknown) {
        if (!isHttpError(error)) {
          throw error;
        }

        switch (error.status) {
          case UNAUTHORIZED_STATUS:
            return { status: 'rejected' };
          case TOO_MANY_REQUESTS_STATUS:
            return { status: 'rate-limited' };
          default:
            return { status: 'unavailable' };
        }
      }
    },
    signOut: async () => {
      try {
        await unauthenticatedClient.post(SIGN_OUT_PATH, { body: {}, schema: noContentSchema });

        return { status: 'signed-out' };
      } catch (error: unknown) {
        if (!isHttpError(error)) {
          throw error;
        }

        return error.status === UNAUTHORIZED_STATUS
          ? { status: 'signed-out' }
          : { status: 'unavailable' };
      }
    },
  };
}
