import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULE_ID = 'import-x/no-restricted-paths';
const PROBE_SOURCE =
  "import { renderWithProviders } from '@/shared/testing';\n\nexport const probe = renderWithProviders;\n";
const PROBE_DIRECTORY = path.join(PROJECT_ROOT, 'src', 'shared', 'config');
const productionProbe = path.join(PROBE_DIRECTORY, 'import-fence-probe.ts');
const testProbe = path.join(PROBE_DIRECTORY, 'import-fence-probe.test.ts');

for (const probePath of [productionProbe, testProbe]) {
  writeFileSync(probePath, PROBE_SOURCE);
}

let results;

try {
  results = await new ESLint({ cwd: PROJECT_ROOT }).lintFiles([productionProbe, testProbe]);
} finally {
  rmSync(productionProbe, { force: true });
  rmSync(testProbe, { force: true });
}

const byPath = new Map(results.map((result) => [result.filePath, result.messages]));
const production = byPath.get(productionProbe) ?? [];
const test = byPath.get(testProbe) ?? [];
const fatal = [...production, ...test].filter((message) => message.fatal === true);

if (fatal.length > 0) {
  console.error('The fence probes could not be parsed, so the fence could not be verified:');

  for (const message of fatal) {
    console.error(`  ${message.message}`);
  }

  exit(1);
}

if (production.filter((message) => message.ruleId === RULE_ID).length === 0) {
  console.error(`The test-harness import fence is not firing: ${RULE_ID} reported nothing for a`);
  console.error('production file importing @/shared/testing.');
  console.error(
    '\nCheck the import-x resolver in eslint.config.js. Without a resolver that understands\n' +
      'TypeScript and the @/ path mapping, this rule cannot resolve the specifier and passes silently.',
  );
  exit(1);
}

if (test.filter((message) => message.ruleId === RULE_ID).length > 0) {
  console.error(`The test-harness import fence is too strict: ${RULE_ID} fired for a test file.`);
  console.error('Test files must stay exempt — check the `ignores` glob on the fence block.');
  exit(1);
}

console.log(
  'Import fence verified: @/shared/testing is blocked in production files, allowed in tests.',
);
