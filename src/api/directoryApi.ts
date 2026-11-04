import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

export interface BranchOption { id: number; name: string; }
export interface RoleOption { roleId: string; roleName: string; }

function extractArray(value: any): any[] {
  let current = value;
  for (let depth = 0; depth < 4 && current && !Array.isArray(current); depth += 1) {
    current = current.data ?? current.result ?? current.items ?? current.records ?? current.value ?? current.$values;
  }
  return Array.isArray(current) ? current : [];
}

export const directoryApi = {
  async getBranches(): Promise<BranchOption[]> {
    const response = await http.get(`${API_ENDPOINTS.branch}/get-all`);
    return extractArray(response.data)
      .map((branch: any) => ({
        id: Number(branch?.branchId ?? branch?.id ?? branch?.branch_id ?? 0),
        name: String(branch?.branchName ?? branch?.name ?? branch?.branch_name ?? '').trim(),
      }))
      .filter((branch: BranchOption) => branch.id > 0 && branch.name.length > 0)
      .filter((branch: BranchOption, index: number, all: BranchOption[]) =>
        all.findIndex((item) => item.id === branch.id) === index)
      .sort((a: BranchOption, b: BranchOption) => a.name.localeCompare(b.name));
  },

  async getRoles(): Promise<RoleOption[]> {
    const response = await http.get(`${API_ENDPOINTS.roles}/get-roles`);
    return extractArray(response.data)
      .map((role: any) => ({
        roleId: String(role?.roleId ?? role?.id ?? ''),
        roleName: String(role?.roleName ?? role?.name ?? '').trim(),
      }))
      .filter((role: RoleOption) => role.roleId.length > 0 && role.roleName.length > 0);
  },

  async getUserRoles(userId: string): Promise<any[]> {
    const response = await http.post(`${API_ENDPOINTS.userRole}/get-user-roles`, { userId });
    return extractArray(response.data);
  },

  assignRole: (userId: string, roleId: string) =>
    http.post(`${API_ENDPOINTS.userRole}/assign-role`, { userId, roleId }).then((response) => response.data),

  removeRole: (userId: string, roleId: string) =>
    http.delete(`${API_ENDPOINTS.userRole}/remove-assigned-role/${encodeURIComponent(userId)}/${encodeURIComponent(roleId)}`)
      .then((response) => response.data),
};
