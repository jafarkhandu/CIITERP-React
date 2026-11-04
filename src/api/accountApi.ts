import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import type { ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest } from '@/types/user';

const baseUrl = API_ENDPOINTS.account;

export const accountApi = {
  changePassword: (request: ChangePasswordRequest) =>
    http.post(`${baseUrl}/change-password`, request).then((r) => r.data),

  forgotPassword: (request: ForgotPasswordRequest) =>
    http.post(`${baseUrl}/forgot-password`, request).then((r) => r.data),

  resetPassword: (request: ResetPasswordRequest) =>
    http.post(`${baseUrl}/reset-password`, request).then((r) => r.data),
};
