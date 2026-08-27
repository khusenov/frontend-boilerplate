import { describe, expect, it } from 'vitest';

import { toFieldErrorMessages } from './field-error-messages';

describe('toFieldErrorMessages', () => {
  it('returns an empty array for undefined', () => {
    expect(toFieldErrorMessages(undefined)).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(toFieldErrorMessages(null)).toEqual([]);
  });

  it('returns an empty array for a non-array value', () => {
    expect(toFieldErrorMessages('Required')).toEqual([]);
  });

  it('maps plain string errors through unchanged', () => {
    expect(toFieldErrorMessages(['Required', 'Too short'])).toEqual(['Required', 'Too short']);
  });

  it('maps standard schema issues to their message', () => {
    const issues = [
      { message: 'Required', path: ['email'] },
      { message: 'Invalid email address', path: ['email'] },
    ];

    expect(toFieldErrorMessages(issues)).toEqual(['Required', 'Invalid email address']);
  });

  it('de-duplicates identical messages arriving from two validators', () => {
    expect(toFieldErrorMessages(['Required', { message: 'Required' }])).toEqual(['Required']);
  });

  it('drops empty and whitespace-only messages', () => {
    expect(toFieldErrorMessages(['', '   ', { message: '' }, { message: '  ' }])).toEqual([]);
  });

  it('drops null as an array element', () => {
    expect(toFieldErrorMessages([null])).toEqual([]);
  });

  it('drops an error object whose message is not a string', () => {
    expect(toFieldErrorMessages([{ message: 42 }])).toEqual([]);
  });

  it('drops an error object carrying no message at all', () => {
    expect(toFieldErrorMessages([{ code: 'too_small' }])).toEqual([]);
  });
});
