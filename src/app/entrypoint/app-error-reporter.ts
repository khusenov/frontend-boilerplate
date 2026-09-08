import { createConsoleErrorReporter, toSafeErrorReporter } from '@/shared/observability';

export const reportError = toSafeErrorReporter(createConsoleErrorReporter());
