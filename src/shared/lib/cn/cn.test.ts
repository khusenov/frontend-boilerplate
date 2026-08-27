import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('drops falsy values', () => {
    expect(cn('flex', false, null, undefined, '')).toBe('flex');
  });

  it('keeps the last of two conflicting tailwind utilities', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('resolves conflicts across conditional inputs', () => {
    expect(cn('p-4', { 'p-8': true, 'p-2': false })).toBe('p-8');
  });
});
