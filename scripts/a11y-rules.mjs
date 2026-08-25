import { writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import schema from '../node_modules/oxlint/configuration_schema.json' with { type: 'json' };

const PLUGIN = 'jsx-a11y';
const RULE_PREFIX = `${PLUGIN}/`;
const SEVERITY = 'error';
const SCHEMA_SPECIFIER = './node_modules/oxlint/configuration_schema.json';

const configPath = fileURLToPath(new URL('../.oxlintrc.json', import.meta.url));

function schemaRuleNames() {
  return Object.keys(schema.definitions.DummyRuleMap.properties)
    .filter((name) => name.startsWith(RULE_PREFIX))
    .sort();
}

function generate() {
  const ruleNames = schemaRuleNames();
  const config = {
    $schema: SCHEMA_SPECIFIER,
    plugins: [PLUGIN],
    categories: { correctness: 'off' },
    rules: Object.fromEntries(ruleNames.map((name) => [name, SEVERITY])),
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`${String(ruleNames.length)} ${PLUGIN} rules written to .oxlintrc.json`);
}

async function check() {
  const { default: config } = await import('../.oxlintrc.json', { with: { type: 'json' } });
  const configured = new Map(Object.entries(config.rules));
  const expected = schemaRuleNames();

  const missing = expected.filter((name) => !configured.has(name));
  const relaxed = expected.filter(
    (name) => configured.has(name) && configured.get(name) !== SEVERITY,
  );
  const stale = [...configured.keys()]
    .filter((name) => name.startsWith(RULE_PREFIX))
    .filter((name) => !expected.includes(name));

  if (missing.length === 0 && relaxed.length === 0 && stale.length === 0) {
    console.log(`.oxlintrc.json is in sync: ${String(expected.length)} ${PLUGIN} rules.`);
    return;
  }

  for (const name of missing) {
    console.error(`missing from .oxlintrc.json: ${name}`);
  }
  for (const name of relaxed) {
    console.error(`not set to "${SEVERITY}": ${name}`);
  }
  for (const name of stale) {
    console.error(`no longer in the oxlint schema: ${name}`);
  }
  console.error('Run `node scripts/a11y-rules.mjs` to regenerate .oxlintrc.json.');
  exit(1);
}

if (argv.includes('--check')) {
  await check();
} else {
  generate();
}
