import i18n from '@/i18n';
import { currencyName } from '@/constants/brand';
import type { Account } from '@/types';

const UAH_NUMERIC = 980;

const MONO_PRETTY: Record<string, string> = {
  eaid: 'eAid',
  fop: 'FOP',
};

function prettyMonoType(type: string): string {
  const lower = type.toLowerCase();
  if (MONO_PRETTY[lower]) return MONO_PRETTY[lower];
  const spaced = type.replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return spaced
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function translateMonoType(type: string): string {
  const norm = type.trim().toLowerCase();
  const key = `mono_type_${norm}`;
  const fallback = prettyMonoType(type);
  return i18n.t(key, { defaultValue: fallback });
}

function nonUahCurrencyLabel(currencyCode: number | undefined): string {
  const c = currencyCode ?? UAH_NUMERIC;
  if (c === UAH_NUMERIC) return '';
  const iso = currencyName(c);
  return iso ? ` ${iso}` : '';
}

function isLegacyConcatenatedCardName(name: string | undefined): boolean {
  if (!name?.trim()) return true;
  if (/\s/.test(name)) return false;
  return /card$/i.test(name);
}

function isAutoMonoDisplayName(name: string | undefined): boolean {
  if (!name?.trim()) return true;
  if (isLegacyConcatenatedCardName(name)) return true;
  const n = name.trim();
  if (/\sMono$/i.test(n) || /\sМоно$/i.test(n)) return true;
  if (/\sMonobank$/i.test(n) || /\sМонобанк$/i.test(n)) return true;
  const parts = n.split(/\s+/);
  if (parts.length === 2 && parts[1].toLowerCase() === 'card') return true;
  return false;
}

export function monoAccountDisplayName(
  acc: Pick<Account, 'name' | 'type' | 'source' | 'currency_code'>,
): string {
  if (acc.source !== 'mono' || !acc.type?.trim()) return acc.name ?? '';
  const brand = i18n.t('mono_bank_brand');
  const cur = nonUahCurrencyLabel(acc.currency_code);
  const localized = `${translateMonoType(acc.type)}${cur} ${brand}`;
  if (isAutoMonoDisplayName(acc.name)) return localized;
  return acc.name ?? localized;
}
