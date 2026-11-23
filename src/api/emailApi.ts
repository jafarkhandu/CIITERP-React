import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

export interface EmailAttachment {
  fileName: string;
  contentType: string;
  fileContentBase64: string;
}

export interface SendEmailRequest {
  toEmail: string;
  subject: string;
  body: string;
  isHtml: boolean;
  templateId?: string;
  templateData?: Record<string, string>;
  attachments?: EmailAttachment[];
}

export const emailApi = {
  async send(request: SendEmailRequest): Promise<unknown> {
    const { data } = await http.post(`${API_ENDPOINTS.emailManagement}/Email/send`, request);
    return data;
  },
};
