import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { extractRows } from '@/api/studentApi';

export interface CreateBatchRequest {
  batch_name: string;
  topic_id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  batch_time: string;
  branch_id: number;
  playlist_title: string;
  playlist_key: string;
}

export interface AddBatchStudentRequest {
  batch_id: number;
  registration_id: number;
}

export interface BatchScheduleAttendanceRequest {
  batch_schedule_id: number;
  attendance_date: string;
}

const baseUrl = API_ENDPOINTS.batchManagement;
const batchUrl = `${baseUrl}/Batch`;
const studentUrl = `${baseUrl}/BatchStudent`;
const scheduleUrl = `${baseUrl}/BatchSchedule`;
const scheduleAttendanceUrl = `${baseUrl}/BatchScheduleAttendance`;
const attendanceUrl = `${baseUrl}/ScheduleAttendance`;

function requirePositiveId(id: number, name: string): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

export const batchApi = {
  getAll: async () => extractRows((await http.get(`${batchUrl}/get-all`)).data),
  getById: async (id: number) => {
    requirePositiveId(id, 'batchId');
    return (await http.get(`${batchUrl}/get-by-id/${id}`)).data;
  },
  create: async (body: CreateBatchRequest) => (await http.post(`${batchUrl}/create`, body)).data,
  update: async (id: number, body: Partial<CreateBatchRequest>) => {
    requirePositiveId(id, 'batchId');
    return (await http.put(`${batchUrl}/update/${id}`, body)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id, 'batchId');
    return (await http.delete(`${batchUrl}/delete/${id}`)).data;
  },
  restore: async (id: number) => {
    requirePositiveId(id, 'batchId');
    return (await http.put(`${batchUrl}/restore/${id}`, {})).data;
  },
};

export const batchStudentApi = {
  create: async (body: AddBatchStudentRequest) => (await http.post(`${studentUrl}/create`, body)).data,
  getAll: async () => extractRows((await http.get(`${studentUrl}/get-all`)).data),
  getById: async (id: number) => {
    requirePositiveId(id, 'batchStudentId');
    return (await http.get(`${studentUrl}/${id}`)).data;
  },
  update: async (id: number, body: Partial<AddBatchStudentRequest>) => {
    requirePositiveId(id, 'batchStudentId');
    return (await http.put(`${studentUrl}/${id}`, body)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id, 'batchStudentId');
    return (await http.delete(`${studentUrl}/${id}`)).data;
  },
  getByBatch: async (batchId: number) => {
    requirePositiveId(batchId, 'batchId');
    return extractRows((await http.get(`${studentUrl}/batch/${batchId}`)).data);
  },
  restore: async (id: number) => {
    requirePositiveId(id, 'batchStudentId');
    return (await http.put(`${studentUrl}/${id}/restore`, {})).data;
  },
  getRegistrations: async (batchId: number) => {
    requirePositiveId(batchId, 'batchId');
    return extractRows((await http.get(`${studentUrl}/registrations`, { params: { batchId } })).data);
  },
};

export const batchScheduleApi = {
  generate: async (batchId: number) => {
    requirePositiveId(batchId, 'batchId');
    return (await http.post(`${scheduleUrl}/generate/${batchId}`, {})).data;
  },
  getAll: async () => extractRows((await http.get(`${scheduleUrl}/get-all`)).data),
  getById: async (id: number) => {
    requirePositiveId(id, 'batchScheduleId');
    return (await http.get(`${scheduleUrl}/${id}`)).data;
  },
  update: async (id: number, body: unknown) => {
    requirePositiveId(id, 'batchScheduleId');
    return (await http.put(`${scheduleUrl}/${id}`, body)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id, 'batchScheduleId');
    return (await http.delete(`${scheduleUrl}/${id}`)).data;
  },
  getByBatch: async (batchId: number) => {
    requirePositiveId(batchId, 'batchId');
    return extractRows((await http.get(`${scheduleUrl}/batch/${batchId}`)).data);
  },
  restore: async (id: number) => {
    requirePositiveId(id, 'batchScheduleId');
    return (await http.put(`${scheduleUrl}/${id}/restore`, {})).data;
  },
  getContents: async () => (await http.get(`${scheduleUrl}/contents`)).data,
};

export const batchScheduleAttendanceApi = {
  create: async (body: BatchScheduleAttendanceRequest) =>
    (await http.post(`${scheduleAttendanceUrl}/create`, body)).data,
  getAll: async () => extractRows((await http.get(`${scheduleAttendanceUrl}/get-all`)).data),
  getById: async (id: number) => {
    requirePositiveId(id, 'batchScheduleAttendanceId');
    return (await http.get(`${scheduleAttendanceUrl}/${id}`)).data;
  },
  update: async (id: number, body: unknown) => {
    requirePositiveId(id, 'batchScheduleAttendanceId');
    return (await http.put(`${scheduleAttendanceUrl}/${id}`, body)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id, 'batchScheduleAttendanceId');
    return (await http.delete(`${scheduleAttendanceUrl}/${id}`)).data;
  },
  restore: async (id: number) => {
    requirePositiveId(id, 'batchScheduleAttendanceId');
    return (await http.put(`${scheduleAttendanceUrl}/${id}/restore`, {})).data;
  },
  getBatchSchedules: async () => extractRows((await http.get(`${scheduleAttendanceUrl}/batch-schedules`)).data),
};

export const scheduleAttendanceApi = {
  create: async (body: unknown) => (await http.post(`${attendanceUrl}/create`, body)).data,
  getAll: async () => extractRows((await http.get(`${attendanceUrl}/get-all`)).data),
  getById: async (id: number) => {
    requirePositiveId(id, 'scheduleAttendanceId');
    return (await http.get(`${attendanceUrl}/get-by-id/${id}`)).data;
  },
  update: async (id: number, body: unknown) => {
    requirePositiveId(id, 'scheduleAttendanceId');
    return (await http.put(`${attendanceUrl}/update/${id}`, body)).data;
  },
  remove: async (id: number) => {
    requirePositiveId(id, 'scheduleAttendanceId');
    return (await http.delete(`${attendanceUrl}/delete/${id}`)).data;
  },
  restore: async (id: number) => {
    requirePositiveId(id, 'scheduleAttendanceId');
    return (await http.put(`${attendanceUrl}/restore/${id}`, {})).data;
  },
};

export const batchDirectoryApi = {
  getTopics: async () => extractRows((await http.get(`${batchUrl}/topics`)).data),
  getEmployees: async () => extractRows((await http.get(`${baseUrl}/Employee/get-all-for-dropdown`)).data),
};
