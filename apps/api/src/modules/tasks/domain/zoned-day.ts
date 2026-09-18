export function formatYmd(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Unable to format a zoned date');
  }
  return `${year}-${month}-${day}`;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function zonedLocalToUtc(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-').map(Number);
  if (yearRaw === undefined || monthRaw === undefined || dayRaw === undefined) {
    throw new Error(`Invalid zoned date: ${ymd}`);
  }
  const year = yearRaw;
  const month = monthRaw;
  const day = dayRaw;
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const got = zonedParts(new Date(utc), timeZone);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const wantUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    utc += wantUtc - gotUtc;
  }
  return new Date(utc);
}

export function startOfZonedDay(now: Date, timeZone: string): Date {
  return zonedLocalToUtc(formatYmd(now, timeZone), 0, 0, 0, timeZone);
}

export function startOfNextZonedDay(now: Date, timeZone: string): Date {
  const later = new Date(startOfZonedDay(now, timeZone).getTime() + 26 * 60 * 60 * 1000);
  return startOfZonedDay(later, timeZone);
}
