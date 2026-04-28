export const DEFAULT_CURRENCIES = ['USD', 'EUR'];
export const CURRENCIES_STORE_KEY = 'selected_display_currencies';

export interface NBURate {
  cc: string;
  rate: number;
  txt: string;
}

export const CURRENCY_FLAGS: Record<string, string> = {
  UAH: '🇺🇦', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', PLN: '🇵🇱',
  CZK: '🇨🇿', CHF: '🇨🇭', JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺',
  HUF: '🇭🇺', NOK: '🇳🇴', SEK: '🇸🇪', DKK: '🇩🇰', RON: '🇷🇴',
  CNY: '🇨🇳', TRY: '🇹🇷', ILS: '🇮🇱', BGN: '🇧🇬', MDL: '🇲🇩',
  ISK: '🇮🇸', BYN: '🇧🇾', KZT: '🇰🇿', GEL: '🇬🇪', AMD: '🇦🇲',
  XAU: '🥇', SGD: '🇸🇬', HKD: '🇭🇰', MXN: '🇲🇽', BRL: '🇧🇷',
  ZAR: '🇿🇦', INR: '🇮🇳', NZD: '🇳🇿', CZK2: '🇨🇿',
};

const SYSTEM_SYMBOLS: Record<string, string> = {
  UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł', CZK: 'Kč', CHF: 'CHF ',
  JPY: '¥', CAD: 'C$', AUD: 'A$', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ',
  HUF: 'Ft ', RON: 'lei ', BGN: 'лв ', TRY: '₺', CNY: '¥',
};

export function systemCurrencySymbol(cc: string): string {
  return SYSTEM_SYMBOLS[cc] ?? `${cc} `;
}
