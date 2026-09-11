import type { QueryClient } from '@tanstack/react-query';

import type { SessionResolver } from '@/entities/session';
import type { HttpClient } from '@/shared/api';

export interface AppRouterContext {
  readonly httpClient: HttpClient;
  readonly queryClient: QueryClient;
  readonly sessionResolver: SessionResolver;
}
