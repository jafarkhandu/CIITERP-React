import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

export interface TrainingCourseRecord {
  courseId: number;
  courseName: string;
  feesAmount: number | null;
  feesChangeDate: string | null;
  installmentPercentage: number | null;
  deletedAt?: string | null;
}

function extractArray(value: any): any[] {
  let data = value;
  for (let depth = 0; depth < 5 && data && !Array.isArray(data); depth += 1) {
    data = data.data ?? data.result ?? data.items ?? data.records ?? data.list ?? data.value ?? data.$values;
  }
  return Array.isArray(data) ? data : [];
}
const baseUrl = `${API_ENDPOINTS.lead}/TrainingCourse`;
const CACHE_KEY = 'training-courses-cache';

export const courseApi = {
  async getAll(): Promise<TrainingCourseRecord[]> {
    const response = await http.get(baseUrl);
    const courses = extractArray(response.data).map((course: any) => ({
      ...course,
      courseId: Number(course?.courseId ?? course?.course_Id ?? course?.id ?? 0),
      courseName: String(course?.courseName ?? course?.course_Name ?? course?.name ?? ''),
      feesAmount: course?.feesAmount == null && course?.fees_Amount == null && course?.fees == null
        ? null : Number(course?.feesAmount ?? course?.fees_Amount ?? course?.fees),
      feesChangeDate: course?.feesChangeDate ?? course?.fees_Change_Date ?? null,
      installmentPercentage: course?.installmentPercentage == null
        ? null : Number(course.installmentPercentage),
    })).filter((course: TrainingCourseRecord) => course.courseId > 0);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(courses)); } catch (error) {
      console.warn('Could not cache training courses:', error);
    }
    return courses;
  },
  getCached(): TrainingCourseRecord[] {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  },
  async getById(id: number): Promise<TrainingCourseRecord> {
    const response = await http.get(`${baseUrl}/${id}`);
    return response.data?.data ?? response.data?.result ?? response.data;
  },
  async create(course: Omit<TrainingCourseRecord, 'courseId'>): Promise<any> {
    const response = await http.post(`${baseUrl}/Create`, course);
    localStorage.removeItem(CACHE_KEY);
    return response.data;
  },
  async update(id: number, course: TrainingCourseRecord): Promise<any> {
    const response = await http.put(`${baseUrl}/Update/${id}`, course);
    localStorage.removeItem(CACHE_KEY);
    return response.data;
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${baseUrl}/Delete/${id}`);
    localStorage.removeItem(CACHE_KEY);
  },
  async restore(id: number): Promise<void> {
    await http.put(`${baseUrl}/restore/${id}`, {});
    localStorage.removeItem(CACHE_KEY);
  },
};
