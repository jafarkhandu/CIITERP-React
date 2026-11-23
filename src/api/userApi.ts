// Port of UserApi: GET /User/get-all-users with the Angular cache key.
import { isCancel } from 'axios';
import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { userSession } from '@/core/auth/session';
import { hasStudentRole, isStaffRole } from '@/core/auth/tokenIdentity';
import type { User } from '@/types/user';

const CACHE_KEY = 'erp-users-cache';
let usersRequest: { generation: number; promise: Promise<User[]> } | null = null;

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
  const { generation } = userSession.getSnapshot();
  if (usersRequest?.generation === generation) return usersRequest.promise;

  const promise = http
    .get(`${API_ENDPOINTS.user}/get-all-users`)
    .then((response) => {
      const users = extractUsers(response.data);
      if (usersRequest?.promise === promise && userSession.getSnapshot().generation === generation) saveCache(users);
      return users;
    })
    .catch((error) => {
      if (usersRequest?.promise === promise) usersRequest = null;
      throw error;
    });

  usersRequest = { generation, promise };
  return promise;
}

export function clearUsersCache() {
  usersRequest = null;
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

function profileRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textField(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && !!value.trim())?.trim();
}

function readProfile(response: unknown, initialUser?: User | null): User | undefined {
  let profile = profileRecord(response);
  for (let depth = 0; profile && depth < 5; depth += 1) {
    const nested = profileRecord(profile.data ?? profile.result ?? profile.value);
    if (!nested) break;
    profile = nested;
  }
  if (!profile) return undefined;

  const id = textField(profile.userId, profile.id);
  const userName = textField(profile.username, profile.userName);
  const employeeName = textField(profile.employeeName);
  const employeeCode = textField(profile.employeeCode);
  const emailAddress = textField(profile.emailAddress);
  const mobileNumber = textField(profile.mobileNumber);
  const branchName = textField(profile.branchName);
  const profileRoles = Array.isArray(profile.roles)
    ? profile.roles.filter((role): role is string => typeof role === 'string' && !!role.trim())
    : [];
  const primaryRole = textField(profile.roleName, profile.role, profileRoles[0]);
  if (!id && !userName && !employeeName && !employeeCode && !emailAddress && !mobileNumber && !branchName && !primaryRole) {
    return undefined;
  }

  const roleName = primaryRole || initialUser?.roleName || initialUser?.role;
  const roles = primaryRole ? [primaryRole, ...profileRoles] : initialUser?.roles ?? [];
  if (!roles.some(isStaffRole) && !hasStudentRole(roles)) return undefined;

  return {
    id: id ?? initialUser?.id,
    userName: userName ?? initialUser?.userName,
    employeeName: employeeName ?? initialUser?.employeeName,
    employeeCode: employeeCode ?? initialUser?.employeeCode,
    emailAddress: emailAddress ?? initialUser?.emailAddress,
    mobileNumber: mobileNumber ?? initialUser?.mobileNumber,
    branchName: branchName ?? initialUser?.branchName,
    roleName,
    roles,
  };
}

/** Uses the signed-in user's profile before falling back to the older directory API. */
export async function resolveCurrentUser(loginName: string, initialUser?: User | null): Promise<User | undefined> {
  const cached = !initialUser && findCurrentUser(getCachedUsers() ?? [], loginName);
  if (cached) return cached;

  const { generation } = userSession.getSnapshot();
  try {
    const { data } = await http.get<unknown>(`${API_ENDPOINTS.userProfile}/get-profile`);
    const profile = readProfile(data, initialUser);
    if (profile) return profile;
  } catch (error) {
    if (userSession.getSnapshot().generation !== generation || isCancel(error)) throw error;
  }

  return findCurrentUser(await getAllUsers(), loginName);
}
