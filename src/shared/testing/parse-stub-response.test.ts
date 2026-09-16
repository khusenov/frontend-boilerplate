import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseStubResponse } from './parse-stub-response';

const greetingSchema = z.object({ greeting: z.string() });

describe('parseStubResponse', () => {
  it('resolves the value the schema produced', async () => {
    await expect(
      parseStubResponse(greetingSchema, { greeting: 'hello', unread: true }),
    ).resolves.toStrictEqual({ greeting: 'hello' });
  });

  it('rejects a body the schema refuses the way the transport does', async () => {
    await expect(parseStubResponse(greetingSchema, { greeting: 42 })).rejects.toMatchObject({
      name: 'HttpError',
      kind: 'validation',
      issues: [{ path: 'greeting' }],
    });
  });
});
