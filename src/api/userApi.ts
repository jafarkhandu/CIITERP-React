// Port of UserApi: GET /User/get-all-users, with the same localStorage cache
// (cached copy is available instantly, fresh copy is fetched once per page load).
import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import type { User } from '@/types/user';

const CACHE_KEY = 'erp-users-cache';
let usersPromise: Promise<User[]> | null = null;

export function getCachedUsers(): User[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const users = JSON.parse(raw);
    return Array.isArray(users) && users.length ? users : null;
  } catch {
    return null;
  }
}

function saveCache(users: User[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(users));
  } catch (error) {
    console.warn('Could not cache users:', error);
  }
}

export function getAllUsers(): Promise<User[]> {
  if (!usersPromise) {
    usersPromise = http
      .get(`${API_ENDPOINTS.user}/get-all-users`)
      .then((r) => {
        const users: User[] = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
        saveCache(users);
        return users;
      })
      .catch((error) => {
        usersPromise = null; // don't keep a failed request cached
        throw error;
      });
  }
  return usersPromise;
}

export function clearUsersCache() {
  usersPromise = null;
  localStorage.removeItem(CACHE_KEY);
}

/** Finds the logged-in user in the users list (by employee code, username or email). */
export function findCurrentUser(users: User[], loginName: string): User | undefined {
  const u = loginName.trim().toLowerCase();
  return users.find(
    (x) =>
      x.employeeCode?.trim().toLowerCase() === u ||
      x.userName?.trim().toLowerCase() === u ||
      x.emailAddress?.trim().toLowerCase() === u,
  );
}
