import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractRows } from '@/api/studentApi';

export interface EnquiryRecord {
  enquiryId: number;
  enquiryDate: string;
  candidateName: string;
  gender: string;
  localAddress: string;
  emailAddress: string;
  mobileNumber: string;
  birthDate: string;
  qualificationId: number;
  qualification: string;
  leadSources: string;
  enquiryFors: string;
  interestedTopics: string;
  status: string;
  branchId: number;
  branchName?: string;
  deletedAt?: string | null;
}

const baseUrl = `${API_ENDPOINTS.lead}/Enquiry`;
const followupUrl = `${API_ENDPOINTS.lead}/EnquiryFollowup`;

export const enquiryApi = {
  async getAll(): Promise<EnquiryRecord[]> {
    return extractRows((await http.get(`${baseUrl}/GetAll`)).data) as unknown as EnquiryRecord[];
  },
  async getById(id: number): Promise<EnquiryRecord> {
    const response = await http.get(`${baseUrl}/GetById/${id}`);
    return response.data?.data ?? response.data?.result ?? response.data;
  },
  async create(enquiry: Omit<EnquiryRecord, 'enquiryId'>): Promise<unknown> {
    return (await http.post(`${baseUrl}/Create`, enquiry)).data;
  },
  async update(id: number, enquiry: EnquiryRecord): Promise<unknown> {
    return (await http.put(`${baseUrl}/Update`, enquiry)).data;
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${baseUrl}/Delete/${id}`);
  },
  async restore(id: number): Promise<void> {
    await http.put(`${baseUrl}/Restore/${id}`, {});
  },
  async getFollowups(id: number): Promise<Record<string, unknown>[]> {
    return extractRows((await http.get(`${followupUrl}/enquiry/${id}`)).data);
  },
  async getFollowupsAll(): Promise<Record<string, unknown>[]> {
    return extractRows((await http.get(followupUrl)).data);
  },
  async getFollowupById(id: number): Promise<Record<string, unknown>> {
    const data = (await http.get(`${followupUrl}/${id}`)).data;
    return data?.data ?? data?.result ?? data;
  },
  async createFollowup(followup: unknown): Promise<unknown> {
    return (await http.post(`${followupUrl}/Create`, followup)).data;
  },
  async updateFollowup(id: number, followup: unknown): Promise<unknown> {
    return (await http.put(`${followupUrl}/Update/${id}`, followup)).data;
  },
  async removeFollowup(id: number): Promise<void> {
    await http.delete(`${followupUrl}/Delete/${id}`);
  },
  async restoreFollowup(id: number): Promise<void> {
    await http.put(`${followupUrl}/restore/${id}`, {});
  },
  async getQualifications(): Promise<Record<string, unknown>[]> {
    return extractRows((await http.get(`${API_ENDPOINTS.lead}/Qualification`)).data);
  },
};
