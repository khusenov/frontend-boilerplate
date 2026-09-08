import type { ErrorReporter } from './error-reporter';

export function toSafeErrorReporter(reportError: ErrorReporter): ErrorReporter {
  return (report) => {
    try {
      reportError(report);
    } catch (reporterFailure) {
      // react-error-boundary calls onError unguarded from the topmost boundary, so a sink that
      // throws turns a contained crash into a full-tree unmount. console is the last channel left.
      console.error('the error reporter failed', reporterFailure, report.source);
    }
  };
}
