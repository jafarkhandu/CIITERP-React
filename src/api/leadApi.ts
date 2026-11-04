import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

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
}

function extractArray(value: any): any[] {
  let data = value;
  for (let depth = 0; depth < 5 && data && !Array.isArray(data); depth += 1) {
    data = data.data ?? data.result ?? data.items ?? data.records ?? data.value ?? data.$values;
  }
  return Array.isArray(data) ? data : [];
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

const leadBase = `${API_ENDPOINTS.lead}/Lead`;
const followupBase = `${API_ENDPOINTS.lead}/LeadFollowup`;

export const leadApi = {
  async getAll(): Promise<LeadRecord[]> {
    const response = await http.get(leadBase);
    return extractArray(response.data);
  },
  async getById(id: number): Promise<LeadRecord> {
    const response = await http.get(`${leadBase}/${id}`);
    return unwrap<LeadRecord>(response.data);
  },
  async create(lead: Omit<LeadRecord, 'leadId'>): Promise<LeadRecord> {
    const response = await http.post(`${leadBase}/Create`, lead);
    return unwrap<LeadRecord>(response.data);
  },
  async getSources(): Promise<LeadSourceRecord[]> {
    const response = await http.get(`${API_ENDPOINTS.lead}/LeadSource`);
    return extractArray(response.data);
  },
  async getFollowups(leadId: number): Promise<LeadFollowupRecord[]> {
    const response = await http.get(`${followupBase}/lead/${leadId}`);
    return extractArray(response.data);
  },
  async createFollowup(followup: LeadFollowupRecord): Promise<LeadFollowupRecord> {
    const response = await http.post(`${followupBase}/Create`, followup);
    return unwrap<LeadFollowupRecord>(response.data);
  },
};
