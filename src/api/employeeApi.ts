import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

export interface RegisterEmployeeRequest {
  employeeName: string;
  emailAddress: string;
  mobileNumber: string;
  branchId: number;
}

export const employeeApi = {
  register: (request: RegisterEmployeeRequest) =>
    http.post(`${API_ENDPOINTS.auth}/register-employee`, request).then((response) => response.data),
};
