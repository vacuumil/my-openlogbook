/**
 * Aircraft that share one type rating. Recency is held on the rating, so landings on an A321 keep
 * an A320 rating current. Codes are compared without spaces, dashes and the NEO/CEO suffixes.
 */
const TYPE_RATINGS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'A320 (A318–A321)', pattern: /^(A3(18|19|20|21)|A(19|20|21)N)/ },
  { label: 'A330', pattern: /^A33\d/ },
  { label: 'A350', pattern: /^A35(\d|K)/ },
  { label: 'B737', pattern: /^(B73\d|B3[789]M|737)/ },
  { label: 'B747', pattern: /^(B74\d|747)/ },
  { label: 'B757/767', pattern: /^(B75\d|B76\d|75\d|76\d)/ },
  { label: 'B777', pattern: /^(B77\d|B77[WL]|777)/ },
  { label: 'B787', pattern: /^(B78\d|B78X|787)/ },
  { label: 'SSJ100', pattern: /^(SSJ|SU9|RRJ)/ },
  { label: 'MC-21', pattern: /^(MC21|MS21)/ },
  { label: 'E170/E190', pattern: /^(E1[79]\d|E2\d\d|E75|E90|ERJ1[79])/ },
  { label: 'CRJ', pattern: /^(CRJ|CL65)/ },
  { label: 'ATR 42/72', pattern: /^(AT[47]\d|ATR)/ },
];

export const normalizeAircraftType = (type: string) =>
  (type || '').toUpperCase().replace(/[\s\-_]/g, '').replace(/(NEO|CEO)$/, '');

/** The rating an aircraft type is flown on; an unknown type is its own rating. */
export function getTypeRating(type: string): string {
  const normalized = normalizeAircraftType(type);
  return TYPE_RATINGS.find(({ pattern }) => pattern.test(normalized))?.label ?? normalized;
}
