import { isAxiosError } from 'axios';

/** HTTP status, or 0 when the server could not be reached. */
export function httpStatus(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  return error.response ? error.response.status : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function field(value: Record<string, unknown> | undefined, name: string): unknown {
  if (!value) return undefined;
  const key = Object.keys(value).find(item => item.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : value[key];
}

function plainMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const message = value.trim();
  // Do not display proxy HTML pages, raw markup or exception stack traces.
  if (/^\s*<|<\/?[a-z][^>]*>|\n\s*at\s+[\w.$]+[.(]/i.test(message)) return '';
  return message;
}

function validationMessages(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof value === 'string') {
    const message = plainMessage(value);
    return message ? [message] : [];
  }
  if (Array.isArray(value)) return value.flatMap(item => validationMessages(item, depth + 1));
  const record = asRecord(value);
  if (!record) return [];
  const direct = ['errorMessage', 'message', 'detail']
    .map(key => plainMessage(field(record, key))).find(Boolean);
  if (direct) return [direct];
  return Object.values(record).flatMap(item => validationMessages(item, depth + 1));
}

/** Prefer actionable backend validation errors over a generic ProblemDetails title. */
export function backendErrorMessage(body: unknown, depth = 0): string {
  if (depth > 4) return '';
  if (typeof body === 'string') {
    const message = plainMessage(body);
    if (!message) return '';
    if (/^[{\[]/.test(message)) {
      try {
        return backendErrorMessage(JSON.parse(message), depth + 1);
      } catch {
        return '';
      }
    }
    return message;
  }
  if (Array.isArray(body)) return [...new Set(validationMessages(body))].join(' ');
  const record = asRecord(body);
  if (!record) return '';

  const validation = ['errors', 'validationErrors', 'modelState']
    .flatMap(key => validationMessages(field(record, key)));
  if (validation.length) return [...new Set(validation)].join(' ');

  const nested = ['data', 'result', 'error']
    .map(key => field(record, key))
    .filter(value => value !== null && typeof value === 'object')
    .map(value => backendErrorMessage(value, depth + 1)).find(Boolean);
  if (nested) return nested;

  return ['message', 'detail', 'errorMessage', 'error', 'title']
    .map(key => plainMessage(field(record, key))).find(Boolean) || '';
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    return backendErrorMessage(error.response?.data) || fallback;
  }
  return fallback;
}
