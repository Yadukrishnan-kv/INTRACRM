/** Amounts from the API are integer minor units (paise for INR). */
export function formatMoney(minor: number | null | undefined, currency = 'INR'): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/** Percentages from the API are basis points: 7250 → 72.5%. */
export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Date-only values ("2026-10-20") are calendar days; `new Date` would read them as UTC midnight.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function humanize(code: string | null | undefined): string {
  if (!code) return '—';
  const text = code.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
