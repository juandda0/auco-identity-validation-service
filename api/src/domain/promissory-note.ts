import { createHash } from 'node:crypto';
import { dateInColombia } from './dates.js';
import type { ValidationRecord } from './validation.js';
import type { PromissoryNoteFields } from './document.js';

/**
 * Renders a demo promissory note ("pagaré") with the validated identity.
 * The text is in Spanish because it is a Colombian-style legal document;
 * it is clearly marked as a demo without legal value.
 */
export function renderPromissoryNote(
  debtor: Pick<ValidationRecord, 'name' | 'documentNumber' | 'country'>,
  fields: PromissoryNoteFields,
  issuedOn: Date,
): string {
  const amount = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: fields.currency,
  }).format(fields.amount);
  const issued = dateInColombia(issuedOn);

  return [
    'DOCUMENTO DE DEMOSTRACIÓN - SIN VALIDEZ LEGAL',
    '',
    `PAGARÉ No. ${issued.replaceAll('-', '')}-${debtor.documentNumber}`,
    '',
    `Yo, ${debtor.name}, identificado(a) con documento No. ${debtor.documentNumber} de ${debtor.country.name},`,
    `me obligo a pagar incondicionalmente a la orden de ${fields.creditorName}`,
    `la suma de ${amount} (${fields.currency}),`,
    `el día ${fields.dueDate}, en la ciudad de ${fields.city}.`,
    '',
    'En caso de mora pagaré intereses a la tasa máxima legal permitida.',
    '',
    `Lugar y fecha de emisión: ${fields.city}, ${issued}.`,
    '',
    `Firma del deudor: ${debtor.name}`,
  ].join('\n');
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
