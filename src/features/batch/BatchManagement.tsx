import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import RowActionsMenu from '@/components/RowActionsMenu';
import { TablePagination, useTablePage } from '@/components/TablePagination';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  batchApi,
  batchDirectoryApi,
  batchScheduleApi,
  batchScheduleAttendanceApi,
  batchStudentApi,
  scheduleAttendanceApi,
  type CreateBatchRequest,
} from '@/api/batchApi';
import { directoryApi, type BranchOption } from '@/api/directoryApi';
import { emailAddressFrom, sendUniqueAutomaticEmails } from '@/core/notifications/automaticEmail';
import { emailApi } from '@/api/emailApi';
import { studentApi } from '@/api/studentApi';
import './BatchManagement.css';

type Row = Record<string, any>;
type BatchRow = Row & { batchId: number; batchName: string };
type RegistrationRow = Row & { registrationId: number; studentName: string; selected: boolean };
type StudentRow = Row & { batchStudentId: number; registrationId: number; studentName: string; isPresent: boolean };
type ScheduleTab = 'schedule' | 'students' | 'sessions' | 'records';
const read = (row: Row, ...keys: string[]) => keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null && value !== '');
const idOf = (row: Row) => Number(read(row, 'batch_id', 'batchId', 'BatchId', 'id') ?? 0);
const deleted = (row: Row) => Boolean(read(row, 'is_deleted', 'isDeleted', 'deleted', 'deletedAt', 'deleted_at')) || read(row, 'is_active', 'isActive') === false;
const formatDate = (value: unknown) => value && !Number.isNaN(new Date(String(value)).getTime()) ? new Date(String(value)).toLocaleDateString('en-GB') : '—';
const dateInput = (value: unknown) => value ? String(value).slice(0, 10) : '';
const localMidnightIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
};
const time12 = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const emptyForm = (): CreateBatchRequest => ({
  batch_name: '', topic_id: 0, employee_id: 0, start_date: '', end_date: '',
  batch_time: '', branch_id: 0, playlist_title: '', playlist_key: '',
});

interface AssignmentEmailResult {
  requested: number;
  missing: number;
  failed: number;
}

/**
 * The batch registration dropdown can omit email addresses. Resolve missing
 * recipients by exact registration ID, then by exact student ID; never by name.
 * Email failures must not undo completed batch assignments.
 */
async function notifyBatchAssignments(assigned: RegistrationRow[], batchName: string, batchId: number): Promise<AssignmentEmailResult> {
  const emails = new Map<number, string>();
  const registrationsById = new Map<number, Row>();

  for (const student of assigned) {
    const email = emailAddressFrom(student);
    if (email) emails.set(student.registrationId, email);
  }

  if (emails.size < assigned.length) {
    try {
      const roster = await batchStudentApi.getByBatch(batchId);
      for (const record of roster) {
        const id = Number(read(record, 'registrationId', 'registration_id', 'registration_Id') ?? 0);
        if (id <= 0) continue;
        registrationsById.set(id, record);
        if (!assigned.some((student) => student.registrationId === id) || emails.has(id)) continue;
        const email = emailAddressFrom(record);
        if (email) emails.set(id, email);
      }
    } catch (error: any) {
      console.warn('Batch assignment roster email lookup failed:', error?.response?.status ?? 'network error');
    }
  }

  if (emails.size < assigned.length) {
    try {
      const records = await studentApi.getRegistrations();
      for (const record of records) {
        const id = Number(read(record, 'registrationId', 'registration_id', 'registration_Id', 'RegistrationId') ?? 0);
        if (id > 0) registrationsById.set(id, { ...registrationsById.get(id), ...record });
      }

      for (const student of assigned) {
        if (emails.has(student.registrationId)) continue;
        const registration = registrationsById.get(student.registrationId);
        if (!registration) continue;

        const selectedStudentId = Number(read(student, 'studentId', 'student_id', 'student_Id') ?? 0);
        const registeredStudentId = Number(read(registration, 'studentId', 'student_id', 'student_Id') ?? 0);
        if (selectedStudentId > 0 && registeredStudentId > 0 && selectedStudentId !== registeredStudentId) continue;

        const email = emailAddressFrom(registration);
        if (email) emails.set(student.registrationId, email);
      }
    } catch (error: any) {
      console.warn('Batch assignment registration email lookup failed:', error?.response?.status ?? 'network error');
    }
  }

  if (emails.size < assigned.length) {
    const missingStudentIds = assigned.some((student) => {
      if (emails.has(student.registrationId)) return false;
      const registration = registrationsById.get(student.registrationId);
      return Number(read(student, 'studentId', 'student_id', 'student_Id') ??
        read(registration ?? {}, 'studentId', 'student_id', 'student_Id') ?? 0) > 0;
    });

    if (missingStudentIds) {
      try {
        const students = await studentApi.getStudents();
        const emailsByStudentId = new Map<number, string>(
          students.map((student): [number, string] => [student.studentId, emailAddressFrom(student)]),
        );

        for (const student of assigned) {
          if (emails.has(student.registrationId)) continue;
          const registration = registrationsById.get(student.registrationId);
          const studentId = Number(read(student, 'studentId', 'student_id', 'student_Id') ??
            read(registration ?? {}, 'studentId', 'student_id', 'student_Id') ?? 0);
          const email = emailsByStudentId.get(studentId);
          if (studentId > 0 && email) emails.set(student.registrationId, email);
        }
      } catch (error: any) {
        console.warn('Batch assignment student email lookup failed:', error?.response?.status ?? 'network error');
      }
    }
  }

  const requests = assigned
    .filter((student) => emails.has(student.registrationId))
    .map((student) => emailApi.send({
      toEmail: emails.get(student.registrationId)!,
      subject: 'CIIT batch assignment confirmation',
      body: `Hello ${student.studentName},\n\nYou have been assigned to ${batchName}. Please check your training timetable for more details.\n\nCIIT Training Institute`,
      isHtml: false,
    }));

  const results = await Promise.allSettled(requests);
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) console.warn('Batch assignment email API requests failed:', failed);

  return { requested: requests.length, missing: assigned.length - requests.length, failed };
}

export default function BatchManagement() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [topics, setTopics] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionError, setOptionError] = useState('');
  const optionsRequested = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const loadVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useAutoDismissMessage();
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [scheduleBatch, setScheduleBatch] = useState<BatchRow | null>(null);
  const [scheduleViewTab, setScheduleViewTab] = useState<ScheduleTab>('schedule');
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleCounts, setScheduleCounts] = useState<Partial<Record<ScheduleTab, number>>>({});
  const scheduleVersion = useRef(0);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<Row[]>([]);
  const [studentAttendanceRecords, setStudentAttendanceRecords] = useState<Row[]>([]);
  const [editingSessionId, setEditingSessionId] = useState(0);
  const [sessionEditDate, setSessionEditDate] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailsBatch, setDetailsBatch] = useState<BatchRow | null>(null);
  const [editingBatchId, setEditingBatchId] = useState(0);
  const [form, setForm] = useState<CreateBatchRequest>(emptyForm());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [studentBatch, setStudentBatch] = useState<BatchRow | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [attendanceBatch, setAttendanceBatch] = useState<BatchRow | null>(null);
  const [attendanceScheduleId, setAttendanceScheduleId] = useState(0);
  const [attendanceSchedules, setAttendanceSchedules] = useState<Row[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceStudents, setAttendanceStudents] = useState<StudentRow[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState(0);
  const [scheduleEdit, setScheduleEdit] = useState<Row>({});

  async function load() {
    const version = ++loadVersion.current;
    setLoading(true); setLoadingCounts(true); setError('');
    const batchRequest = batchApi.getAll();
    const studentsRequest = batchStudentApi.getAll().then(
      (students) => ({ students, ok: true } as const),
      (error: unknown) => ({ error, ok: false } as const),
    );
    let mapped: BatchRow[];
    try {
      const records = await batchRequest;
      if (version !== loadVersion.current) return;
      mapped = records.map((row) => ({ ...row, batchId: idOf(row), batchName: String(read(row, 'batch_name', 'batchName', 'BatchName') ?? 'Unnamed Batch') }))
        .filter((row) => row.batchId > 0) as BatchRow[];
      setBatches(mapped);
    } catch (requestError: any) {
      if (version !== loadVersion.current) return;
      setError(requestError?.response?.data?.message || 'Unable to load batches.');
      setLoading(false);
      setLoadingCounts(false);
      return;
    }
    setLoading(false);
    try {
      const result = await studentsRequest;
      if (version !== loadVersion.current) return;
      if (!result.ok) throw result.error;
      const nextCounts: Record<number, number | null> = {};
      result.students.forEach((student) => {
        const nestedBatch: Record<string, unknown> = student.batch && typeof student.batch === 'object'
          ? student.batch as Record<string, unknown>
          : {};
        const batchId = Number(read(student, 'batch_id', 'batchId') ?? nestedBatch.batch_id ?? nestedBatch.batchId ?? 0);
        if (batchId > 0) nextCounts[batchId] = (nextCounts[batchId] ?? 0) + 1;
      });
      mapped.filter((row) => !deleted(row)).forEach((row) => {
        if (nextCounts[row.batchId] === undefined) nextCounts[row.batchId] = 0;
      });
      setCounts(nextCounts);
    } catch (requestError: any) {
      const unavailableCounts: Record<number, number | null> = {};
      mapped.filter((row) => !deleted(row)).forEach((row) => { unavailableCounts[row.batchId] = null; });
      setCounts(unavailableCounts);
      setError(requestError?.response?.data?.message || 'Loaded batches, but student counts could not be retrieved.');
    }
    setLoadingCounts(false);
  }

  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; scheduleVersion.current += 1; };
  }, []);

  const active = useMemo(() => batches.filter((row) => !deleted(row)), [batches]);
  const removed = useMemo(() => batches.filter(deleted), [batches]);
  const displayed = tab === 'active' ? active : removed;
  const { pageRows, pagination } = useTablePage(displayed, tab);
  const filteredRegistrations = useMemo(() => {
    const search = registrationSearch.trim().toLowerCase();
    if (!search) return registrations;
    return registrations.filter((item) =>
      `${item.studentName} ${read(item, 'lastName', 'last_name') ?? ''} ${read(item, 'registrationCode', 'registration_code') ?? ''} ${read(item, 'emailAddress', 'email_address') ?? ''} ${read(item, 'mobileNumber', 'mobile_number') ?? ''}`
        .toLowerCase().includes(search));
  }, [registrations, registrationSearch]);
  const visibleRegistrationIds = useMemo(() => new Set(filteredRegistrations.map(item => item.registrationId)), [filteredRegistrations]);
  const registrationPage = useTablePage(filteredRegistrations, `${studentBatch?.batchId ?? ''}:${registrationSearch}`);

  function loadBatchOptions() {
    if (optionsRequested.current) return;
    optionsRequested.current = true;
    setLoadingOptions(true);
    setOptionError('');
    Promise.allSettled([batchDirectoryApi.getTopics(), batchDirectoryApi.getEmployees(), directoryApi.getBranches()])
      .then(([topicResult, employeeResult, branchResult]) => {
        if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
        if (employeeResult.status === 'fulfilled') setEmployees(employeeResult.value);
        if (branchResult.status === 'fulfilled') setBranches(branchResult.value);
        if ([topicResult, employeeResult, branchResult].some(result => result.status === 'rejected')) {
          optionsRequested.current = false;
          setOptionError('Some batch form options could not be loaded.');
        }
        setLoadingOptions(false);
      });
  }

  function openCreate() {
    setEditingBatchId(0); setForm(emptyForm()); setStartTime('09:00'); setEndTime('11:00');
    setError(''); setShowCreate(true);
    loadBatchOptions();
  }

  async function openEdit(row: BatchRow) {
    setError(''); setSaving(true);
    loadBatchOptions();
    try {
      const raw = await batchApi.getById(row.batchId) as Row;
      const record = raw?.data ?? raw?.result ?? raw;
      const batchTime = String(read(record, 'batch_time', 'batchTime') ?? '09:00 AM - 11:00 AM');
      const timeParts = batchTime.split(/\\s*-\\s*/);
      const to24 = (v: string) => {
        const match = v.trim().match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i);
        if (!match) return '09:00';
        let hour = Number(match[1]) % 12;
        if (match[3].toUpperCase() === 'PM') hour += 12;
        return `${String(hour).padStart(2, '0')}:${match[2]}`;
      };
      setEditingBatchId(row.batchId);
      setForm({
        batch_name: String(read(record, 'batch_name', 'batchName') ?? ''),
        topic_id: Number(read(record, 'topic_id', 'topicId') ?? 0),
        employee_id: Number(read(record, 'employee_id', 'employeeId') ?? 0),
        start_date: dateInput(read(record, 'start_date', 'startDate')),
        end_date: dateInput(read(record, 'end_date', 'endDate')),
        batch_time: batchTime,
        branch_id: Number(read(record, 'branch_id', 'branchId') ?? 0),
        playlist_title: String(read(record, 'playlist_title', 'playlistTitle') ?? ''),
        playlist_key: String(read(record, 'playlist_key', 'playlistKey') ?? ''),
      });
      setStartTime(to24(timeParts[0] ?? '09:00 AM')); setEndTime(to24(timeParts[1] ?? '11:00 AM'));
      setShowCreate(true);
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to load batch for editing.'); }
    finally { setSaving(false); }
  }

  async function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (!form.batch_name.trim() || !form.topic_id || !form.employee_id || !form.branch_id || !form.start_date || !form.end_date || !startTime || !endTime) {
      setError('Complete all required batch fields.'); return;
    }
    const start = new Date(`${form.start_date}T00:00:00`);
    const end = new Date(`${form.end_date}T00:00:00`);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    if (end < start || (end.getTime() === start.getTime() && endHour * 60 + endMinute <= startHour * 60 + startMinute)) {
      setError('End date/time must be later than start date/time.'); return;
    }
    const payload: CreateBatchRequest = {
      ...form, batch_name: form.batch_name.trim(), topic_id: Number(form.topic_id), employee_id: Number(form.employee_id),
      branch_id: Number(form.branch_id), start_date: localMidnightIso(form.start_date), end_date: localMidnightIso(form.end_date),
      batch_time: `${time12(startTime)} - ${time12(endTime)}`, playlist_title: form.playlist_title.trim(), playlist_key: form.playlist_key.trim(),
    };
    const previousBatch = editingBatchId
      ? batches.find((batch) => batch.batchId === editingBatchId)
      : undefined;
    const previousTiming = previousBatch ? String(read(previousBatch, 'batch_time', 'batchTime') ?? '') : '';
    const previousStart = previousBatch ? dateInput(read(previousBatch, 'start_date', 'startDate')) : '';
    const previousEnd = previousBatch ? dateInput(read(previousBatch, 'end_date', 'endDate')) : '';
    const scheduleChanged = !!previousBatch && (
      (!!previousTiming && previousTiming !== payload.batch_time) ||
      (!!previousStart && previousStart !== form.start_date) ||
      (!!previousEnd && previousEnd !== form.end_date)
    );

    setSaving(true);
    try {
      if (editingBatchId) {
        await batchApi.update(editingBatchId, payload);
        if (scheduleChanged) {
          void batchStudentApi.getByBatch(editingBatchId)
            .then((students) => sendUniqueAutomaticEmails(
              students,
              'CIIT batch timing updated',
              `Your batch ${payload.batch_name} has an updated schedule.\nStart date: ${form.start_date}\nEnd date: ${form.end_date}\nTiming: ${payload.batch_time}\n\nCIIT Training Institute`,
            ))
            .catch((notificationError: unknown) => console.warn('Batch timing notification lookup failed:', notificationError));
        }
      } else {
        await batchApi.create(payload);
      }
      setShowCreate(false); setSuccess(editingBatchId ? 'Batch updated successfully.' : 'Batch created successfully.');
      setTab('active'); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.message || (editingBatchId ? 'Unable to update batch.' : 'Unable to create batch.')); }
    finally { setSaving(false); }
  }

  async function removeBatch(row: BatchRow) {
    if (!window.confirm(`Remove batch “${row.batchName}”?`)) return;
    setSaving(true); setError('');
    try { await batchApi.remove(row.batchId); setSuccess('Batch removed successfully.'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to remove batch.'); }
    finally { setSaving(false); }
  }
  async function restoreBatch(row: BatchRow) {
    setSaving(true); setError('');
    try { await batchApi.restore(row.batchId); setSuccess('Batch restored successfully.'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore batch.'); }
    finally { setSaving(false); }
  }

  async function viewSchedule(row: BatchRow, requestedTab?: ScheduleTab) {
    const sameBatch = scheduleBatch?.batchId === row.batchId;
    const tab = requestedTab ?? (sameBatch ? scheduleViewTab : 'schedule');
    const version = ++scheduleVersion.current;
    if (!requestedTab || !sameBatch) setScheduleCounts({});
    setScheduleBatch(row); setScheduleViewTab(tab);
    setEditingScheduleId(0); setEditingSessionId(0); setError(''); setScheduleError('');
    setLoadingSchedule(true);
    try {
      let count: number;
      if (tab === 'schedule') {
        const scheduleRows = await batchScheduleApi.getByBatch(row.batchId);
        if (version !== scheduleVersion.current) return;
        setSchedules(scheduleRows);
        count = scheduleRows.length;
      } else if (tab === 'students') {
        const studentRows = await batchStudentApi.getByBatch(row.batchId);
        if (version !== scheduleVersion.current) return;
        setRoster(studentRows.map((item) => ({
          ...item,
          batchStudentId: Number(read(item, 'batch_student_id', 'batchStudentId', 'id') ?? 0),
          registrationId: Number(read(item, 'registration_id', 'registrationId') ?? 0),
          studentName: String(read(item, 'student_name', 'studentName', 'candidateName', 'name') ?? 'Student'),
          isPresent: true,
        })));
        count = studentRows.length;
      } else {
        const [scheduleRows, allSessions, allAttendance] = await Promise.all([
          batchScheduleApi.getByBatch(row.batchId),
          batchScheduleAttendanceApi.getAll(),
          tab === 'records' ? scheduleAttendanceApi.getAll() : [],
        ]);
        if (version !== scheduleVersion.current) return;
        const scheduleIds = new Set(scheduleRows.map((item) => Number(read(item, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0)));
        const batchSessions = allSessions.filter((item) => scheduleIds.has(Number(read(item, 'batch_schedule_id', 'batchScheduleId') ?? 0)));
        if (tab === 'sessions') {
          setAttendanceSessions(batchSessions);
          count = batchSessions.length;
        } else {
          const sessionIds = new Set(batchSessions.map((item) => Number(read(item, 'schedule_attendance_id', 'scheduleAttendanceId', 'batch_schedule_attendance_id', 'id') ?? 0)));
          const records = allAttendance.filter((item) => sessionIds.has(Number(read(item, 'schedule_attendance_id', 'scheduleAttendanceId') ?? 0)));
          setStudentAttendanceRecords(records);
          count = records.length;
        }
      }
      setScheduleCounts(previous => ({ ...previous, [tab]: count }));
    } catch (requestError: any) {
      if (version !== scheduleVersion.current) return;
      setScheduleCounts(previous => ({ ...previous, [tab]: undefined }));
      setScheduleError(requestError?.response?.data?.message || 'Unable to load this batch section.');
    } finally {
      if (version === scheduleVersion.current) setLoadingSchedule(false);
    }
  }

  function closeSchedule() {
    scheduleVersion.current += 1;
    setScheduleBatch(null);
  }

  async function generateSchedule(row: BatchRow) {
    if (!window.confirm(`Generate schedule for ${row.batchName}?`)) return;
    setSaving(true); setError('');
    try {
      await batchScheduleApi.generate(row.batchId);
      setSuccess('Schedule generated successfully.');
      void batchStudentApi.getByBatch(row.batchId)
        .then((students) => sendUniqueAutomaticEmails(
          students,
          'CIIT batch schedule available',
          `The schedule for your batch ${row.batchName} has been generated. Please check your CIIT training schedule.\n\nCIIT Training Institute`,
        ))
        .catch((notificationError: unknown) => console.warn('Generated schedule notification lookup failed:', notificationError));
      await viewSchedule(row);
    }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to generate schedule.'); }
    finally { setSaving(false); }
  }

  async function removeStudent(student: StudentRow) {
    if (!student.batchStudentId || !window.confirm(`Remove ${student.studentName} from this batch?`)) return;
    setSaving(true); setError('');
    try {
      await batchStudentApi.remove(student.batchStudentId);
      setRoster((previous) => previous.filter((item) => item.batchStudentId !== student.batchStudentId));
      setScheduleCounts((previous) => ({ ...previous, students: Math.max(0, (previous.students ?? 1) - 1) }));
      if (loadingCounts) {
        await load();
      } else if (scheduleBatch) {
        setCounts((previous) => ({ ...previous, [scheduleBatch.batchId]: Math.max(0, (previous[scheduleBatch.batchId] ?? 1) - 1) }));
      }
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to remove student from batch.'); }
    finally { setSaving(false); }
  }

  async function openAddStudents(row: BatchRow) {
    setStudentBatch(row); setRegistrationSearch(''); setError(''); setRegistrations([]);
    setSaving(true);
    try {
      const [available, existingStudents] = await Promise.all([
        batchStudentApi.getRegistrations(row.batchId),
        batchStudentApi.getByBatch(row.batchId),
      ]);
      const alreadyAdded = new Set(
        existingStudents
          .filter((item) => !deleted(item))
          .map((item) => Number(read(item, 'registration_id', 'registrationId', 'student_registration_id', 'studentRegistrationId') ?? 0))
          .filter((id) => id > 0),
      );
      setRegistrations(available.map((item) => ({
        ...item,
        registrationId: Number(read(item, 'registration_id', 'registrationId', 'student_registration_id', 'studentRegistrationId', 'id') ?? 0),
        studentName: String(read(item, 'student_name', 'studentName', 'candidateName', 'firstName', 'first_name') ?? 'Student'),
        selected: false,
      })).filter((item) => item.registrationId > 0 && !alreadyAdded.has(item.registrationId)));
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to load eligible registrations.'); }
    finally { setSaving(false); }
  }

  async function addSelectedStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentBatch) return;
    const selected = registrations.filter((item) => item.selected);
    if (!selected.length) { setError('Select at least one student.'); return; }
    setSaving(true); setError('');
    try {
      const outcomes = await Promise.allSettled(selected.map((item) => batchStudentApi.create({ batch_id: studentBatch.batchId, registration_id: item.registrationId })));
      const assigned = selected.filter((_, index) => outcomes[index].status === 'fulfilled');
      const successes = assigned.length;
      const partialFailure = successes !== selected.length
        ? `${successes} of ${selected.length} students added. Some requests failed; check eligible list and retry.`
        : '';
      if (!partialFailure) setSuccess(`${successes} students added to ${studentBatch.batchName}.`);
      setStudentBatch(null);
      await load();
      if (partialFailure) setError(partialFailure);
      if (assigned.length) {
        void notifyBatchAssignments(assigned, studentBatch.batchName, studentBatch.batchId)
          .then(({ requested, missing, failed }) => {
            if (!missing && !failed) {
              console.info('Batch assignment email requests accepted:', requested);
              return;
            }
            const warnings = [
              missing ? `${missing} recipient email address(es) could not be resolved` : '',
              failed ? `${failed} email API request(s) failed` : '',
            ].filter(Boolean);
            setError((previous) => {
              const notice = `Batch assignment saved, but ${warnings.join(' and ')}.`;
              return previous ? `${previous} ${notice}` : notice;
            });
          })
          .catch(() => {
            setError((previous) => [previous, 'Batch assignment saved, but email notifications could not be completed.'].filter(Boolean).join(' '));
          });
      }
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to add students.'); }
    finally { setSaving(false); }
  }

  async function openAttendance(row: BatchRow) {
    setAttendanceBatch(row); setAttendanceDate(new Date().toISOString().slice(0, 10)); setAttendanceScheduleId(0); setAttendanceStudents([]);
    setAttendanceSchedules([]);
    setError(''); setSaving(true);
    try {
      const [scheduleRows, students] = await Promise.all([batchScheduleApi.getByBatch(row.batchId), batchStudentApi.getByBatch(row.batchId)]);
      setAttendanceSchedules(scheduleRows);
      const firstActiveSchedule = scheduleRows.find((item) => !deleted(item));
      setAttendanceScheduleId(Number(read(firstActiveSchedule ?? {}, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0));
      setAttendanceStudents(students.map((item) => ({
        ...item, batchStudentId: Number(read(item, 'batch_student_id', 'batchStudentId', 'id') ?? 0),
        registrationId: Number(read(item, 'registration_id', 'registrationId') ?? 0),
        studentName: String(read(item, 'student_name', 'studentName', 'candidateName', 'name') ?? 'Student'),
        isPresent: true,
      })).filter((item) => item.registrationId > 0));
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to load attendance data.'); }
    finally { setSaving(false); }
  }

  async function saveAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attendanceScheduleId || !attendanceDate || !attendanceStudents.length) {
      setError('Select a schedule and date; batch must have assigned students.'); return;
    }
    setSaving(true); setError('');
    try {
      const created = await batchScheduleAttendanceApi.create({ batch_schedule_id: attendanceScheduleId, attendance_date: new Date(`${attendanceDate}T00:00:00`).toISOString() }) as any;
      let sessionId = Number(read(created?.data ?? created?.result ?? created ?? {}, 'schedule_attendance_id', 'scheduleAttendanceId', 'batch_schedule_attendance_id', 'batchScheduleAttendanceId', 'id') ?? 0);
      if (!sessionId) {
        const allSessions = await batchScheduleAttendanceApi.getAll();
        const match = allSessions.find((item) => Number(read(item, 'batch_schedule_id', 'batchScheduleId') ?? 0) === attendanceScheduleId && String(read(item, 'attendance_date', 'attendanceDate') ?? '').slice(0, 10) === attendanceDate);
        sessionId = Number(read(match ?? {}, 'schedule_attendance_id', 'scheduleAttendanceId', 'id') ?? 0);
      }
      if (!sessionId) throw new Error('Attendance session created, but its ID could not be resolved.');
      const outcomes = await Promise.allSettled(attendanceStudents.map((student) => scheduleAttendanceApi.create({
        schedule_attendance_id: sessionId, registration_id: student.registrationId, is_present: student.isPresent ? 1 : 0,
      })));
      const failed = outcomes.filter((item) => item.status === 'rejected').length;
      if (failed) throw new Error(`Attendance session saved, but ${failed} student attendance entries failed.`);
      sendUniqueAutomaticEmails(
        attendanceStudents.filter((student) => !student.isPresent),
        'CIIT attendance notification',
        `Your attendance for ${attendanceBatch?.batchName || 'your batch'} on ${attendanceDate} was marked absent. If this is incorrect, please contact CIIT Training Institute.`,
      );
      setSuccess(`Attendance saved. Present: ${attendanceStudents.filter((item) => item.isPresent).length}; absent: ${attendanceStudents.filter((item) => !item.isPresent).length}.`);
      setAttendanceBatch(null);
    } catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'Unable to save attendance.'); }
    finally { setSaving(false); }
  }

  async function editSchedule(row: Row) {
    const id = Number(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0);
    if (!id) return;
    setEditingScheduleId(id);
    setScheduleEdit({ ...row, actual_date: dateInput(read(row, 'actual_date', 'actualDate')), status: String(read(row, 'status') ?? '') });
  }
  async function submitScheduleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await batchScheduleApi.update(editingScheduleId, scheduleEdit);
      if (scheduleBatch) {
        void batchStudentApi.getByBatch(scheduleBatch.batchId)
          .then((students) => sendUniqueAutomaticEmails(
            students,
            'CIIT batch schedule updated',
            `A training schedule entry for ${scheduleBatch.batchName} has been updated. Please check the latest date and status in your CIIT schedule.\n\nCIIT Training Institute`,
          ))
          .catch((notificationError: unknown) => console.warn('Updated schedule notification lookup failed:', notificationError));
      }
      setEditingScheduleId(0);
      if (scheduleBatch) await viewSchedule(scheduleBatch);
    }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to update schedule.'); }
    finally { setSaving(false); }
  }
  async function removeSchedule(row: Row) {
    const id = Number(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0);
    if (!id || !window.confirm('Delete this schedule entry?')) return;
    setSaving(true); setError('');
    try { await batchScheduleApi.remove(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete schedule.'); }
    finally { setSaving(false); }
  }
  async function restoreSchedule(row: Row) {
    const id = Number(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0);
    setSaving(true); setError('');
    try { await batchScheduleApi.restore(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore schedule.'); }
    finally { setSaving(false); }
  }

  async function submitSessionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSessionId || !sessionEditDate) return;
    const row = attendanceSessions.find((item) => Number(read(item, 'schedule_attendance_id', 'scheduleAttendanceId', 'id') ?? 0) === editingSessionId);
    if (!row) return;
    setSaving(true); setError('');
    try {
      await batchScheduleAttendanceApi.update(editingSessionId, { ...row, attendance_date: new Date(`${sessionEditDate}T00:00:00`).toISOString() });
      setEditingSessionId(0);
      if (scheduleBatch) await viewSchedule(scheduleBatch);
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to update attendance session.'); }
    finally { setSaving(false); }
  }
  async function removeSession(row: Row) {
    const id = Number(read(row, 'schedule_attendance_id', 'scheduleAttendanceId', 'id') ?? 0);
    if (!id || !window.confirm('Delete this attendance session?')) return;
    setSaving(true); setError('');
    try { await batchScheduleAttendanceApi.remove(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete attendance session.'); }
    finally { setSaving(false); }
  }
  async function restoreSession(row: Row) {
    const id = Number(read(row, 'schedule_attendance_id', 'scheduleAttendanceId', 'id') ?? 0);
    setSaving(true); setError('');
    try { await batchScheduleAttendanceApi.restore(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore attendance session.'); }
    finally { setSaving(false); }
  }
  async function toggleStudentAttendance(row: Row) {
    const id = Number(read(row, 'attendance_id', 'attendanceId', 'id') ?? 0);
    if (!id) { setError('Attendance record ID is unavailable.'); return; }
    const present = Number(read(row, 'is_present', 'isPresent') ?? 0) === 1 || read(row, 'is_present', 'isPresent') === true;
    setSaving(true); setError('');
    try {
      await scheduleAttendanceApi.update(id, { ...row, is_present: present ? 0 : 1 });
      if (scheduleBatch) await viewSchedule(scheduleBatch);
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to update student attendance.'); }
    finally { setSaving(false); }
  }
  async function removeStudentAttendance(row: Row) {
    const id = Number(read(row, 'attendance_id', 'attendanceId', 'id') ?? 0);
    if (!id || !window.confirm('Delete this student attendance record?')) return;
    setSaving(true); setError('');
    try { await scheduleAttendanceApi.remove(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete student attendance.'); }
    finally { setSaving(false); }
  }
  async function restoreStudentAttendance(row: Row) {
    const id = Number(read(row, 'attendance_id', 'attendanceId', 'id') ?? 0);
    setSaving(true); setError('');
    try { await scheduleAttendanceApi.restore(id); if (scheduleBatch) await viewSchedule(scheduleBatch); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore student attendance.'); }
    finally { setSaving(false); }
  }

  return <section className="batch-page">
    <header className="batch-header"><div><div className="batch-eyebrow">GROUP LEADER / BATCH MANAGEMENT</div><h1>Batch Management</h1><p>Manage active batches, students and class schedules.</p></div>
      <div className="batch-header-actions"><button className="batch-secondary" type="button" onClick={() => void (scheduleBatch ? viewSchedule(scheduleBatch) : load())} disabled={saving || (scheduleBatch ? loadingSchedule : loading || loadingCounts)}>↻ Refresh</button><button className="batch-primary" type="button" onClick={openCreate} disabled={saving}>＋ New Batch</button></div>
    </header>
    {error && <AutoDismissAlert className="batch-error" message={error}><button type="button" onClick={() => void load()}>Retry</button></AutoDismissAlert>}
    {success && <div className="batch-success" role="status">{success}</div>}
    {scheduleBatch ? <section className="batch-table-card batch-schedule-view">
      <div className="batch-table-heading batch-schedule-heading">
        <div>
          <button className="batch-secondary" type="button" onClick={closeSchedule} disabled={saving}>← Back to Batches</button>
          <h2>Schedule — {scheduleBatch.batchName}</h2>
        </div>
        <button className="batch-primary" type="button" disabled={saving} onClick={() => void generateSchedule(scheduleBatch)}>Generate Schedule</button>
      </div>
      <div className="batch-schedule-tabs" role="group" aria-label="Batch schedule sections">
        {([['schedule', 'Schedule'], ['students', 'Students'], ['sessions', 'Attendance Sessions'], ['records', 'Attendance Records']] as const).map(([tab, label]) => (
          <button key={tab} type="button" className={scheduleViewTab === tab ? 'is-active' : ''} aria-pressed={scheduleViewTab === tab} disabled={saving}
            onClick={() => { if (scheduleViewTab !== tab) void viewSchedule(scheduleBatch, tab); }}>
            {label} {scheduleCounts[tab] !== undefined && <span className="batch-count">{scheduleCounts[tab]}</span>}
          </button>
        ))}
      </div>
      {loadingSchedule && <p className="batch-empty" role="status">Loading batch section…</p>}
      {scheduleError && <AutoDismissAlert className="batch-error" message={scheduleError}><button type="button" onClick={() => void viewSchedule(scheduleBatch, scheduleViewTab)}>Retry</button></AutoDismissAlert>}
      {!loadingSchedule && !scheduleError && scheduleViewTab === 'schedule' && <div className="batch-table-scroll batch-schedule-table-scroll"><table className="batch-table batch-schedule-table"><thead><tr><th>#</th><th>Content / Topic</th><th>Expected Date</th><th>Expected Day</th><th>Actual Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {schedules.map((row, index) => <tr key={String(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? index)}><td>{index + 1}</td><td>{String(read(row, 'content_name', 'contentName', 'topic_name') ?? '—')}</td><td>{formatDate(read(row, 'expected_date', 'expectedDate'))}</td><td>{String(read(row, 'expected_day', 'expectedDay') ?? '—')}</td><td>{formatDate(read(row, 'actual_date', 'actualDate'))}</td><td>{String(read(row, 'status') ?? '—')}</td><td><RowActionsMenu label="Schedule actions" disabled={saving} actions={deleted(row) ? [
          { label: 'Restore schedule', onSelect: () => void restoreSchedule(row) },
        ] : [
          { label: 'Edit schedule', onSelect: () => void editSchedule(row) },
          { label: 'Delete schedule', danger: true, onSelect: () => void removeSchedule(row) },
        ]} /></td></tr>)}
        {!schedules.length && <tr><td colSpan={7} className="batch-empty">No schedule entries found.</td></tr>}
      </tbody></table></div>}
      {editingScheduleId > 0 && createPortal(<div className="batch-modal-backdrop" onMouseDown={() => setEditingScheduleId(0)}><form onSubmit={submitScheduleEdit} className="batch-modal batch-modal-small" role="dialog" aria-modal="true" aria-labelledby="schedule-edit-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="schedule-edit-title">Update Schedule</h2><button type="button" aria-label="Close schedule editor" onClick={() => setEditingScheduleId(0)}>×</button></header><div className="batch-form-grid"><label>Actual Date<input type="date" value={String(scheduleEdit.actual_date ?? '')} onChange={(e) => setScheduleEdit({ ...scheduleEdit, actual_date: e.target.value ? localMidnightIso(e.target.value) : null })}/></label><label>Status<input value={String(scheduleEdit.status ?? '')} onChange={(e) => setScheduleEdit({ ...scheduleEdit, status: e.target.value })}/></label></div><footer><button type="button" className="batch-secondary" onClick={() => setEditingScheduleId(0)}>Cancel</button><button type="submit" className="batch-primary" disabled={saving}>Update</button></footer></form></div>, document.body)}
      {!loadingSchedule && !scheduleError && scheduleViewTab === 'students' && <>
      <div className="batch-table-heading batch-schedule-section-heading"><div><h2>Assigned Students</h2><p>Students currently assigned to this batch</p></div><span className="batch-count">{roster.length} students</span></div>
      <div className="batch-table-scroll batch-schedule-table-scroll"><table className="batch-table batch-schedule-table batch-schedule-table-short"><thead><tr><th>#</th><th>Student</th><th>Registration ID</th><th>Action</th></tr></thead><tbody>{roster.map((student, index) => <tr key={student.batchStudentId}><td>{index + 1}</td><td>{student.studentName}</td><td>{student.registrationId}</td><td><RowActionsMenu label={`Actions for ${student.studentName}`} disabled={saving} actions={[
          { label: 'Remove from batch', danger: true, onSelect: () => void removeStudent(student) },
        ]} /></td></tr>)}{!roster.length && <tr><td colSpan={4} className="batch-empty">No students assigned.</td></tr>}</tbody></table></div>
      </>}
      {!loadingSchedule && !scheduleError && scheduleViewTab === 'sessions' && <>
      <div className="batch-table-heading batch-schedule-section-heading"><div><h2>Attendance Sessions</h2><p>Attendance session records for this batch</p></div><span className="batch-count">{attendanceSessions.length} sessions</span></div>
      <div className="batch-table-scroll batch-schedule-table-scroll"><table className="batch-table batch-schedule-table batch-schedule-table-short"><thead><tr><th>Session ID</th><th>Schedule ID</th><th>Attendance Date</th><th>Actions</th></tr></thead><tbody>{attendanceSessions.map((item, index) => { const sessionId = Number(read(item, 'schedule_attendance_id', 'scheduleAttendanceId', 'batch_schedule_attendance_id', 'id') ?? 0); const isDeleted = deleted(item); return <tr key={sessionId || index}><td>{sessionId}</td><td>{Number(read(item, 'batch_schedule_id', 'batchScheduleId') ?? 0)}</td><td>{formatDate(read(item, 'attendance_date', 'attendanceDate'))}</td><td><RowActionsMenu label={`Actions for attendance session ${sessionId}`} disabled={saving} actions={isDeleted ? [
          { label: 'Restore session', onSelect: () => void restoreSession(item) },
        ] : [
          { label: 'Edit session', onSelect: () => { setEditingSessionId(sessionId); setSessionEditDate(dateInput(read(item, 'attendance_date', 'attendanceDate'))); } },
          { label: 'Delete session', danger: true, onSelect: () => void removeSession(item) },
        ]} /></td></tr>; })}{!attendanceSessions.length && <tr><td colSpan={4} className="batch-empty">No attendance sessions found.</td></tr>}</tbody></table></div>
      </>}
      {editingSessionId > 0 && createPortal(<div className="batch-modal-backdrop" onMouseDown={() => setEditingSessionId(0)}><form onSubmit={submitSessionEdit} className="batch-modal batch-modal-small" role="dialog" aria-modal="true" aria-labelledby="attendance-edit-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="attendance-edit-title">Edit Attendance Session</h2><button type="button" aria-label="Close attendance editor" onClick={() => setEditingSessionId(0)}>×</button></header><div className="batch-form-grid"><label>Attendance Date<input type="date" required value={sessionEditDate} onChange={(e) => setSessionEditDate(e.target.value)}/></label></div><footer><button type="button" className="batch-secondary" onClick={() => setEditingSessionId(0)}>Cancel</button><button type="submit" className="batch-primary" disabled={saving}>Update Session</button></footer></form></div>, document.body)}
      {!loadingSchedule && !scheduleError && scheduleViewTab === 'records' && <>
      <div className="batch-table-heading batch-schedule-section-heading"><div><h2>Student Attendance Records</h2><p>Toggle present/absent or manage individual records</p></div><span className="batch-count">{studentAttendanceRecords.length} records</span></div>
      <div className="batch-table-scroll batch-schedule-table-scroll"><table className="batch-table batch-schedule-table batch-schedule-table-short"><thead><tr><th>Record ID</th><th>Session ID</th><th>Registration ID</th><th>Present</th><th>Actions</th></tr></thead><tbody>{studentAttendanceRecords.map((item, index) => { const recordId = Number(read(item, 'attendance_id', 'attendanceId', 'id') ?? 0); const isDeleted = deleted(item); const isPresent = Number(read(item, 'is_present', 'isPresent') ?? 0) === 1 || read(item, 'is_present', 'isPresent') === true; return <tr key={recordId || index}><td>{recordId}</td><td>{Number(read(item, 'schedule_attendance_id', 'scheduleAttendanceId') ?? 0)}</td><td>{Number(read(item, 'registration_id', 'registrationId') ?? 0)}</td><td>{isPresent ? 'Present' : 'Absent'}</td><td><RowActionsMenu label={`Actions for attendance record ${recordId}`} disabled={saving} actions={isDeleted ? [
          { label: 'Restore attendance', onSelect: () => void restoreStudentAttendance(item) },
        ] : [
          { label: isPresent ? 'Mark absent' : 'Mark present', onSelect: () => void toggleStudentAttendance(item) },
          { label: 'Delete attendance', danger: true, onSelect: () => void removeStudentAttendance(item) },
        ]} /></td></tr>; })}{!studentAttendanceRecords.length && <tr><td colSpan={5} className="batch-empty">No individual attendance records found.</td></tr>}</tbody></table></div>
      </>}
    </section> : <>
      <div className="batch-tabs"><button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Batches <span>{active.length}</span></button><button type="button" className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>Deleted Batches <span>{removed.length}</span></button></div>
      <section className="batch-table-card"><div className="batch-table-heading"><div><h2>{tab === 'active' ? 'Active Batches' : 'Deleted Batches'}</h2><p>Batch overview and quick actions</p></div><span className="batch-count">{displayed.length} records</span></div>
        <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Batch Name</th><th>Topic Name</th><th>Trainer Name</th><th>Start Date</th><th>End Date</th><th>Batch Time</th><th># Students</th><th>Action</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={9} className="batch-empty">Loading batches...</td></tr> : pageRows.map((row, i) => <tr key={row.batchId}><td>{pagination.firstRow + i}</td><td><strong>{row.batchName}</strong><small>ID: {row.batchId}</small></td><td>{String(read(row, 'topic_name', 'topicName') ?? `Topic #${read(row, 'topic_id', 'topicId') ?? '—'}`)}</td><td>{String(read(row, 'employee_name', 'employeeName') ?? `Employee #${read(row, 'employee_id', 'employeeId') ?? '—'}`)}</td><td>{formatDate(read(row, 'start_date', 'startDate'))}</td><td>{formatDate(read(row, 'end_date', 'endDate'))}</td><td>{String(read(row, 'batch_time', 'batchTime') ?? '—')}</td><td><span className="batch-student-count" aria-label={loadingCounts ? 'Loading student count' : undefined}>{loadingCounts ? '…' : counts[row.batchId] ?? '—'}</span></td><td><RowActionsMenu label={`Actions for batch ${row.batchName}`} disabled={saving} actions={tab === 'active' ? [
              { label: 'View schedule', onSelect: () => void viewSchedule(row) },
              { label: 'Add students', onSelect: () => void openAddStudents(row) },
              { label: 'Attendance', onSelect: () => void openAttendance(row) },
              { label: 'View details', onSelect: () => setDetailsBatch(row) },
              { label: 'Generate schedule', onSelect: () => void generateSchedule(row) },
              { label: 'Edit batch', onSelect: () => void openEdit(row) },
              { label: 'Remove batch', danger: true, onSelect: () => void removeBatch(row) },
            ] : [
              { label: 'Restore batch', onSelect: () => void restoreBatch(row) },
            ]} /></td></tr>)}
          {!loading && !displayed.length && <tr><td colSpan={9} className="batch-empty">{tab === 'active' ? 'No active batches found.' : 'No deleted batches found.'}</td></tr>}
        </tbody></table></div>
        {!loading && <TablePagination {...pagination} label="batches" />}
      </section>
    </>}
    {detailsBatch && createPortal(<div className="batch-modal-backdrop" onMouseDown={() => setDetailsBatch(null)}>
      <section className="batch-modal batch-modal-details" role="dialog" aria-modal="true" aria-labelledby="batch-details-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2 id="batch-details-title">Batch Details</h2><p className="batch-modal-subtitle">Complete overview for {detailsBatch.batchName}</p></div><button type="button" aria-label="Close batch details" onClick={() => setDetailsBatch(null)}>×</button></header>
        <div className="batch-detail-grid">
          <div><dt>Batch Name</dt><dd>{detailsBatch.batchName}</dd></div>
          <div><dt>Batch ID</dt><dd>{detailsBatch.batchId}</dd></div>
          <div><dt>Topic</dt><dd>{String(read(detailsBatch, 'topic_name', 'topicName') ?? '—')}</dd></div>
          <div><dt>Trainer</dt><dd>{String(read(detailsBatch, 'employee_name', 'employeeName') ?? '—')}</dd></div>
          <div><dt>Branch</dt><dd>{String(read(detailsBatch, 'branch_name', 'branchName') ?? '—')}</dd></div>
          <div><dt>Students</dt><dd>{loadingCounts ? 'Loading…' : counts[detailsBatch.batchId] ?? 'Not available'}</dd></div>
          <div><dt>Start Date</dt><dd>{formatDate(read(detailsBatch, 'start_date', 'startDate'))}</dd></div>
          <div><dt>End Date</dt><dd>{formatDate(read(detailsBatch, 'end_date', 'endDate'))}</dd></div>
          <div><dt>Batch Time</dt><dd>{String(read(detailsBatch, 'batch_time', 'batchTime') ?? '—')}</dd></div>
          <div><dt>Status</dt><dd>{deleted(detailsBatch) ? 'Deleted' : 'Active'}</dd></div>
          <div><dt>Playlist Title</dt><dd>{String(read(detailsBatch, 'playlist_title', 'playlistTitle') ?? '—')}</dd></div>
          <div><dt>Playlist Key</dt><dd>{String(read(detailsBatch, 'playlist_key', 'playlistKey') ?? '—')}</dd></div>
        </div>
        <footer><button className="batch-secondary" type="button" onClick={() => setDetailsBatch(null)}>Close</button></footer>
      </section>
    </div>, document.body)}
    {showCreate && createPortal(<div className="batch-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCreate(false); }}><section className="batch-modal" role="dialog" aria-modal="true" aria-labelledby="batch-form-title"><header><h2 id="batch-form-title">{editingBatchId ? 'Edit Batch' : 'New Batch'}</h2><button type="button" aria-label="Close batch form" disabled={saving} onClick={() => setShowCreate(false)}>×</button></header><form onSubmit={submitBatch}>
      {loadingOptions && <p role="status">Loading topics, trainers and branches…</p>}
      {optionError && <AutoDismissAlert className="batch-error" message={optionError}><button type="button" onClick={loadBatchOptions}>Retry</button></AutoDismissAlert>}
      <div className="batch-form-grid">
      <label>Batch Name *<input required value={form.batch_name} onChange={(e) => setForm({ ...form, batch_name: e.target.value })}/></label>
      <label>Topic *<select required disabled={loadingOptions} value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: Number(e.target.value) })}><option value={0}>Select Topic</option>{topics.map((item) => { const topicId = Number(read(item, 'topic_id', 'topicId', 'id') ?? 0); return <option key={topicId} value={topicId}>{String(read(item, 'topic_name', 'topicName', 'name') ?? 'Topic')}</option>; })}</select></label>
      <label>Trainer *<select required disabled={loadingOptions} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}><option value={0}>Select Trainer</option>{employees.map((item) => { const employeeId = Number(read(item, 'employee_id', 'employeeId', 'id') ?? 0); return <option key={employeeId} value={employeeId}>{String(read(item, 'employee_name', 'employeeName', 'name') ?? 'Employee')}</option>; })}</select></label>
      <label>Branch *<select required disabled={loadingOptions} value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: Number(e.target.value) })}><option value={0}>Select Branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Start Date *<input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}/></label><label>End Date *<input type="date" min={form.start_date || undefined} required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}/></label>
      <label>Start Time *<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)}/></label><label>End Time *<input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)}/></label>
      <label>Playlist Title<input value={form.playlist_title} onChange={(e) => setForm({ ...form, playlist_title: e.target.value })}/></label><label>Playlist Key<input value={form.playlist_key} onChange={(e) => setForm({ ...form, playlist_key: e.target.value })}/></label>
    </div><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving || loadingOptions}>{saving ? 'Saving...' : editingBatchId ? 'Update Batch' : 'Create Batch'}</button></footer></form></section></div>, document.body)}
    {studentBatch && createPortal(<div className="batch-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setStudentBatch(null); }}><section className="batch-modal batch-modal-small" role="dialog" aria-modal="true" aria-labelledby="batch-students-title"><header><h2 id="batch-students-title">Add Students — {studentBatch.batchName}</h2><button type="button" aria-label="Close add students" disabled={saving} onClick={() => setStudentBatch(null)}>×</button></header><form onSubmit={addSelectedStudents}><input aria-label="Search eligible students" placeholder="Search name, registration, email or mobile" value={registrationSearch} onChange={(e) => setRegistrationSearch(e.target.value)}/><div className="batch-student-selection" style={{ maxHeight: 360, overflow: 'auto', margin: '12px 0' }}><label><input type="checkbox" checked={filteredRegistrations.length > 0 && filteredRegistrations.every((item) => item.selected)} onChange={(e) => setRegistrations((previous) => previous.map((item) => visibleRegistrationIds.has(item.registrationId) ? { ...item, selected: e.target.checked } : item))}/> Select all matching ({filteredRegistrations.length})</label>{registrationPage.pageRows.map((item) => <label key={item.registrationId} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={item.selected} onChange={(e) => setRegistrations((previous) => previous.map((entry) => entry.registrationId === item.registrationId ? { ...entry, selected: e.target.checked } : entry))}/> {item.studentName} — Reg #{item.registrationId} {String(read(item, 'courseName', 'course_name') ?? '')}</label>)}{!filteredRegistrations.length && <p>{saving ? 'Loading eligible registrations…' : 'No eligible registrations found.'}</p>}</div><TablePagination {...registrationPage.pagination} label="eligible registrations" /><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setStudentBatch(null)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : `Add Selected (${registrations.filter((item) => item.selected).length})`}</button></footer></form></section></div>, document.body)}
    {attendanceBatch && createPortal(<div className="batch-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setAttendanceBatch(null); }}><section className="batch-modal" role="dialog" aria-modal="true" aria-labelledby="batch-attendance-title"><header><h2 id="batch-attendance-title">Attendance — {attendanceBatch.batchName}</h2><button type="button" aria-label="Close attendance form" disabled={saving} onClick={() => setAttendanceBatch(null)}>×</button></header><form onSubmit={saveAttendance}><label>Schedule *<select required value={attendanceScheduleId} onChange={(e) => setAttendanceScheduleId(Number(e.target.value))}><option value={0}>Select Schedule</option>{attendanceSchedules.filter((item) => !deleted(item)).map((item) => { const sid = Number(read(item, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0); return <option key={sid} value={sid}>{String(read(item, 'content_name', 'contentName', 'topic_name') ?? 'Content')} — {formatDate(read(item, 'expected_date', 'expectedDate'))}</option>; })}</select></label><label>Attendance Date *<input type="date" required value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}/></label><div style={{ maxHeight: 320, overflow: 'auto', margin: '12px 0' }}>{attendanceStudents.map((student) => <label key={student.registrationId} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={student.isPresent} onChange={(e) => setAttendanceStudents((previous) => previous.map((item) => item.registrationId === student.registrationId ? { ...item, isPresent: e.target.checked } : item))}/> {student.studentName} (Registration #{student.registrationId})</label>)}</div><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setAttendanceBatch(null)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Attendance'}</button></footer></form></section></div>, document.body)}
  </section>;
}
