import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LocalFlight } from '../db/db';
import { buildLogbookPdf } from './logbookPrint';

const flight = (index: number, overrides: Partial<LocalFlight> = {}): LocalFlight =>
  ({
    id: `f${index}`,
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    depIcao: 'UUEE',
    arrIcao: 'ULLI',
    outTimeUtc: '08:00',
    inTimeUtc: '09:30',
    totalTimeMinutes: 90,
    nightTimeMinutes: 0,
    ifrTimeMinutes: 90,
    picTimeMinutes: 0,
    picusTimeMinutes: 0,
    sicTimeMinutes: 90,
    dualTimeMinutes: 0,
    landingsDay: 1,
    landingsNight: 0,
    aircraftType: 'A320',
    aircraftReg: 'RA-73001',
    remarks: 'Заход ILS',
    ...overrides,
  }) as LocalFlight;

async function pdfText(buffer: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push((content.items as Array<{ str: string }>).map((item) => item.str).join(' '));
  }
  return pages;
}

describe('buildLogbookPdf', () => {
  beforeAll(() => {
    // The app loads its fonts over HTTP; here they come straight from the public folder
    vi.stubGlobal('fetch', async (url: string) => {
      const data = readFileSync(`public${url}`);
      return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
    });
  });

  it('prints Russian pages with Cyrillic text and carried totals', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => flight(i));
    const doc = await buildLogbookPdf(entries, 'ru', { fullName: 'Пилот Тестовый', previousTotalHours: 100 } as any);

    const pages = await pdfText(doc.output('arraybuffer'));

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('ЛЁТНАЯ КНИЖКА');
    expect(pages[0]).toContain('Пилот Тестовый');
    expect(pages[0]).toContain('Заход ILS');
    // Page 1: 16 flights x 1:30 = 24:00 on top of the 100 transferred hours
    expect(pages[0]).toContain('Итого за страницу');
    expect(pages[0]).toContain('124:00');
    // Page 2 starts from 124:00 and adds 4 x 1:30
    expect(pages[1]).toContain('Перенесено');
    expect(pages[1]).toContain('130:00');
  });

  it('prints EASA pages with simulator sessions in the FSTD column', async () => {
    const entries = [flight(0), flight(1, { entryType: 'simulator', simDevice: 'FFS', totalTimeMinutes: 240 })];
    const doc = await buildLogbookPdf(entries, 'easa');

    const [page] = await pdfText(doc.output('arraybuffer'));

    expect(page).toContain('PILOT LOGBOOK');
    expect(page).toContain('FFS A320');
    expect(page).toContain('TOTAL TIME');
    expect(page).toContain('04:00');
  });

  it('refuses an empty logbook', async () => {
    await expect(buildLogbookPdf([], 'ru')).rejects.toThrow('Нет записей');
  });
});
