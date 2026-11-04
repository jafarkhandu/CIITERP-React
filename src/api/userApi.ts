// Port of UserApi: GET /User/get-all-users with the Angular cache key.
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

function extractUsers(value: any): User[] {
  let current = value;
  for (let depth = 0; depth < 5 && current && !Array.isArray(current); depth += 1) {
    current = current.data ?? current.result ?? current.items ?? current.records ?? current.value ?? current.$values;
  }
  return Array.isArray(current) ? current as User[] : [];
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
      .then((response) => {
        const users = extractUsers(response.data);
        saveCache(users);
        return users;
      })
      .catch((error) => {
        usersPromise = null;
        throw error;
      });
  }
  return usersPromise ?? Promise.resolve([]);
}

export function clearUsersCache() {
  usersPromise = null;
  localStorage.removeItem(CACHE_KEY);
}

/** Finds the logged-in user by employee code, username or email. */
export function findCurrentUser(users: User[], loginName: string): User | undefined {
  const normalized = loginName.trim().toLowerCase();
  return users.find((user) =>
    user.employeeCode?.trim().toLowerCase() === normalized ||
    user.userName?.trim().toLowerCase() === normalized ||
    user.emailAddress?.trim().toLowerCase() === normalized,
  );
}
