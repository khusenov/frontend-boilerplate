import type { QueryClient } from '@tanstack/react-query';

import type { HttpClient } from '@/shared/api';

export interface AppRouterContext {
  readonly httpClient: HttpClient;
  readonly queryClient: QueryClient;
}
