const BUSINESS_TIME_ZONE = 'Asia/Manila';

function getBusinessDateParts(date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function getBusinessDate(date = new Date()) {
  const { year, month, day } = getBusinessDateParts(date);
  return `${year}-${month}-${day}`;
}

export function getBusinessDateOffset(days, date = new Date()) {
  const [year, month, day] = getBusinessDate(date).split('-').map(Number);
  const offsetDate = new Date(Date.UTC(year, month - 1, day + days));
  return offsetDate.toISOString().slice(0, 10);
}

export function getBusinessMonthStart(date = new Date()) {
  const { year, month } = getBusinessDateParts(date);
  return new Date(Number(year), Number(month) - 1, 1);
}
