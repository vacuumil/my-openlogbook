import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('neutralizes markup from imported text', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('keeps ordinary aircraft types intact', () => {
    expect(escapeHtml('A320, SSJ100')).toBe('A320, SSJ100');
  });
});
