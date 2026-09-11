import type { SessionStatus } from './session-state';
import type { SessionTokenSource } from './session-token-source';

export type SessionSettler = Pick<SessionTokenSource, 'settle'>;

export interface SessionResolver {
  readonly resolve: () => Promise<SessionStatus>;
}

export interface CreateSessionResolverOptions {
  readonly settler: SessionSettler;
}

export function createSessionResolver(options: CreateSessionResolverOptions): SessionResolver {
  const { settler } = options;

  return {
    resolve: async () => {
      try {
        return await settler.settle();
      } catch {
        return 'unknown';
      }
    },
  };
}
