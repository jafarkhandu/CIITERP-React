import { apiErrorMessage } from '@/core/http/errors';
import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';

interface ApiRecord {
  [key: string]: unknown;
}

export interface TrainingTopic {
  topicId: number;
  topicName: string;
  publicFolderId: string | null;
  isDeleted: boolean;
}

export interface TrainingTopicContent {
  contentId: number;
  topicId: number;
  topicName: string;
  contentName: string;
  slides: string;
  videoName: string;
  isDeleted: boolean;
}

export interface TrainingCourseOption {
  courseId: number;
  courseName: string;
}

export interface TrainingCourseTopic {
  courseTopicId: number;
  courseId: number;
  courseName: string;
  topicId: number;
  topicName: string;
  isDeleted: boolean;
}

export interface TopicInput {
  topicName: string;
  publicFolderId: string;
}

export interface ContentInput {
  contentName: string;
  slides: string;
  videoName: string;
}

export interface CourseTopicInput {
  courseId: number;
  topicIds: number[];
}

const root = API_ENDPOINTS.developerTraining;

function record(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ApiRecord
    : null;
}

function field(item: ApiRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== null && item[key] !== undefined) return item[key];
  }
  return null;
}

function rows(value: unknown): ApiRecord[] {
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    if (Array.isArray(current)) return current.map(record).filter((item): item is ApiRecord => item !== null);
    const item = record(current);
    if (!item) break;
    current = field(item, 'data', 'result', 'items', 'records', 'list', 'value', '$values');
  }
  return [];
}

function deleted(item: ApiRecord): boolean {
  const flag = field(item, 'isDeleted', 'is_Deleted', 'deleted', 'IsDeleted');
  const date = field(item, 'deletedAt', 'deleted_At');
  return flag === true || flag === 1 || flag === 'true' || date !== null;
}

function topic(item: ApiRecord): TrainingTopic {
  return {
    topicId: Number(field(item, 'topicId', 'topic_Id', 'TopicId') ?? 0),
    topicName: String(field(item, 'topicName', 'topic_Name', 'TopicName') ?? ''),
    publicFolderId: field(item, 'publicFolderId', 'public_Folder_Id') == null
      ? null : String(field(item, 'publicFolderId', 'public_Folder_Id')),
    isDeleted: deleted(item),
  };
}

function content(item: ApiRecord): TrainingTopicContent {
  return {
    contentId: Number(field(item, 'contentId', 'content_Id') ?? 0),
    topicId: Number(field(item, 'topicId', 'topic_Id') ?? 0),
    topicName: String(field(item, 'topicName', 'topic_Name') ?? ''),
    contentName: String(field(item, 'contentName', 'content_Name') ?? ''),
    slides: String(field(item, 'slides', 'Slides') ?? ''),
    videoName: String(field(item, 'videoName', 'video_Name') ?? ''),
    isDeleted: deleted(item),
  };
}

function mapping(item: ApiRecord): TrainingCourseTopic {
  return {
    courseTopicId: Number(field(item, 'courseTopicId', 'courseTopic_Id') ?? 0),
    courseId: Number(field(item, 'courseId', 'course_Id') ?? 0),
    courseName: String(field(item, 'courseName', 'course_Name') ?? ''),
    topicId: Number(field(item, 'topicId', 'topic_Id') ?? 0),
    topicName: String(field(item, 'topicName', 'topic_Name') ?? ''),
    isDeleted: deleted(item),
  };
}

export function trainingError(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

export const trainingTopicApi = {
  async getAll(): Promise<TrainingTopic[]> {
    const { data } = await http.get(`${root}/TrainingTopic/get-all`);
    return rows(data).map(topic).filter(item => item.topicId > 0);
  },
  async create(payload: TopicInput): Promise<void> {
    await http.post(`${root}/TrainingTopic/create`, payload);
  },
  async update(topicId: number, payload: TopicInput): Promise<void> {
    await http.put(`${root}/TrainingTopic/update/${topicId}`, payload);
  },
  async remove(topicId: number): Promise<void> {
    await http.delete(`${root}/TrainingTopic/delete/${topicId}`);
  },
  async restore(topicId: number): Promise<void> {
    await http.patch(`${root}/TrainingTopic/restore/${topicId}`, {});
  },
};

export const trainingTopicContentApi = {
  async getByTopic(topicId: number): Promise<TrainingTopicContent[]> {
    const { data } = await http.get(`${root}/TrainingTopicContent/get-by-topic/${topicId}`);
    return rows(data).map(content).filter(item => item.contentId > 0);
  },
  async create(topicId: number, contents: ContentInput[]): Promise<void> {
    await http.post(`${root}/TrainingTopicContent/create`, { topicId, contents });
  },
  async update(contentId: number, topicId: number, payload: ContentInput): Promise<void> {
    await http.put(`${root}/TrainingTopicContent/update/${contentId}`, { topicId, ...payload });
  },
  async remove(contentId: number): Promise<void> {
    await http.delete(`${root}/TrainingTopicContent/delete/${contentId}`);
  },
  async restore(contentId: number): Promise<void> {
    await http.patch(`${root}/TrainingTopicContent/restore/${contentId}`, {});
  },
};

export const trainingCourseTopicApi = {
  async getCourses(): Promise<TrainingCourseOption[]> {
    const { data } = await http.get(`${root}/TrainingCourse/get-all`);
    return rows(data).map(item => ({
      courseId: Number(field(item, 'courseId', 'course_Id') ?? 0),
      courseName: String(field(item, 'courseName', 'course_Name') ?? ''),
    })).filter(item => item.courseId > 0);
  },
  async getByCourse(courseId: number): Promise<TrainingCourseTopic[]> {
    const { data } = await http.get(`${root}/TrainingCourseTopic/get-by-course/${courseId}`);
    return rows(data).map(mapping).filter(item => item.courseTopicId > 0);
  },
  async createMultiple(payload: CourseTopicInput): Promise<void> {
    await http.post(`${root}/TrainingCourseTopic/create-multiple`, payload);
  },
  async update(courseId: number, payload: CourseTopicInput): Promise<void> {
    await http.put(`${root}/TrainingCourseTopic/update/${courseId}`, payload);
  },
  async remove(courseTopicId: number): Promise<void> {
    await http.delete(`${root}/TrainingCourseTopic/delete/${courseTopicId}`);
  },
  async restore(courseTopicId: number): Promise<void> {
    await http.patch(`${root}/TrainingCourseTopic/restore/${courseTopicId}`, {});
  },
};
