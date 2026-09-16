import { RuleConfigSeverity } from '@commitlint/types';
import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [RuleConfigSeverity.Error, 'always'],
  },
};

export default config;
