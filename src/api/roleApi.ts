import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractArray } from '@/api/responseUtils';

export interface RoleOption {
  roleId: string;
  roleName: string;
}

let rolesPromise: Promise<RoleOption[]> | null = null;

export function getAllRoles(forceRefresh = false): Promise<RoleOption[]> {
  if (forceRefresh) rolesPromise = null;
  if (!rolesPromise) {
    rolesPromise = http
      .get(`${API_ENDPOINTS.roles}/get-roles`)
      .then(({ data }) =>
        extractArray<Record<string, unknown>>(data)
          .map((role) => ({
            roleId: String(role.roleId ?? role.id ?? ''),
            roleName: String(role.roleName ?? role.name ?? ''),
          }))
          .filter((role) => role.roleId.length > 0 && role.roleName.length > 0),
      )
      .catch((error) => {
        rolesPromise = null;
        throw error;
      });
  }
  return rolesPromise;
}
