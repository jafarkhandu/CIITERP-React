// Port of UserSessionService: current user, roles and the role -> permission map.
import type { User } from '@/types/user';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';

const SESSION_KEY = 'erp-current-user';

export interface SessionState {
  currentUser: User | null;
  employeeName: string;
  employeeCode: string;
  username: string;
  email: string;
  mobile: string;
  branch: string;
  roleName: string;
  roles: string[];
}

const EMPTY: SessionState = {
  currentUser: null, employeeName: '', employeeCode: '', username: '', email: '',
  mobile: '', branch: '', roleName: '', roles: [],
};

const normalize = (v: string) => v.trim().toLowerCase().replace(/[\s_-]+/g, '');

function buildState(user: User): SessionState {
  const roleName = user.roleName || user.role || '';
  const userRoles = Array.isArray(user.roles) ? user.roles : [];
  const primary = roleName ? [roleName] : [];
  const roles = [...new Set(
    [...userRoles, ...primary]
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter(Boolean),
  )];
  return {
    currentUser: user,
    employeeName: user.employeeName || '',
    employeeCode: user.employeeCode || '',
    username: user.userName || '',
    email: user.emailAddress || '',
    mobile: user.mobileNumber || '',
    branch: user.branchName || '',
    roleName,
    roles,
  };
}

function permissionsForRole(role: string): Permission[] {
  const r = normalize(role);
  const all = Object.values(PERMISSIONS) as Permission[];

  if (r === 'superuser') return all;
  if (r === 'admin') return all.filter((p) => p !== PERMISSIONS.FUNCTION_MANAGEMENT_VIEW);
  if (r === 'counsellor') {
    return [
      PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE, PERMISSIONS.LEAD_FOLLOWUP,
      PERMISSIONS.ENQUIRY_VIEW, PERMISSIONS.ENQUIRY_CREATE, PERMISSIONS.ENQUIRY_FOLLOWUP,
      PERMISSIONS.LEAD_SOURCE_VIEW, PERMISSIONS.QUALIFICATION_VIEW,
    ];
  }
  if (r === 'developer') {
    return [
      PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.COURSE_VIEW, PERMISSIONS.COURSE_CREATE,
      PERMISSIONS.COURSE_UPDATE, PERMISSIONS.COURSE_DELETE, PERMISSIONS.COURSE_RESTORE,
    ];
  }
  if (r === 'accountant') return [PERMISSIONS.DASHBOARD_VIEW];
  if (r === 'groupleader') return [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.GROUP_LEADER_BATCH_VIEW];
  if (r === 'trainer') {
    return [
      PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.TRAINER_BATCH_VIEW,
      PERMISSIONS.TRAINER_ATTENDANCE_VIEW, PERMISSIONS.TRAINER_ATTENDANCE_SUBMIT,
    ];
  }
  if (r === 'student') return [PERMISSIONS.DASHBOARD_VIEW];
  return [];
}

class UserSession {
  private state: SessionState = EMPTY;
  private listeners = new Set<() => void>();

  constructor() {
    this.restoreUser();
  }

  // ---- subscription (for useSyncExternalStore) ----
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
  getSnapshot = () => this.state;
  private emit() { this.listeners.forEach((l) => l()); }

  // ---- same API as UserSessionService ----
  get currentUser() { return this.state.currentUser; }
  get employeeName() { return this.state.employeeName; }
  get username() { return this.state.username; }
  get roles() { return this.state.roles; }

  setUser(user: User): void {
    this.state = buildState(user);
    this.applyRolePermissions();
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch (error) {
      console.warn('Could not persist user session:', error);
    }
    this.emit();
  }

  private restoreUser(): void {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const user = JSON.parse(raw) as User;
      if (user && typeof user === 'object') {
        this.state = buildState(user);
        this.applyRolePermissions();
      }
    } catch (error) {
      console.warn('Could not restore user session:', error);
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private applyRolePermissions(): void {
    const all: Permission[] = [];
    for (const role of this.state.roles) all.push(...permissionsForRole(role));
    permissionService.setPermissions([...new Set(all)]);
  }

  hasPermission(p: Permission) { return permissionService.hasPermission(p); }
  hasAnyPermission(p: Permission[]) { return permissionService.hasAnyPermission(p); }
  hasAllPermissions(p: Permission[]) { return permissionService.hasAllPermissions(p); }
  getPermissions() { return permissionService.getPermissions(); }

  hasRole(role: string): boolean {
    const expected = normalize(role);
    return this.state.roles.some((r) => normalize(r) === expected);
  }
  hasAnyRole(required: string[]): boolean { return required.some((x) => this.hasRole(x)); }
  isSuperUser() { return this.hasRole('Super User'); }
  isAdmin() { return this.hasRole('Admin'); }

  clear(): void {
    this.state = EMPTY;
    permissionService.clearPermissions();
    localStorage.removeItem(SESSION_KEY);
    this.emit();
  }
}

export const userSession = new UserSession();
