/** Business dates are Colombian: a UTC date is already "tomorrow" after 19:00 in Bogotá. */
const COLOMBIA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

/** YYYY-MM-DD of `date` in Colombia. */
export function dateInColombia(date: Date): string {
  return COLOMBIA_DATE.format(date);
}
