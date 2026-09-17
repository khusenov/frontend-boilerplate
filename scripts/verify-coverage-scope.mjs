import { existsSync, globSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LCOV_REPORT_PATH = fileURLToPath(new URL('../coverage/lcov.info', import.meta.url));
const LCOV_SOURCE_FILE_PREFIX = 'SF:';
const SOURCE_GLOB = 'src/**/*.{ts,tsx}';
const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/;
const DECLARATION_FILE_SUFFIX = '.d.ts';
const GENERATED_ROUTE_TREE = 'src/app/router/route-tree.gen.ts';

function requireReport() {
  if (existsSync(LCOV_REPORT_PATH)) {
    return;
  }

  console.error('No coverage report found. Run `npm run test:coverage` first.');
  exit(1);
}

function measuredFiles() {
  return new Set(
    readFileSync(LCOV_REPORT_PATH, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith(LCOV_SOURCE_FILE_PREFIX))
      .map((line) => line.slice(LCOV_SOURCE_FILE_PREFIX.length).trim()),
  );
}

function measurableSourceFiles() {
  return globSync(SOURCE_GLOB, { cwd: PROJECT_ROOT })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => !TEST_FILE_PATTERN.test(path))
    .filter((path) => !path.endsWith(DECLARATION_FILE_SUFFIX))
    .filter((path) => path !== GENERATED_ROUTE_TREE);
}

function reportUnmeasured(unmeasured) {
  console.error('These source files escaped coverage measurement:');

  for (const path of unmeasured) {
    console.error(`  ${path}`);
  }

  console.error(
    '\nA coverage.include or coverage.exclude pattern in vite.config.ts leaves them out.\n' +
      'Narrow the pattern, or mirror a deliberate exclusion in this script.',
  );
}

requireReport();

const measured = measuredFiles();
const expected = measurableSourceFiles();
const unmeasured = expected.filter((path) => !measured.has(path)).sort();

if (unmeasured.length > 0) {
  reportUnmeasured(unmeasured);
  exit(1);
}

console.log(`Coverage scope verified: ${expected.length} source files measured.`);
