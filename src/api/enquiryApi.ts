import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

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

function extractArray(value: any): any[] {
  let data = value;
  for (let depth = 0; depth < 5 && data && !Array.isArray(data); depth += 1) {
    data = data.data ?? data.result ?? data.items ?? data.records ?? data.value ?? data.$values;
  }
  return Array.isArray(data) ? data : [];
}
const baseUrl = `${API_ENDPOINTS.lead}/Enquiry`;

export const enquiryApi = {
  async getAll(): Promise<EnquiryRecord[]> {
    const response = await http.get(`${baseUrl}/GetAll`);
    return extractArray(response.data);
  },
  async getById(id: number): Promise<EnquiryRecord> {
    const response = await http.get(`${baseUrl}/GetById/${id}`);
    return response.data?.data ?? response.data?.result ?? response.data;
  },
  async create(enquiry: Omit<EnquiryRecord, 'enquiryId'>): Promise<any> {
    const response = await http.post(`${baseUrl}/Create`, enquiry);
    return response.data;
  },
  async update(id: number, enquiry: EnquiryRecord): Promise<any> {
    const response = await http.put(`${baseUrl}/Update`, enquiry);
    return response.data;
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${baseUrl}/Delete/${id}`);
  },
  async restore(id: number): Promise<void> {
    await http.put(`${baseUrl}/Restore/${id}`, {});
  },
  async getFollowups(id: number): Promise<any[]> {
    const response = await http.get(`${API_ENDPOINTS.lead}/EnquiryFollowup/enquiry/${id}`);
    return extractArray(response.data);
  },
  async createFollowup(followup: any): Promise<any> {
    const response = await http.post(`${API_ENDPOINTS.lead}/EnquiryFollowup/Create`, followup);
    return response.data;
  },
  async getQualifications(): Promise<any[]> {
    const response = await http.get(`${API_ENDPOINTS.lead}/Qualification`);
    return extractArray(response.data);
  },
};
