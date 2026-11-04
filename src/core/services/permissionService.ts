// Port of PermissionService. Same permission names, same "function management"
// enable/disable behaviour (stored in localStorage). React components subscribe
// via usePermissionVersion() so the UI re-renders when something changes.

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  USER_VIEW: 'USER_VIEW', USER_CREATE: 'USER_CREATE', USER_UPDATE: 'USER_UPDATE',
  EMPLOYEE_VIEW: 'EMPLOYEE_VIEW', EMPLOYEE_CREATE: 'EMPLOYEE_CREATE', EMPLOYEE_UPDATE: 'EMPLOYEE_UPDATE',
  EMPLOYEE_ACTIVATE: 'EMPLOYEE_ACTIVATE', EMPLOYEE_DEACTIVATE: 'EMPLOYEE_DEACTIVATE',
  BRANCH_VIEW: 'BRANCH_VIEW', BRANCH_CREATE: 'BRANCH_CREATE', BRANCH_UPDATE: 'BRANCH_UPDATE',
  BRANCH_DELETE: 'BRANCH_DELETE', BRANCH_RESTORE: 'BRANCH_RESTORE',
  ROLE_VIEW: 'ROLE_VIEW', ROLE_CREATE: 'ROLE_CREATE', ROLE_UPDATE: 'ROLE_UPDATE', ROLE_DELETE: 'ROLE_DELETE',
  MENU_VIEW: 'MENU_VIEW', MENU_CREATE: 'MENU_CREATE', MENU_UPDATE: 'MENU_UPDATE', MENU_DELETE: 'MENU_DELETE',
  COURSE_VIEW: 'COURSE_VIEW', COURSE_CREATE: 'COURSE_CREATE', COURSE_UPDATE: 'COURSE_UPDATE',
  COURSE_DELETE: 'COURSE_DELETE', COURSE_RESTORE: 'COURSE_RESTORE',
  LEAD_VIEW: 'LEAD_VIEW', LEAD_CREATE: 'LEAD_CREATE', LEAD_FOLLOWUP: 'LEAD_FOLLOWUP', LEAD_UPDATE: 'LEAD_UPDATE',
  LEAD_DELETE: 'LEAD_DELETE', LEAD_RESTORE: 'LEAD_RESTORE', LEAD_EXPORT: 'LEAD_EXPORT',
  ENQUIRY_VIEW: 'ENQUIRY_VIEW', ENQUIRY_CREATE: 'ENQUIRY_CREATE', ENQUIRY_FOLLOWUP: 'ENQUIRY_FOLLOWUP',
  ENQUIRY_UPDATE: 'ENQUIRY_UPDATE', ENQUIRY_DELETE: 'ENQUIRY_DELETE', ENQUIRY_EXPORT: 'ENQUIRY_EXPORT',
  LEAD_SOURCE_VIEW: 'LEAD_SOURCE_VIEW', LEAD_SOURCE_CREATE: 'LEAD_SOURCE_CREATE',
  LEAD_SOURCE_UPDATE: 'LEAD_SOURCE_UPDATE', LEAD_SOURCE_DELETE: 'LEAD_SOURCE_DELETE',
  QUALIFICATION_VIEW: 'QUALIFICATION_VIEW', QUALIFICATION_CREATE: 'QUALIFICATION_CREATE',
  QUALIFICATION_UPDATE: 'QUALIFICATION_UPDATE', QUALIFICATION_DELETE: 'QUALIFICATION_DELETE',
  FUNCTION_MANAGEMENT_VIEW: 'FUNCTION_MANAGEMENT_VIEW',
  REPORTS_VIEW: 'REPORTS_VIEW',
  GROUP_LEADER_BATCH_VIEW: 'GROUP_LEADER_BATCH_VIEW',
  TRAINER_BATCH_VIEW: 'TRAINER_BATCH_VIEW',
  TRAINER_ATTENDANCE_VIEW: 'TRAINER_ATTENDANCE_VIEW',
  TRAINER_ATTENDANCE_SUBMIT: 'TRAINER_ATTENDANCE_SUBMIT',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const DISABLED_KEY = 'erp-disabled-functions';
const ADMIN_DISABLED_KEY = 'erp-admin-disabled-functions';

function readSet(key: string): Set<Permission> {
  try {
    return new Set<Permission>(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set<Permission>();
  }
}

class PermissionService {
  private permissions = new Set<Permission>();
  private disabled = readSet(DISABLED_KEY);
  private adminDisabled = readSet(ADMIN_DISABLED_KEY);
  private listeners = new Set<() => void>();
  private version = 0;

  // ---- subscription (for useSyncExternalStore) ----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  // ---- same API as the Angular service ----
  setPermissions(permissions: Permission[]) { this.permissions = new Set(permissions); this.emit(); }
  clearPermissions() { this.permissions.clear(); this.emit(); }

  hasPermission(p: Permission) { return this.permissions.has(p) && !this.disabled.has(p); }
  hasAnyPermission(ps: Permission[]) { return ps.some((p) => this.hasPermission(p)); }
  hasAllPermissions(ps: Permission[]) { return ps.every((p) => this.hasPermission(p)); }
  getPermissions(): Permission[] { return Array.from(this.permissions).filter((p) => !this.disabled.has(p)); }

  isFunctionEnabled(p: Permission) {
    if (p === PERMISSIONS.LEAD_FOLLOWUP) return !this.adminDisabled.has(p);
    return p === PERMISSIONS.FUNCTION_MANAGEMENT_VIEW || p === PERMISSIONS.DASHBOARD_VIEW || !this.disabled.has(p);
  }

  setFunctionEnabled(p: Permission, enabled: boolean) {
    if (p === PERMISSIONS.LEAD_FOLLOWUP) {
      if (enabled) this.adminDisabled.delete(p); else this.adminDisabled.add(p);
      this.persistAdminDisabled();
      this.emit();
      return;
    }
    if (p === PERMISSIONS.FUNCTION_MANAGEMENT_VIEW || p === PERMISSIONS.DASHBOARD_VIEW) return;
    if (enabled) this.disabled.delete(p); else this.disabled.add(p);
    this.persistDisabled();
    this.emit();
  }

  enableAll() {
    this.disabled.clear(); this.adminDisabled.clear();
    this.persistDisabled(); this.persistAdminDisabled(); this.emit();
  }

  disableAll() {
    for (const p of Object.values(PERMISSIONS) as Permission[]) {
      if (p !== PERMISSIONS.FUNCTION_MANAGEMENT_VIEW && p !== PERMISSIONS.DASHBOARD_VIEW && p !== PERMISSIONS.LEAD_FOLLOWUP) {
        this.disabled.add(p);
      }
    }
    this.adminDisabled.add(PERMISSIONS.LEAD_FOLLOWUP);
    this.persistDisabled(); this.persistAdminDisabled(); this.emit();
  }

  resetDefaults() { this.enableAll(); }

  isAdminFunctionEnabled(p: Permission) { return !this.adminDisabled.has(p); }

  private persistDisabled() { localStorage.setItem(DISABLED_KEY, JSON.stringify(Array.from(this.disabled))); }
  private persistAdminDisabled() { localStorage.setItem(ADMIN_DISABLED_KEY, JSON.stringify(Array.from(this.adminDisabled))); }
}

export const permissionService = new PermissionService();
