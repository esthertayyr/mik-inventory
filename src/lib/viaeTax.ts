export const TAX_RATE = .03;
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function quarterDue(year: number, quarter: number) {
  const date = new Date(Date.UTC(year, quarter * 3, 25));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function philippineToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function taxStatus(due: string, filed: boolean, paid: number, tax: number, today = philippineToday()) {
  if (filed && paid >= tax) return 'Filed and paid';
  const days = Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (days < 0) return 'Overdue · review filing/payment';
  if (days <= 30) return `Due in ${days} day${days === 1 ? '' : 's'}`;
  return filed ? 'Filed · payment to review' : 'Upcoming';
}
