import { describe, expect, it } from 'vitest';
import { LocalFlight } from '../db/db';
import { emptyLogbookTotals, paginateLogbook, printableEntries } from './logbookPages';

const entry = (overrides: Partial<LocalFlight> = {}): LocalFlight =>
  ({
    id: crypto.randomUUID(),
    date: '2026-10-01',
    outTimeUtc: '08:00',
    totalTimeMinutes: 100,
    nightTimeMinutes: 10,
    ifrTimeMinutes: 100,
    picTimeMinutes: 0,
    picusTimeMinutes: 0,
    sicTimeMinutes: 100,
    dualTimeMinutes: 0,
    landingsDay: 1,
    landingsNight: 0,
    ...overrides,
  }) as LocalFlight;

describe('printableEntries', () => {
  it('keeps confirmed flights and simulator sessions in date order', () => {
    const entries = printableEntries([
      entry({ date: '2026-10-03' }),
      entry({ date: '2026-10-01', status: 'draft' }),
      entry({ date: '2026-10-02', entryType: 'ground' }),
      entry({ date: '2026-10-01', entryType: 'simulator' }),
      entry({ date: '2026-10-03', outTimeUtc: '06:00' }),
    ]);

    expect(entries.map((e) => [e.date, e.entryType ?? 'flight', e.outTimeUtc])).toEqual([
      ['2026-10-01', 'simulator', '08:00'],
      ['2026-10-03', 'flight', '06:00'],
      ['2026-10-03', 'flight', '08:00'],
    ]);
  });
});

describe('paginateLogbook', () => {
  it('carries totals from page to page, starting from the transferred hours', () => {
    const carriedIn = { ...emptyLogbookTotals(), totalMinutes: 6000, landingsDay: 50 };
    const pages = paginateLogbook(
      Array.from({ length: 5 }, (_, i) => entry({ date: `2026-10-0${i + 1}` })),
      2,
      carriedIn
    );

    expect(pages.map((page) => page.entries.length)).toEqual([2, 2, 1]);
    expect(pages[0].broughtForward.totalMinutes).toBe(6000);
    expect(pages[0].page.totalMinutes).toBe(200);
    expect(pages[1].broughtForward.totalMinutes).toBe(6200);
    expect(pages[2].toDate).toMatchObject({ totalMinutes: 6500, landingsDay: 55, copilotMinutes: 500 });
  });

  it('puts simulator time in its own column only', () => {
    const [page] = paginateLogbook([entry(), entry({ entryType: 'simulator', totalTimeMinutes: 240, landingsDay: 6 })], 10);

    expect(page.page).toMatchObject({ totalMinutes: 100, simulatorMinutes: 240, landingsDay: 1 });
  });

  it('counts PICUS as PIC time', () => {
    const [page] = paginateLogbook([entry({ sicTimeMinutes: 0, picusTimeMinutes: 100 })], 10);

    expect(page.page.picMinutes).toBe(100);
  });

  it('returns no pages for an empty logbook', () => {
    expect(paginateLogbook([], 10)).toEqual([]);
  });
});
