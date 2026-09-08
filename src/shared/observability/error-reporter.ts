export type ErrorReport =
  | { readonly source: 'render'; readonly error: unknown; readonly componentStack: string }
  | { readonly source: 'query'; readonly error: unknown; readonly queryHash: string }
  | { readonly source: 'mutation'; readonly error: unknown; readonly mutationHash: string };

export type ErrorReporter = (report: ErrorReport) => void;
