import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserThemeStorage,
  createDocumentThemeApplier,
  createSystemThemeSource,
  createThemeController,
  THEME_PREFERENCES,
} from '@/shared/theme';
import themeCss from '@/shared/ui/theme.css?raw';

import indexHtml from '../../../index.html?raw';

const indexDocument = new DOMParser().parseFromString(indexHtml, 'text/html');
const prePaintElement = Array.from(indexDocument.scripts).find(
  (script) => script.attributes.length === 0,
);
const prePaintScript = prePaintElement?.textContent;

if (prePaintElement === undefined || prePaintScript === undefined || prePaintScript === null) {
  throw new Error('index.html no longer contains an attribute-free <script> tag to verify.');
}

const PRE_PAINT_ELEMENT = prePaintElement;
const PRE_PAINT_SCRIPT = prePaintScript;

interface WindowStub {
  readonly localStorage: { readonly getItem: (key: string) => string | null };
  readonly matchMedia: (query: string) => { readonly matches: boolean };
}

interface DocumentStub {
  readonly documentElement: HTMLElement;
}

type PrePaintScript = (windowStub: WindowStub, documentStub: DocumentStub) => void;

// eslint-disable-next-line @typescript-eslint/no-implied-eval -- executing index.html's own script is the point of this test
const runPrePaintScript = new Function('window', 'document', PRE_PAINT_SCRIPT) as PrePaintScript;

function stubMediaQuery(matches: boolean) {
  return { matches, addEventListener: () => undefined, removeEventListener: () => undefined };
}

function readAdapterStorageKey(): string {
  const writtenKeys: string[] = [];

  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: (key: string) => {
      writtenKeys.push(key);
    },
  });
  createBrowserThemeStorage().write('dark');
  vi.unstubAllGlobals();

  const [key] = writtenKeys;

  if (key === undefined) {
    throw new Error(
      'createBrowserThemeStorage no longer writes through localStorage; this guard is blind.',
    );
  }

  return key;
}

function readAdapterMediaQuery(): string {
  const queries: string[] = [];

  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);

    return stubMediaQuery(false);
  });
  createSystemThemeSource();
  vi.unstubAllGlobals();

  const [query] = queries;

  if (query === undefined) {
    throw new Error('createSystemThemeSource no longer calls matchMedia; this guard is blind.');
  }

  return query;
}

const ADAPTER_STORAGE_KEY = readAdapterStorageKey();
const ADAPTER_MEDIA_QUERY = readAdapterMediaQuery();

function paintWithScript(stored: string | null, systemPrefersDark: boolean): HTMLElement {
  const element = document.createElement('html');

  runPrePaintScript(
    {
      localStorage: { getItem: (key) => (key === ADAPTER_STORAGE_KEY ? stored : null) },
      matchMedia: (query) => ({ matches: query === ADAPTER_MEDIA_QUERY && systemPrefersDark }),
    },
    { documentElement: element },
  );

  return element;
}

function paintWithRuntime(stored: string | null, systemPrefersDark: boolean): HTMLElement {
  const element = document.createElement('html');

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === ADAPTER_STORAGE_KEY ? stored : null),
    setItem: () => undefined,
  });
  vi.stubGlobal('matchMedia', (query: string) =>
    stubMediaQuery(query === ADAPTER_MEDIA_QUERY && systemPrefersDark),
  );

  const controller = createThemeController({
    storage: createBrowserThemeStorage(),
    systemTheme: createSystemThemeSource(),
  });

  createDocumentThemeApplier(element)(controller.getState().resolved);

  return element;
}

const STORED_VALUES = [null, '', 'twilight', ...THEME_PREFERENCES];

const CASES = STORED_VALUES.flatMap((stored) =>
  [true, false].map((systemPrefersDark) => ({ stored, systemPrefersDark })),
);

describe('the pre-paint script in index.html', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs inside <head>, before the module script', () => {
    const moduleScript = indexDocument.querySelector('script[type="module"]');
    const moduleScriptPosition =
      moduleScript === null ? 0 : PRE_PAINT_ELEMENT.compareDocumentPosition(moduleScript);

    expect(PRE_PAINT_ELEMENT.parentElement).toBe(indexDocument.head);
    expect(moduleScript).not.toBeNull();
    expect(moduleScriptPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it.each(CASES)(
    'paints what the runtime would for stored $stored with systemPrefersDark $systemPrefersDark',
    ({ stored, systemPrefersDark }) => {
      const painted = paintWithScript(stored, systemPrefersDark);
      const expected = paintWithRuntime(stored, systemPrefersDark);

      expect(painted.outerHTML).toBe(expected.outerHTML);
    },
  );

  it('leaves the document untouched when storage access throws', () => {
    const untouched = document.createElement('html');
    const element = document.createElement('html');

    runPrePaintScript(
      {
        localStorage: {
          getItem: () => {
            throw new Error('storage denied');
          },
        },
        matchMedia: () => ({ matches: true }),
      },
      { documentElement: element },
    );

    expect(element.outerHTML).toBe(untouched.outerHTML);
  });
});

describe('the dark class', () => {
  it('is the class shared/ui/theme.css actually styles', () => {
    const element = document.createElement('html');

    createDocumentThemeApplier(element)('dark');

    const darkClassName = element.className;

    expect(themeCss).toContain(`.${darkClassName} {`);
    expect(themeCss).toContain(`:is(.${darkClassName} *)`);
  });
});
