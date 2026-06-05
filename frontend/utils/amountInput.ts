/** Keep digits and at most one decimal separator while typing. */
export function sanitizeAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.,]/g, '');
  const sepIdx = cleaned.search(/[.,]/);
  if (sepIdx === -1) return cleaned;

  const intPart = cleaned.slice(0, sepIdx);
  const fracPart = cleaned.slice(sepIdx + 1).replace(/[.,]/g, '');
  return `${intPart}.${fracPart}`;
}

/** Parse amount text; accepts comma or period as decimal separator. */
export function parseAmountInput(text: string): number {
  const normalized = text.trim().replace(',', '.');
  return parseFloat(normalized);
}
