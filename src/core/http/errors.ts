import { isAxiosError } from 'axios';

/** HTTP status, or 0 when the server could not be reached. */
export function httpStatus(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  return error.response ? error.response.status : 0;
}

/** Same fallback chain the Angular code used: error.error.message || error.error.title || fallback */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; title?: string } | undefined;
    return data?.message || data?.title || fallback;
  }
  return fallback;
}
