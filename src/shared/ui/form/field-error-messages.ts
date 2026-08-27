function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function toMessage(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error.trim().length > 0 ? error : undefined;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;

    return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
  }

  return undefined;
}

export function toFieldErrorMessages(errors: unknown): readonly string[] {
  if (!isUnknownArray(errors)) {
    return [];
  }

  const messages: string[] = [];

  for (const error of errors) {
    const message = toMessage(error);

    if (message !== undefined && !messages.includes(message)) {
      messages.push(message);
    }
  }

  return messages;
}
