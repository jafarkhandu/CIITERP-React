import { emailApi } from '@/api/emailApi';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDRESS_KEYS = [
  'emailAddress', 'email_address', 'email_Address', 'EmailAddress', 'email',
  'studentEmail', 'student_email', 'student_Email', 'emailId', 'email_id',
];
const NESTED_KEYS = ['student', 'studentDetails', 'student_details', 'registration', 'studentRegistration'];

export function emailAddressFrom(value: unknown): string {
  if (typeof value === 'string') {
    const address = value.trim();
    return EMAIL_PATTERN.test(address) ? address : '';
  }
  if (!value || typeof value !== 'object') return '';

  const row = value as Record<string, unknown>;
  for (const key of ADDRESS_KEYS) {
    const address = emailAddressFrom(row[key]);
    if (address) return address;
  }
  for (const key of NESTED_KEYS) {
    const nested = row[key];
    if (nested && typeof nested === 'object') {
      const nestedRow = nested as Record<string, unknown>;
      for (const addressKey of ADDRESS_KEYS) {
        const address = emailAddressFrom(nestedRow[addressKey]);
        if (address) return address;
      }
    }
  }
  return '';
}

/**
 * Best-effort notification after a successful business action.
 * Email delivery must never turn a completed save into a failed save.
 */
export function sendAutomaticEmail(recipient: unknown, subject: string, body: string): void {
  const toEmail = emailAddressFrom(recipient);
  if (!toEmail) {
    console.warn('Automatic email skipped: recipient address is unavailable.', subject);
    return;
  }

  void emailApi.send({ toEmail, subject, body, isHtml: false }).catch((error: unknown) => {
    console.error('Automatic email request failed:', subject, error);
  });
}

export function sendUniqueAutomaticEmails(recipients: unknown[], subject: string, body: string): void {
  const sent = new Set<string>();
  for (const recipient of recipients) {
    const email = emailAddressFrom(recipient);
    if (!email || sent.has(email.toLowerCase())) continue;
    sent.add(email.toLowerCase());
    sendAutomaticEmail(email, subject, body);
  }
  if (!sent.size && recipients.length) {
    console.warn('Automatic email skipped: no recipient emails available.', subject);
  }
}
