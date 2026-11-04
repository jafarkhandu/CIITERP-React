/** Normalize common ASP.NET/API wrapper shapes used by the Angular application. */
export function extractArray<T>(response: unknown): T[] {
  let value: unknown = response;

  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(value)) return value as T[];
    if (!value || typeof value !== 'object') return [];

    const record = value as Record<string, unknown>;
    const next =
      record.data ??
      record.result ??
      record.items ??
      record.records ??
      record.list ??
      record.value ??
      record.$values;

    if (next === undefined || next === value) return [];
    value = next;
  }

  return Array.isArray(value) ? (value as T[]) : [];
}

/** Extract an ID from the response envelopes used by employee registration. */
export function extractEntityId(response: unknown): string {
  let value: unknown = response;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== 'object') break;
    const record = value as Record<string, unknown>;
    const id = record.id ?? record.userId ?? record.employeeId;
    if (id !== undefined && id !== null && String(id).trim()) return String(id);
    value = record.data ?? record.result ?? record.user;
  }

  return '';
}
