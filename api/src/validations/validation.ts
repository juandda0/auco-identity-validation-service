import type { CountryInfo } from '../clients/countries.js';

export interface ValidationRecord {
  id: string;
  name: string;
  normalizedName: string;
  documentNumber: string;
  countryCode: string;
  phone: string | null;
  country: CountryInfo;
  createdAt: Date;
}

export interface ValidationRepository {
  insert(record: ValidationRecord): Promise<void>;
  findById(id: string): Promise<ValidationRecord | null>;
  deleteById(id: string): Promise<void>;
}
