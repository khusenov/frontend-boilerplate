const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TIME_FIELD_DIGITS = 2;
const TIME_FIELD_PAD = '0';

function padTimeField(value: number): string {
  return String(value).padStart(TIME_FIELD_DIGITS, TIME_FIELD_PAD);
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError(
      `formatDuration expects a non-negative finite number, received ${String(milliseconds)}`,
    );
  }

  const totalSeconds = Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);

  if (hours > 0) {
    return `${padTimeField(hours)}:${padTimeField(minutes)}:${padTimeField(seconds)}`;
  }

  return `${padTimeField(minutes)}:${padTimeField(seconds)}`;
}
