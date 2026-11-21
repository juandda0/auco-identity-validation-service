import type { CountryInfo } from './country.js';
import type { RiskAssessment } from './risk-engine.js';

/** A validated identity, enriched with country data and a risk verdict. */
export interface ValidationRecord {
  id: string;
  name: string;
  normalizedName: string;
  documentNumber: string;
  countryCode: string;
  phone: string | null;
  country: CountryInfo;
  risk: RiskAssessment;
  createdAt: Date;
}
