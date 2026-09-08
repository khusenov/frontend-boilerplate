import type { ErrorReport, ErrorReporter } from './error-reporter';

function describeErrorReport(report: ErrorReport): string {
  switch (report.source) {
    case 'render':
      return report.componentStack;
    case 'query':
      return report.queryHash;
    case 'mutation':
      return report.mutationHash;
  }
}

export function createConsoleErrorReporter(): ErrorReporter {
  return (report) => {
    console.error(
      `error reported from ${report.source}`,
      report.error,
      describeErrorReport(report),
    );
  };
}
