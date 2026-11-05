import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

const base = `${API_ENDPOINTS.account}/email`;

export interface EmailTemplate {
  id?: number;
  key: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
}
export interface EmailLog {
  id: number;
  recipient: string;
  subject: string;
  status: 'Sent' | 'Failed' | 'Pending' | string;
  createdAt: string;
  error?: string;
}
export interface EmailQueueItem {
  id: number;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  queuedAt: string;
}
export interface SmtpSettings {
  provider: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName: string;
  useTls: boolean;
  password?: string;
}

export const emailApi = {
  getSmtpSettings: async () => (await http.get(`${base}/settings`)).data as SmtpSettings,
  saveSmtpSettings: async (settings: SmtpSettings) => (await http.put(`${base}/settings`, settings)).data,
  testSmtp: async (recipient: string) => (await http.post(`${base}/settings/test`, { recipient })).data,
  getTemplates: async () => (await http.get(`${base}/templates`)).data as EmailTemplate[],
  saveTemplate: async (template: EmailTemplate) => (await http.put(`${base}/templates/${encodeURIComponent(template.key)}`, template)).data,
  getLogs: async () => (await http.get(`${base}/logs`)).data as EmailLog[],
  getQueue: async () => (await http.get(`${base}/queue`)).data as EmailQueueItem[],
  retryQueuedEmail: async (id: number) => (await http.post(`${base}/queue/${id}/retry`)).data,
};
