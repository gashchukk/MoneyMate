import { Platform, Share } from 'react-native';
import type { TFunction } from 'i18next';
import type { Account, Transaction } from '@/types';
import { currencyName } from '@/constants/brand';
import { displayTxCategoryLabel } from '@/utils/categoryI18n';
import { monoAccountDisplayName } from '@/utils/monoAccountDisplayName';

export type ExportPeriod = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';
export type ExportFormat = 'csv' | 'xlsx';

export type ExportDateRange =
  | { mode: 'preset'; period: ExportPeriod }
  | { mode: 'custom'; from: Date; to: Date };

export type ExportRow = Record<string, string | number>;

const PERIOD_MS: Record<ExportPeriod, number> = {
  '7d': 7 * 86400000,
  '30d': 30 * 86400000,
  '3m': 90 * 86400000,
  '6m': 180 * 86400000,
  '1y': 365 * 86400000,
  all: 0,
};

export function txTimestamp(tx: Transaction): number {
  return tx.time < 1e10 ? tx.time * 1000 : tx.time;
}

export function filterTransactionsByRange(
  transactions: Transaction[],
  range: ExportDateRange,
): Transaction[] {
  if (range.mode === 'preset') {
    if (range.period === 'all') return transactions;
    const cutoff = Date.now() - PERIOD_MS[range.period];
    return transactions.filter(tx => txTimestamp(tx) >= cutoff);
  }

  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  return transactions.filter(tx => {
    const t = txTimestamp(tx);
    return t >= fromMs && t <= toMs;
  });
}

function accountLabel(account: Account | undefined): string {
  if (!account) return '';
  return account.source === 'mono' ? monoAccountDisplayName(account) : account.name;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildExportRows(
  transactions: Transaction[],
  accounts: Account[],
  language: string,
  t: TFunction,
): ExportRow[] {
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';

  return [...transactions]
    .sort((a, b) => txTimestamp(a) - txTimestamp(b))
    .map(tx => {
      const date = new Date(txTimestamp(tx));
      const account = accountMap.get(tx.account_id);
      return {
        [t('export_col_date')]: date.toLocaleDateString(locale),
        [t('export_col_time')]: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        [t('export_col_description')]: tx.description ?? '',
        [t('export_col_amount')]: tx.amount,
        [t('export_col_currency')]: currencyName(tx.currency_code),
        [t('export_col_category')]: displayTxCategoryLabel(tx, language, t),
        [t('export_col_account')]: accountLabel(account),
        [t('export_col_source')]: tx.source,
        [t('export_col_type')]: tx.amount >= 0 ? t('income') : t('expenses'),
      };
    });
}

export function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(h => escapeCsv(String(row[h] ?? ''))).join(',')),
  ];
  return lines.join('\n');
}

function fileStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function shareFile(uri: string, title: string): Promise<void> {
  let shareUrl = uri;
  if (Platform.OS === 'android') {
    const { getContentUriAsync } = await import('expo-file-system/legacy');
    shareUrl = await getContentUriAsync(uri);
  }

  await Share.share({ url: shareUrl, title });
}

export async function shareTransactionExport(
  rows: ExportRow[],
  format: ExportFormat,
  t: TFunction,
): Promise<void> {
  if (rows.length === 0) {
    throw new Error(t('export_no_data'));
  }

  const { File, Paths } = await import('expo-file-system');

  const stamp = fileStamp();
  const dialogTitle = t('export_data');

  if (format === 'csv') {
    const content = '\uFEFF' + rowsToCsv(rows);
    const filename = `moneymate_transactions_${stamp}.csv`;
    const file = new File(Paths.cache, filename);
    file.write(content, { encoding: 'utf8' });
    await shareFile(file.uri, dialogTitle);
    return;
  }

  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t('transactions'));
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const filename = `moneymate_transactions_${stamp}.xlsx`;
  const file = new File(Paths.cache, filename);
  file.write(base64, { encoding: 'base64' });
  await shareFile(file.uri, dialogTitle);
}
