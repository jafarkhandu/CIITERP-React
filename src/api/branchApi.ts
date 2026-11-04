import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractArray } from '@/api/responseUtils';

export interface BranchOption {
  id: number;
  name: string;
}

export async function getAllBranches(): Promise<BranchOption[]> {
  const response = await http.get(`${API_ENDPOINTS.branch}/get-all`);
  return extractArray<Record<string, unknown>>(response.data)
    .map((branch) => ({
      id: Number(branch.branchId ?? branch.id ?? branch.branch_id ?? 0),
      name: String(branch.branchName ?? branch.name ?? branch.branch_name ?? '').trim(),
    }))
    .filter((branch) => Number.isFinite(branch.id) && branch.id > 0 && branch.name.length > 0)
    .filter((branch, index, all) => all.findIndex((item) => item.id === branch.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name));
}
