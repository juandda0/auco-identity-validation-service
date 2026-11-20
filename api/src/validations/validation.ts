import type { CountryInfo } from '../clients/countries.js';
import type { RiskAssessment } from '../risk/risk-engine.js';

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

export interface ValidationRepository {
  insert(record: ValidationRecord): Promise<void>;
  findById(id: string): Promise<ValidationRecord | null>;
  deleteById(id: string): Promise<void>;
}
