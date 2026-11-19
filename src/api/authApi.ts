import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import type { LoginRequest, LoginResponse } from '@/types/user';

const baseUrl = API_ENDPOINTS.auth;

interface StudentLoginResponse {
  statusCode?: number;
  message?: string;
  data?: {
    token?: string;
    studentId?: number;
  };
}

export const authApi = {
  login: (request: LoginRequest) =>
    http.post<LoginResponse>(`${baseUrl}/login`, request).then((r) => r.data),

  studentLogin: (request: { studentCode: string; password: string }) =>
    http.post<StudentLoginResponse>(`${API_ENDPOINTS.studentLogin}/login`, request).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    http.post<LoginResponse>(`${baseUrl}/refresh`, { refreshToken }).then((r) => r.data),
};
