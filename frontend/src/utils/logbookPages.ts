import { LocalFlight } from '../db/db';
import { entryTypeOf, isDraft } from './entries';

export interface LogbookTotals {
  totalMinutes: number;
  nightMinutes: number;
  ifrMinutes: number;
  picMinutes: number;
  copilotMinutes: number;
  dualMinutes: number;
  instructorMinutes: number;
  landingsDay: number;
  landingsNight: number;
  simulatorMinutes: number;
}

export interface LogbookPage {
  number: number;
  entries: LocalFlight[];
  /** Sum of this page only */
  page: LogbookTotals;
  /** Everything before this page, the transferred career hours included */
  broughtForward: LogbookTotals;
  /** broughtForward + page: what the next page starts from */
  toDate: LogbookTotals;
}

export const emptyLogbookTotals = (): LogbookTotals => ({
  totalMinutes: 0,
  nightMinutes: 0,
  ifrMinutes: 0,
  picMinutes: 0,
  copilotMinutes: 0,
  dualMinutes: 0,
  instructorMinutes: 0,
  landingsDay: 0,
  landingsNight: 0,
  simulatorMinutes: 0,
});

const addTotals = (a: LogbookTotals, b: LogbookTotals): LogbookTotals =>
  Object.fromEntries(
    (Object.keys(a) as Array<keyof LogbookTotals>).map((key) => [key, a[key] + b[key]])
  ) as unknown as LogbookTotals;

/** What one entry adds to the columns. A simulator session only fills the FSTD column. */
export function entryTotals(entry: LocalFlight): LogbookTotals {
  const totals = emptyLogbookTotals();
  if (entryTypeOf(entry) === 'simulator') {
    totals.simulatorMinutes = entry.totalTimeMinutes || 0;
    return totals;
  }
  totals.totalMinutes = entry.totalTimeMinutes || 0;
  totals.nightMinutes = entry.nightTimeMinutes || 0;
  totals.ifrMinutes = entry.ifrTimeMinutes || 0;
  totals.picMinutes = (entry.picTimeMinutes || 0) + (entry.picusTimeMinutes || 0);
  totals.copilotMinutes = entry.sicTimeMinutes || 0;
  totals.dualMinutes = entry.dualTimeMinutes || 0;
  totals.instructorMinutes = entry.instructorTimeMinutes || 0;
  totals.landingsDay = entry.landingsDay || 0;
  totals.landingsNight = entry.landingsNight || 0;
  return totals;
}

/** Entries a printed logbook holds: confirmed flights and simulator sessions, oldest first. */
export function printableEntries(entries: LocalFlight[]): LocalFlight[] {
  return entries
    .filter((entry) => !isDraft(entry) && entryTypeOf(entry) !== 'ground')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.outTimeUtc || '').localeCompare(b.outTimeUtc || ''));
}

/**
 * Splits the logbook into fixed-size pages and carries the totals from page to page, as a paper
 * logbook does: each page shows its own sum, the total brought forward and the total to date.
 */
export function paginateLogbook(
  entries: LocalFlight[],
  rowsPerPage: number,
  carriedIn: LogbookTotals = emptyLogbookTotals()
): LogbookPage[] {
  const printable = printableEntries(entries);
  const pages: LogbookPage[] = [];
  let broughtForward = carriedIn;

  for (let start = 0; start < printable.length; start += rowsPerPage) {
    const pageEntries = printable.slice(start, start + rowsPerPage);
    const page = pageEntries.map(entryTotals).reduce(addTotals, emptyLogbookTotals());
    const toDate = addTotals(broughtForward, page);
    pages.push({ number: pages.length + 1, entries: pageEntries, page, broughtForward, toDate });
    broughtForward = toDate;
  }

  return pages;
}
