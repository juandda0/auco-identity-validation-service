/** Country data used to enrich a validation. */
export interface CountryInfo {
  code: string;
  name: string;
  region: string;
  incomeLevel: string;
  capital: string | null;
}
