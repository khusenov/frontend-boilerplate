import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

export interface ContentSecurityPolicySources {
  readonly scriptHashes: readonly string[];
  readonly styleHashes: readonly string[];
  readonly connectOrigins: readonly string[];
}

export interface PolicySourceLocations {
  readonly indexHtmlPath: string;
  readonly apiBaseUrl: string | undefined;
}

const INLINE_SCRIPT_PATTERN = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const SONNER_STYLESHEET_PATTERN = /__insertCSS\(("(?:[^"\\]|\\.)*")\)/g;
const SONNER_STYLE_ELEMENT_BEFORE_INSERTION = '';
const REPORT_SAMPLE = "'report-sample'";
const NGINX_OUTPUT_FORMAT = 'nginx';

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

function toSha256Source(content: string): string {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

export function hashInlineScripts(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT_PATTERN)]
    .map(([, content]) => content ?? '')
    .filter((content) => content.trim() !== '')
    .map(toSha256Source);
}

export function hashSonnerStylesheets(moduleSource: string): string[] {
  const stylesheets = [...moduleSource.matchAll(SONNER_STYLESHEET_PATTERN)].map(
    ([, literal]) => JSON.parse(literal ?? '""') as string,
  );

  if (stylesheets.length !== 1) {
    throw new Error(
      `Expected sonner to inject exactly one stylesheet, found ${String(stylesheets.length)}. ` +
        'Its build changed how it injects CSS, so the style-src hash can no longer be derived.',
    );
  }

  return [SONNER_STYLE_ELEMENT_BEFORE_INSERTION, ...stylesheets].map(toSha256Source);
}

export function toConnectOrigins(apiBaseUrl: string | undefined): string[] {
  const configured = apiBaseUrl?.trim() ?? '';

  return URL.canParse(configured) ? [new URL(configured).origin] : [];
}

export function createContentSecurityPolicy({
  scriptHashes,
  styleHashes,
  connectOrigins,
}: ContentSecurityPolicySources): string {
  const directives: readonly (readonly [string, readonly string[]])[] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...scriptHashes, REPORT_SAMPLE]],
    ['style-src', ["'self'", ...styleHashes, REPORT_SAMPLE]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...connectOrigins]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];

  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

export function createSecurityHeaders(
  sources: ContentSecurityPolicySources,
): Record<string, string> {
  return {
    'Content-Security-Policy': createContentSecurityPolicy(sources),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

export function readPolicySources({
  indexHtmlPath,
  apiBaseUrl,
}: PolicySourceLocations): ContentSecurityPolicySources {
  const sonnerModulePath = fileURLToPath(import.meta.resolve('sonner'));

  return {
    scriptHashes: hashInlineScripts(readFileSync(indexHtmlPath, 'utf8')),
    styleHashes: hashSonnerStylesheets(readFileSync(sonnerModulePath, 'utf8')),
    connectOrigins: toConnectOrigins(apiBaseUrl),
  };
}

export function toNginxDirectives(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `add_header ${name} "${value}" always;\n`)
    .join('');
}

if (import.meta.main) {
  const [, , format, indexHtmlPath] = argv;

  if (format !== NGINX_OUTPUT_FORMAT || indexHtmlPath === undefined) {
    stderr.write('Usage: node scripts/security-headers.ts nginx <path to the built index.html>\n');
    exit(1);
  }

  const sources = readPolicySources({ indexHtmlPath, apiBaseUrl: env.VITE_API_BASE_URL });

  stdout.write(toNginxDirectives(createSecurityHeaders(sources)));
}
