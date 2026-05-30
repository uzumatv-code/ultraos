const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toDateOnly(value?: string | Date | null) {
  if (!value) return '';

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const text = String(value);
  if (DATE_ONLY_RE.test(text)) return text;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return toDateOnly(date);
}

export function parseLocalDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const dateOnly = String(value).match(DATE_ONLY_RE);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(value?: string | Date | null) {
  const dateOnly = toDateOnly(value);
  const date = parseLocalDate(dateOnly);
  return date ? date.toLocaleDateString('pt-BR') : '';
}

export function addDaysToDateOnly(value: string, days: number) {
  const date = parseLocalDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}
