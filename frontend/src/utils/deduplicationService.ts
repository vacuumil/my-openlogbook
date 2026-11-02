import { db, LocalFlight } from '../db/db';
import { ParsedUniversalFlight } from './universalFlightParser';

export interface DeduplicationSummary {
  totalParsed: number;
  newFlightsCount: number;
  duplicatesCount: number;
  totalTimeMinutesToAdd: number;
}

/**
 * Checks parsed flights against existing database records.
 * Marks duplicates and unchecks them by default.
 */
export async function applyDeduplication(
  parsedFlights: ParsedUniversalFlight[]
): Promise<{ flights: ParsedUniversalFlight[]; summary: DeduplicationSummary }> {
  const existingFlights: LocalFlight[] = await db.flights
    .filter((f) => f.syncStatus !== 'deleted')
    .toArray();

  let duplicatesCount = 0;
  let newFlightsCount = 0;
  let totalTimeMinutesToAdd = 0;

  const processedFlights = parsedFlights.map((flight) => {
    // Look for matching flight by date and route
    const duplicateMatch = existingFlights.find((ef) => {
      if (ef.date !== flight.date) return false;
      if (ef.depIcao.toUpperCase() !== flight.depIcao.toUpperCase()) return false;
      if (ef.arrIcao.toUpperCase() !== flight.arrIcao.toUpperCase()) return false;

      // Exact out time match
      if (ef.outTimeUtc && flight.outTimeUtc && ef.outTimeUtc === flight.outTimeUtc) {
        return true;
      }

      // If out times differ by less than 45 minutes, it's considered the same leg
      if (ef.outTimeUtc && flight.outTimeUtc) {
        const [eh, em] = ef.outTimeUtc.split(':').map(Number);
        const [fh, fm] = flight.outTimeUtc.split(':').map(Number);
        const diffMinutes = Math.abs((eh * 60 + em) - (fh * 60 + fm));
        if (diffMinutes <= 45) return true;
      }

      return true;
    });

    if (duplicateMatch) {
      duplicatesCount++;
      return {
        ...flight,
        isDuplicate: true,
        selected: false, // Unchecked by default
        duplicateReason: `Рейс ${flight.depIcao}→${flight.arrIcao} уже сохранен на ${flight.date} (${duplicateMatch.outTimeUtc})`,
      };
    } else {
      newFlightsCount++;
      totalTimeMinutesToAdd += flight.totalTimeMinutes || 0;
      return {
        ...flight,
        isDuplicate: false,
        selected: true,
      };
    }
  });

  return {
    flights: processedFlights,
    summary: {
      totalParsed: parsedFlights.length,
      newFlightsCount,
      duplicatesCount,
      totalTimeMinutesToAdd,
    },
  };
}
