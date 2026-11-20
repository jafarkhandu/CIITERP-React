/** Routing hints read from the JWT returned by the existing login API.
 * Decoding does not validate a signature: backend authorization remains mandatory.
 */
export interface TokenIdentity {
  roles: string[];
  username: string;
  displayName: string;
  email: string;
  studentId: number | null;
}

const ROLE_CLAIMS = [
  'role',
  'roles',
  'Role',
  'Roles',
  'roleName',
  'RoleName',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
];

const STAFF_ROLES = new Set([
  'admin', 'superuser', 'accountant', 'trainer',
  'developer', 'counsellor', 'groupleader',
]);

function textClaim(claims: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function readTokenIdentity(token: string): TokenIdentity {
  const empty: TokenIdentity = { roles: [], username: '', displayName: '', email: '', studentId: null };

  try {
    const payload = token.split('.')[1];
    if (!payload) return empty;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return empty;

    const roles = ROLE_CLAIMS.flatMap((key) => {
      const value = claims[key];
      return Array.isArray(value) ? value : [value];
    }).filter((role): role is string => typeof role === 'string' && !!role.trim())
      .map((role) => role.trim());

    // Do not interpret the generic user/account id or JWT subject as a student id.
    const rawStudentId = claims.studentId ?? claims.StudentId ?? claims.student_id;
    const studentId = rawStudentId == null || rawStudentId === '' ? null : Number(rawStudentId);

    return {
      roles: [...new Set(roles)],
      username: textClaim(claims, 'unique_name', 'userName', 'username', 'preferred_username',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'),
      displayName: textClaim(claims, 'studentName', 'displayName', 'name', 'given_name'),
      email: textClaim(claims, 'email', 'emailAddress',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'),
      studentId: studentId !== null && Number.isSafeInteger(studentId) && studentId > 0 ? studentId : null,
    };
  } catch {
    return empty;
  }
}

export function hasStudentRole(roles: string[]): boolean {
  return roles.some((role) => role.trim().toLowerCase() === 'student');
}

export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role.trim().toLowerCase().replace(/[\s_-]+/g, ''));
}

/** A mixed staff/student role assignment must preserve the existing staff login flow. */
export function isStudentOnlyAccount(roles: string[]): boolean {
  return hasStudentRole(roles) && !roles.some(isStaffRole);
}
