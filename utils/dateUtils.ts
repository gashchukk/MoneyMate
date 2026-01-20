// utils/dateUtils.ts
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function formatDisplayDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

export function changeDay(currentDate: Date, diff: number): Date {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + diff);
  return d;
}