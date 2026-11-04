import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

export interface StudentRow {
  studentId: number;
  studentName: string;
  lastName?: string;
  studentCode?: string;
  mobileNumber?: string;
  emailAddress?: string;
  qualification?: string;
  branchName?: string;
  [key: string]: unknown;
}

export interface PaymentRow {
  paymentId: number;
  paymentDate?: string;
  paymentAmount?: number;
  paymentMode?: string;
  paymentDescription?: string;
  registrationId?: number;
  registrationCode?: string;
  studentId?: number;
  studentName?: string;
  lastName?: string;
  mobileNumber?: string;
  courseName?: string;
  branchName?: string;
  [key: string]: unknown;
}

export function extractRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['data', 'result', 'items', 'records', 'list', 'batches', 'students', 'schedules', 'value', '$values']) {
    const nested = record[key];
    if (Array.isArray(nested)) return extractRows(nested);
    if (nested && typeof nested === 'object') {
      const rows = extractRows(nested);
      if (rows.length) return rows;
    }
  }
  return [];
}

export interface RegistrationRequest {
  branchId: number;
  registrationDate: string;
  studentName: string;
  lastName: string;
  gender: string;
  birthDate: string;
  emailAddress: string;
  mobileNumber: string;
  whatsappNumber: string;
  parentName: string;
  parentNumber: string;
  aadharCardNumber: string;
  aadharCardPhoto: string;
  localAddress: string;
  permanentAddress: string;
  qualification: string;
  university: string;
  passingYear: number;
  medium: string;
  percentage: number;
  discount: number;
  currentStatus: string;
  courseId: number;
  leadId?: number | null;
  paymentDate: string;
  paymentAmount: number;
  paymentMode: string;
  paymentDescription: string;
}

export interface PaymentRequest {
  paymentDate: string;
  paymentAmount: number;
  paymentMode: string;
  paymentDescription: string;
  registrationId: number;
}

const registrationBase = API_ENDPOINTS.studentRegistration;
const paymentBase = API_ENDPOINTS.studentPayment;

export const studentApi = {
  async getStudents(): Promise<StudentRow[]> {
    const { data } = await http.get(`${API_ENDPOINTS.studentDetails}/get-all`);
    return extractRows(data).map((row) => ({
      ...row,
      studentId: Number(row.studentId ?? row.student_id ?? 0),
      studentName: String(row.studentName ?? row.student_name ?? ''),
      lastName: String(row.lastName ?? row.last_name ?? ''),
      studentCode: String(row.studentCode ?? row.student_code ?? ''),
      mobileNumber: String(row.mobileNumber ?? row.mobile_number ?? ''),
      emailAddress: String(row.emailAddress ?? row.email_address ?? ''),
      qualification: String(row.qualification ?? ''),
      branchName: String(row.branchName ?? row.branch_name ?? ''),
    })).filter((row) => row.studentId > 0);
  },

  async registerStudent(payload: RegistrationRequest): Promise<unknown> {
    const { data } = await http.post(`${registrationBase}/register`, payload);
    return data;
  },

  async registerExistingStudentCourse(payload: {
    studentId: number;
    courseId: number;
    discount: number;
    paymentAmount: number;
    paymentDate: string;
    paymentMode: string;
    paymentDescription: string;
    leadId: number;
  }): Promise<unknown> {
    const { data } = await http.post(`${registrationBase}/register-existing-student-course`, payload);
    return data;
  },

  async getCourseFees(courseId: number, discount: number): Promise<Record<string, unknown>> {
    const { data } = await http.get(`${registrationBase}/course-fees/${courseId}`, { params: { discount } });
    return (data?.data ?? data?.result ?? data) as Record<string, unknown>;
  },

  async getRegistrations(): Promise<Record<string, unknown>[]> {
    const { data } = await http.get(`${API_ENDPOINTS.studentRegistration}/get-all`);
    return extractRows(data);
  },

  async getRegistrationDropdowns(): Promise<unknown> {
    const { data } = await http.get(`${API_ENDPOINTS.studentRegistration}/dropdown-data`);
    return data;
  },

  async createPayment(payload: PaymentRequest): Promise<unknown> {
    const { data } = await http.post(`${paymentBase}/create`, payload);
    return data;
  },

  async downloadInvoice(registrationId: number, paymentId: number): Promise<Blob> {
    const response = await http.get(
      `${paymentBase}/registration/${registrationId}/payment/${paymentId}/invoice/download`,
      { responseType: 'blob' },
    );
    return response.data as Blob;
  },

  async getPayments(): Promise<PaymentRow[]> {
    const { data } = await http.get(`${API_ENDPOINTS.studentPayment}/get-all`);
    return extractRows(data).map((row) => ({
      ...row,
      paymentId: Number(row.paymentId ?? row.payment_id ?? row.payment_Id ?? 0),
      paymentDate: String(row.paymentDate ?? row.payment_date ?? ''),
      registrationCode: String(row.registrationCode ?? row.registration_code ?? ''),
      paymentAmount: Number(row.paymentAmount ?? row.payment_amount ?? 0),
      studentId: Number(row.studentId ?? row.student_id ?? 0),
      registrationId: Number(row.registrationId ?? row.registration_id ?? 0),
      studentName: String(row.studentName ?? row.student_name ?? ''),
      lastName: String(row.lastName ?? row.last_name ?? ''),
      paymentMode: String(row.paymentMode ?? row.payment_mode ?? ''),
      paymentDescription: String(row.paymentDescription ?? row.payment_description ?? ''),
      courseName: String(row.courseName ?? row.course_name ?? ''),
      branchName: String(row.branchName ?? row.branch_name ?? ''),
    })).filter((row) => row.paymentId > 0 || row.registrationId > 0);
  },
};

export const trainerApi = {
  async getMyBatches(): Promise<Record<string, unknown>[]> {
    const { data } = await http.get(`${API_ENDPOINTS.trainer}/Trainer/my-batches`);
    return extractRows(data);
  },
  async getBatchDetails(batchId: number): Promise<Record<string, unknown>> {
    const { data } = await http.get(`${API_ENDPOINTS.trainer}/Trainer/batch-details/${batchId}`);
    return data && typeof data === 'object' ? data as Record<string, unknown> : {};
  },
  async getBatchStudents(batchId: number): Promise<Record<string, unknown>[]> {
    const { data } = await http.get(`${API_ENDPOINTS.trainer}/Trainer/batch-students/${batchId}`);
    return extractRows(data);
  },
  async getBatchSchedules(batchId: number): Promise<Record<string, unknown>[]> {
    const { data } = await http.get(`${API_ENDPOINTS.trainer}/Trainer/batch-schedules/${batchId}`);
    return extractRows(data);
  },
  async getAttendanceStudents(scheduleId: number): Promise<Record<string, unknown>[]> {
    const { data } = await http.get(`${API_ENDPOINTS.trainer}/Attendance/schedule/${scheduleId}/students`);
    return extractRows(data);
  },
  async submitAttendance(payload: { batchScheduleId: number; attendanceDate: string; students: { registrationId: number; isPresent: boolean }[] }) {
    const { data } = await http.post(`${API_ENDPOINTS.trainer}/Attendance/submit`, payload);
    return data;
  },
};
