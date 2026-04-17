import { CURRENCY_NAMES } from '@/constants/brand';

/** ISO 4217 numeric → alphabetic (extended for common account currencies + NBU). */
const ISO_NUMERIC: Record<number, string> = {
  ...CURRENCY_NAMES,
  985: 'PLN',
  756: 'CHF',
  203: 'CZK',
  348: 'HUF',
  392: 'JPY',
  124: 'CAD',
  36: 'AUD',
  975: 'BGN',
  946: 'RON',
  949: 'TRY',
  944: 'AZN',
  933: 'BYN',
  398: 'KZT',
  981: 'GEL',
  51: 'AMD',
};

export function numericCodeToIso(code: number | undefined | null): string | null {
  if (code == null) return null;
  const iso = ISO_NUMERIC[code];
  if (iso && !/^\d+$/.test(iso)) return iso;
  return null;
}

/**
 * Convert an amount from `currencyCode` (ISO 4217 numeric) into `systemCurrency` (NBU cc).
 * Uses NBU rates: foreign = UAH per 1 unit; UAH = 1.
 */
export function convertAmountToSystem(
  amount: number,
  currencyCode: number,
  systemCurrency: string,
  allRates: Record<string, number>,
): number | null {
  const from = numericCodeToIso(currencyCode);
  if (!from) return null;
  const sys = systemCurrency.trim();
  if (from === sys) return amount;
  const rFrom = from === 'UAH' ? 1 : allRates[from];
  const rSys = sys === 'UAH' ? 1 : allRates[sys];
  if (rFrom == null || rSys == null || rFrom <= 0 || rSys <= 0) return null;
  const uah = from === 'UAH' ? amount : amount * rFrom;
  return sys === 'UAH' ? uah : uah / rSys;
}
