import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vite serves these files correctly in development, so only a check on the real config catches a regression
describe('nginx config', () => {
  const config = readFileSync('nginx.conf', 'utf8');

  it('serves module scripts such as the PDF worker as JavaScript', () => {
    expect(config).toMatch(/application\/javascript\s+js\s+mjs;/);
  });

  it('keeps security headers on every location that adds its own headers', () => {
    const locations = config.split(/\n\s*location /).slice(1);
    locations
      .filter((block) => block.includes('add_header'))
      .forEach((block) => expect(block).toContain('security-headers.conf'));
  });
});
