export const MIN_BIRTH_DATE = '1900-01-01';

export function localToday(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Validate calendar dates without timezone conversion or Date rollover. */
export function dateOfBirthError(value: string, today = localToday()): string {
  if (!value) return 'Date of birth is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Enter a valid date of birth with a four-digit year.';
  }

  const [year, month, day] = value.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return 'Enter a valid calendar date of birth.';
  }
  if (value < MIN_BIRTH_DATE) return 'Date of birth must be in 1900 or later.';
  if (value > today) return 'Date of birth cannot be in the future.';
  return '';
}
