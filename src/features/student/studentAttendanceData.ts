type Row = Record<string, unknown>;

export interface StudentAttendanceEntry {
  key: string;
  session: string;
  topic: string;
  date: string;
  status: 'Present' | 'Absent' | 'Not marked';
}

const studentKeys = ['studentId', 'student_Id', 'student_id', 'StudentId'];
const registrationKeys = ['registrationId', 'registration_Id', 'registration_id', 'RegistrationId', 'studentRegistrationId', 'student_registration_id'];
const batchKeys = ['batchId', 'batch_Id', 'batch_id', 'BatchId'];
const sessionKeys = ['sessionId', 'session_id', 'scheduleAttendanceId', 'schedule_attendance_id', 'batchScheduleAttendanceId', 'batch_schedule_attendance_id', 'batchScheduleId', 'batch_schedule_id'];
const dateKeys = ['attendanceDate', 'attendance_date', 'attendance_Date', 'sessionDate', 'session_date', 'date', 'actualDate', 'actual_date'];
const topicKeys = ['contentName', 'content_name', 'topicName', 'topic_name', 'topic', 'sessionName', 'session_name', 'content'];
const statusKeys = ['isPresent', 'is_present', 'IsPresent', 'present', 'attendanceStatus', 'attendance_status', 'status'];
const childKeys = ['data', 'result', 'attendance', 'attendanceRecords', 'attendance_records', 'attendanceDetails', 'attendanceList', 'sessions', 'records', 'items', '$values', 'list'];

function asRow(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function read(row: Row, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function statusOf(value: unknown): StudentAttendanceEntry['status'] {
  if (value === true || value === 1) return 'Present';
  if (value === false || value === 0) return 'Absent';
  const text = scalar(value).toLowerCase();
  if (['present', 'true', '1', 'p'].includes(text)) return 'Present';
  if (['absent', 'false', '0', 'a'].includes(text)) return 'Absent';
  return 'Not marked';
}

/**
 * This is the authenticated StudentAttendance endpoint, not a batch roster.
 * The backend must authorize the batch and return only the signed-in student's
 * attendance. Reject explicitly conflicting identities as a second check.
 * Never traverse student/roster collections or expose raw response fields.
 */
export function normalizeStudentAttendance(
  response: unknown,
  studentId: number,
  batchId: number,
  registrationIds: readonly number[],
): StudentAttendanceEntry[] {
  const owned = new Set(registrationIds);
  const entries = new Map<string, StudentAttendanceEntry>();
  let recognized = false;
  let rejected = false;

  function visit(value: unknown, depth: number): void {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      if (!value.length) recognized = true;
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const row = asRow(value);
    if (!row) return;
    if (row.success === false || row.isSuccess === false) throw new Error('Attendance request unsuccessful.');
    const owner = read(row, studentKeys);
    const registration = read(row, registrationKeys);
    const batch = read(row, batchKeys);
    if ((owner !== undefined && Number(owner) !== studentId) ||
        (registration !== undefined && !owned.has(Number(registration))) ||
        (batch !== undefined && Number(batch) !== batchId)) {
      rejected = true;
      return;
    }
    const session = scalar(read(row, sessionKeys));
    const date = scalar(read(row, dateKeys));
    const topic = scalar(read(row, topicKeys));
    const status = read(row, statusKeys);
    const children = childKeys.map(key => row[key]).filter(child => Array.isArray(child) || asRow(child) !== null);
    if (children.length) {
      for (const child of children) visit(child, depth + 1);
      return;
    }
    // Require a recognizable session/date, not a summary count or arbitrary object.
    if (!session && !date) return;
    if (status === undefined && !Object.keys(row).some(key => statusKeys.includes(key))) return;
    recognized = true;
    const entry: StudentAttendanceEntry = {
      key: session ? 'session-' + session : 'date-' + date + '-' + topic,
      session,
      date,
      topic,
      status: statusOf(status),
    };
    const previous = entries.get(entry.key);
    if (previous && previous.status !== entry.status) throw new Error('Conflicting attendance records.');
    entries.set(entry.key, entry);
  }

  visit(response, 0);
  if (!recognized || (rejected && entries.size === 0)) throw new Error('Attendance response could not be verified.');
  return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date) ||
    (Number(b.session) || 0) - (Number(a.session) || 0));
}
