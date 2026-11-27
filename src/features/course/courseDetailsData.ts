import type { TrainingCourseTopic, TrainingTopicContent } from '@/api/developerTrainingApi';

type Row = Record<string, unknown>;

export function read(row: Row, ...keys: string[]): unknown {
  return keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== '');
}

export function positiveId(value: unknown): number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function deleted(row: Row): boolean {
  const flag = read(row, 'is_deleted', 'isDeleted', 'deleted', 'IsDeleted');
  const active = read(row, 'is_active', 'isActive');
  return flag === true || flag === 1 || flag === '1' || flag === 'true' ||
    Boolean(read(row, 'deletedAt', 'deleted_at', 'deleted_At')) ||
    active === false || active === 0 || active === 'false' || active === '0';
}

export function mappedTopics(rows: TrainingCourseTopic[], courseId: number): TrainingCourseTopic[] {
  const topics = new Map<number, TrainingCourseTopic>();
  for (const row of rows) {
    if (row.courseId === courseId && row.topicId > 0 && !row.isDeleted && !topics.has(row.topicId)) {
      topics.set(row.topicId, row);
    }
  }
  return [...topics.values()];
}

export function topicContents(rows: TrainingTopicContent[], topicId: number): TrainingTopicContent[] {
  const contents = new Map<number, TrainingTopicContent>();
  for (const row of rows) {
    if (row.topicId === topicId && row.contentId > 0 && !row.isDeleted && !contents.has(row.contentId)) {
      contents.set(row.contentId, row);
    }
  }
  return [...contents.values()];
}

export interface RelatedBatch {
  id: number;
  topicId: number;
  name: string;
  topic: string;
  trainer: string;
  branch: string;
  startDate: string;
  endDate: string;
  timing: string;
  deleted: boolean;
}

export function relatedBatches(rows: Row[], topics: TrainingCourseTopic[]): RelatedBatch[] {
  const topicIds = new Map(topics.map(topic => [topic.topicId, topic.topicName]));
  const batches = new Map<number, RelatedBatch>();
  for (const row of rows) {
    const id = positiveId(read(row, 'batch_id', 'batchId', 'BatchId', 'id'));
    const topicId = positiveId(read(row, 'topic_id', 'topicId', 'TopicId'));
    if (!id || !topicIds.has(topicId) || batches.has(id)) continue;
    batches.set(id, {
      id, topicId,
      name: String(read(row, 'batch_name', 'batchName', 'BatchName') ?? 'Unnamed batch'),
      topic: topicIds.get(topicId) || String(read(row, 'topic_name', 'topicName') ?? 'Topic #' + topicId),
      trainer: String(read(row, 'employee_name', 'employeeName', 'trainerName') ?? '—'),
      branch: String(read(row, 'branch_name', 'branchName') ?? '—'),
      startDate: String(read(row, 'start_date', 'startDate') ?? ''),
      endDate: String(read(row, 'end_date', 'endDate') ?? ''),
      timing: String(read(row, 'batch_time', 'batchTime') ?? '—'),
      deleted: deleted(row),
    });
  }
  return [...batches.values()];
}

export function countAssignments(rows: Row[], batchId: number): number {
  const registrations = new Set<number>();
  for (const row of rows) {
    const assignedBatch = read(row, 'batch_id', 'batchId', 'BatchId');
    if (assignedBatch !== undefined && positiveId(assignedBatch) !== batchId) continue;
    const registration = positiveId(read(row, 'registration_id', 'registrationId', 'registration_Id', 'RegistrationId'));
    if (registration && !deleted(row)) registrations.add(registration);
  }
  return registrations.size;
}
