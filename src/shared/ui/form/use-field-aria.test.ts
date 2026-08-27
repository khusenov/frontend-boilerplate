import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FieldAriaOptions, FieldAriaSource } from './use-field-aria';
import { useFieldAria } from './use-field-aria';

const FALLBACK_MESSAGE = 'This value is invalid.';

function createField(meta: Partial<FieldAriaSource['state']['meta']> = {}): FieldAriaSource {
  return {
    state: { meta: { errors: [], isBlurred: false, isValid: true, ...meta } },
  };
}

function createOptions(overrides: Partial<FieldAriaOptions> = {}): FieldAriaOptions {
  return {
    fallbackMessage: FALLBACK_MESSAGE,
    hasDescription: false,
    hasSubmitted: false,
    ...overrides,
  };
}

describe('useFieldAria', () => {
  it('stays silent while the field is neither blurred nor submitted', () => {
    const field = createField({ errors: ['Required'], isValid: false });

    const { result } = renderHook(() => useFieldAria(field, createOptions()));

    expect(result.current.isInvalid).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.describedBy).toBeUndefined();
  });

  it('reveals the error once the field is blurred', () => {
    const field = createField({ errors: ['Required'], isBlurred: true, isValid: false });

    const { result } = renderHook(() => useFieldAria(field, createOptions()));

    expect(result.current.isInvalid).toBe(true);
    expect(result.current.messages).toEqual(['Required']);
    expect(result.current.describedBy).toBe(result.current.errorId);
  });

  it('reveals the error after a submit attempt even when the field was never blurred', () => {
    const field = createField({ errors: ['Required'], isValid: false });

    const { result } = renderHook(() => useFieldAria(field, createOptions({ hasSubmitted: true })));

    expect(result.current.isInvalid).toBe(true);
    expect(result.current.messages).toEqual(['Required']);
  });

  it('stays valid when a blurred field passes validation', () => {
    const field = createField({ isBlurred: true });

    const { result } = renderHook(() => useFieldAria(field, createOptions()));

    expect(result.current.isInvalid).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it('links a description even while the field is valid', () => {
    const field = createField();

    const { result } = renderHook(() =>
      useFieldAria(field, createOptions({ hasDescription: true })),
    );

    expect(result.current.describedBy).toBe(result.current.descriptionId);
  });

  it('links the description before the error when both are present', () => {
    const field = createField({ errors: ['Required'], isBlurred: true, isValid: false });

    const { result } = renderHook(() =>
      useFieldAria(field, createOptions({ hasDescription: true })),
    );

    expect(result.current.describedBy).toBe(
      `${result.current.descriptionId} ${result.current.errorId}`,
    );
  });

  it('appends a caller describedBy token instead of replacing the seam ids', () => {
    const field = createField({ errors: ['Required'], isBlurred: true, isValid: false });

    const { result } = renderHook(() =>
      useFieldAria(field, createOptions({ describedBy: 'password-requirements' })),
    );

    expect(result.current.describedBy).toBe(`${result.current.errorId} password-requirements`);
  });

  it('roots every id on a caller id so an error summary can link to the control', () => {
    const field = createField();

    const { result } = renderHook(() => useFieldAria(field, createOptions({ id: 'email' })));

    expect(result.current.controlId).toBe('email');
    expect(result.current.descriptionId).toBe('email-description');
    expect(result.current.errorId).toBe('email-error');
  });

  it('falls back to the injected message when no error can be stringified', () => {
    const field = createField({
      errors: [{ code: 'too_small' }],
      isBlurred: true,
      isValid: false,
    });

    const { result } = renderHook(() => useFieldAria(field, createOptions()));

    expect(result.current.isInvalid).toBe(true);
    expect(result.current.messages).toEqual([FALLBACK_MESSAGE]);
  });
});
