import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractRows } from '@/api/studentApi';

export interface LeadRecord {
  leadId: number;
  candidateName: string;
  emailAddress: string;
  mobileNumber: string;
  trainingType: string;
  description: string;
  status: string;
  leadDate: string | Date;
  sourceId: number;
  sourceName?: string;
  deletedAt?: string | null;
}
export interface LeadSourceRecord {
  sourceId: number;
  sourceName: string;
  flag?: number;
  deletedAt?: string | null;
}
export interface LeadFollowupRecord {
  leadFollowupId?: number;
  leadId: number;
  candidateName: string;
  followUpDate: string | Date;
  followUpBy: string;
  description: string;
  status: string;
  nextFollowupDate: string | Date;
  deletedAt?: string | null;
}

function unwrap<T>(value: any): T {
  let data = value;
  for (let depth = 0; depth < 4 && data && typeof data === 'object' && !Array.isArray(data); depth += 1) {
    if (data.data !== undefined) data = data.data;
    else if (data.result !== undefined) data = data.result;
    else break;
  }
  return data as T;
}
function requirePositiveId(id: number, name: string): void {
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${name} must be a positive integer.`);
}

const leadBase = `${API_ENDPOINTS.lead}/Lead`;
const followupBase = `${API_ENDPOINTS.lead}/LeadFollowup`;

export const leadApi = {
  async getAll(): Promise<LeadRecord[]> {
    return extractRows((await http.get(leadBase)).data) as unknown as LeadRecord[];
  },
  async getById(id: number): Promise<LeadRecord> {
    requirePositiveId(id, 'leadId');
    return unwrap<LeadRecord>((await http.get(`${leadBase}/${id}`)).data);
  },
  async getBySource(sourceId: number): Promise<LeadRecord[]> {
    requirePositiveId(sourceId, 'sourceId');
    return extractRows((await http.get(`${leadBase}/source/${sourceId}`)).data) as unknown as LeadRecord[];
  },
  async create(lead: Omit<LeadRecord, 'leadId'>): Promise<LeadRecord> {
    return unwrap<LeadRecord>((await http.post(`${leadBase}/Create`, lead)).data);
  },
  async update(id: number, lead: LeadRecord): Promise<unknown> {
    requirePositiveId(id, 'leadId');
    return (await http.put(`${leadBase}/Update/${id}`, lead)).data;
  },
  async remove(id: number): Promise<void> {
    requirePositiveId(id, 'leadId');
    await http.delete(`${leadBase}/Delete/${id}`);
  },
  async restore(id: number): Promise<void> {
    requirePositiveId(id, 'leadId');
    await http.put(`${leadBase}/restore/${id}`, {});
  },
  async getSources(): Promise<LeadSourceRecord[]> {
    return extractRows((await http.get(`${API_ENDPOINTS.lead}/LeadSource`)).data) as unknown as LeadSourceRecord[];
  },
  async getFollowups(leadId: number): Promise<LeadFollowupRecord[]> {
    requirePositiveId(leadId, 'leadId');
    return extractRows((await http.get(`${followupBase}/lead/${leadId}`)).data) as unknown as LeadFollowupRecord[];
  },
  async getAllFollowups(): Promise<LeadFollowupRecord[]> {
    return extractRows((await http.get(followupBase)).data) as unknown as LeadFollowupRecord[];
  },
  async getFollowupById(id: number): Promise<LeadFollowupRecord> {
    requirePositiveId(id, 'leadFollowupId');
    return unwrap<LeadFollowupRecord>((await http.get(`${followupBase}/GetById/${id}`)).data);
  },
  async createFollowup(followup: LeadFollowupRecord): Promise<LeadFollowupRecord> {
    return unwrap<LeadFollowupRecord>((await http.post(`${followupBase}/Create`, followup)).data);
  },
  async updateFollowup(id: number, followup: LeadFollowupRecord): Promise<unknown> {
    requirePositiveId(id, 'leadFollowupId');
    return (await http.put(`${followupBase}/Update`, followup)).data;
  },
  async removeFollowup(id: number): Promise<void> {
    requirePositiveId(id, 'leadFollowupId');
    await http.delete(`${followupBase}/Delete/${id}`);
  },
  async restoreFollowup(id: number): Promise<void> {
    requirePositiveId(id, 'leadFollowupId');
    await http.put(`${followupBase}/restore/${id}`, {});
  },
};
