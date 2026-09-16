import { describe, expect, it } from 'vitest';

import { createDocumentThemeApplier } from './create-document-theme-applier';

describe('createDocumentThemeApplier', () => {
  it('marks the element dark and tells the browser its colour scheme', () => {
    const element = document.createElement('html');

    createDocumentThemeApplier(element)('dark');

    expect(element.classList.contains('dark')).toBe(true);
    expect(element.style.colorScheme).toBe('dark');
  });

  it('leaves the element unmarked and light', () => {
    const element = document.createElement('html');

    createDocumentThemeApplier(element)('light');

    expect(element.classList.contains('dark')).toBe(false);
    expect(element.style.colorScheme).toBe('light');
  });

  it('moves the class and the colour scheme back together', () => {
    const element = document.createElement('html');
    const applyTheme = createDocumentThemeApplier(element);

    applyTheme('dark');
    applyTheme('light');

    expect(element.classList.contains('dark')).toBe(false);
    expect(element.style.colorScheme).toBe('light');
  });

  it('applies to the document element by default', () => {
    createDocumentThemeApplier()('dark');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
