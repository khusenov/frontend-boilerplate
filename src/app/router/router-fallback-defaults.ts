import { RoutePendingPage } from '@/pages/route-pending';

import { RouteErrorFallback } from './route-error-fallback';

const ROUTER_PENDING_DELAY_MILLISECONDS = 300;
const ROUTER_PENDING_HOLD_MILLISECONDS = 300;

export const ROUTER_FALLBACK_DEFAULTS = {
  defaultPendingMs: ROUTER_PENDING_DELAY_MILLISECONDS,
  defaultPendingMinMs: ROUTER_PENDING_HOLD_MILLISECONDS,
  defaultPendingComponent: RoutePendingPage,
  defaultErrorComponent: RouteErrorFallback,
  disableGlobalCatchBoundary: true,
} as const;
