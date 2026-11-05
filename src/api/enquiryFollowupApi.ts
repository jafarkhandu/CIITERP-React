import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractRows } from '@/api/studentApi';

const baseUrl = `${API_ENDPOINTS.lead}/EnquiryFollowup`;

export interface EnquiryFollowupRecord {
  followupId?: number;
  enquiryId: number;
  candidateName?: string;
  sourceId?: number;
  sourceName?: string;
  followUpDate: string;
  followUpBy: string;
  description: string;
  status: string;
  nextFollowupDate: string;
}

function requirePositiveId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) throw new Error('followupId must be a positive integer.');
}

export const enquiryFollowupApi = {
  getAll: async () => extractRows((await http.get(baseUrl)).data),
  getByEnquiryId: async (enquiryId: number) => {
    requirePositiveId(enquiryId);
    return extractRows((await http.get(`${baseUrl}/enquiry/${enquiryId}`)).data);
  },
  getById: async (id: number) => {
    requirePositiveId(id);
    return (await http.get(`${baseUrl}/${id}`)).data;
  },
  create: async (payload: EnquiryFollowupRecord) => (await http.post(`${baseUrl}/Create`, payload)).data,
  update: async (id: number, payload: EnquiryFollowupRecord) => {
    requirePositiveId(id);
    return (await http.put(`${baseUrl}/Update/${id}`, payload)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id);
    return (await http.delete(`${baseUrl}/Delete/${id}`)).data;
  },
  restore: async (id: number) => {
    requirePositiveId(id);
    return (await http.put(`${baseUrl}/restore/${id}`, {})).data;
  },
};
