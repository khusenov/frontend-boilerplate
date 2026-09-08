export interface BearerTokenSource {
  readonly getToken: () => string | null;
  readonly renewToken: (staleToken: string | null) => Promise<string | null>;
}
