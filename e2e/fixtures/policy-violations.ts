import type { Page } from '@playwright/test';

const REPORT_BINDING = 'reportPolicyViolation';

type ViolationReporter = (violation: string) => void;

export async function collectPolicyViolations(page: Page): Promise<readonly string[]> {
  const violations: string[] = [];

  await page.exposeFunction(REPORT_BINDING, (violation: string) => {
    violations.push(violation);
  });
  await page.addInitScript((binding) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as Partial<Record<string, ViolationReporter>>)[binding];
      const blocked = event.blockedURI === '' ? 'an inline resource' : event.blockedURI;

      report?.(`${event.effectiveDirective} blocked ${blocked}: ${event.sample}`);
    });
  }, REPORT_BINDING);

  return violations;
}
