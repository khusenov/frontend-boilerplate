import { parseResponse } from '@/shared/api';
import type { ExchangeContext, ResponseSchema } from '@/shared/api';

const STUBBED_EXCHANGE: ExchangeContext = {
  method: 'STUB',
  url: 'stubbed-response',
  status: 200,
};

export function parseStubResponse<TValue>(
  schema: ResponseSchema<TValue>,
  body: unknown,
): Promise<TValue> {
  return parseResponse(schema, body, STUBBED_EXCHANGE);
}
