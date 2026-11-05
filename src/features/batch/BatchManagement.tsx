import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import './BatchManagement.css';

type Row = Record<string, any>;
type BatchRow = Row & { batchId: number; batchName: string };
type RegistrationRow = Row & { registrationId: number; studentName: string; selected: boolean };
type StudentRow = Row & { batchStudentId: number; registrationId: number; studentName: string; isPresent: boolean };
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

export default function BatchManagement() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [topics, setTopics] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [scheduleBatch, setScheduleBatch] = useState<BatchRow | null>(null);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState(0);
  const [form, setForm] = useState<CreateBatchRequest>(emptyForm());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [studentBatch, setStudentBatch] = useState<BatchRow | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [attendanceBatch, setAttendanceBatch] = useState<BatchRow | null>(null);
  const [attendanceScheduleId, setAttendanceScheduleId] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceStudents, setAttendanceStudents] = useState<StudentRow[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState(0);
  const [scheduleEdit, setScheduleEdit] = useState<Row>({});

  async function load() {
    setLoading(true); setError('');
    let mapped: BatchRow[] = [];
    try {
      const records = await batchApi.getAll();
      mapped = records.map((row) => ({ ...row, batchId: idOf(row), batchName: String(read(row, 'batch_name', 'batchName', 'BatchName') ?? 'Unnamed Batch') }))
        .filter((row) => row.batchId > 0) as BatchRow[];
      setBatches(mapped);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load batches.');
      setLoading(false);
      return;
    }
    const countResults = await Promise.allSettled(mapped.filter((row) => !deleted(row)).map((row) => batchStudentApi.getByBatch(row.batchId)));
    const nextCounts: Record<number, number | null> = {};
    let countFailures = 0;
    countResults.forEach((result, index) => {
      const batchId = mapped.filter((row) => !deleted(row))[index].batchId;
      if (result.status === 'fulfilled') nextCounts[batchId] = result.value.length;
      else { nextCounts[batchId] = null; countFailures += 1; }
    });
    setCounts(nextCounts);
    if (countFailures) setError(`Loaded batches, but student counts failed for ${countFailures} batch(es).`);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    Promise.allSettled([batchDirectoryApi.getTopics(), batchDirectoryApi.getEmployees(), directoryApi.getBranches()])
      .then(([topicResult, employeeResult, branchResult]) => {
        if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
        if (employeeResult.status === 'fulfilled') setEmployees(employeeResult.value);
        if (branchResult.status === 'fulfilled') setBranches(branchResult.value);
      });
  }, []);

  const active = useMemo(() => batches.filter((row) => !deleted(row)), [batches]);
  const removed = useMemo(() => batches.filter(deleted), [batches]);
  const displayed = tab === 'active' ? active : removed;
  const filteredRegistrations = registrations.filter((item) =>
    `${item.studentName} ${read(item, 'lastName', 'last_name') ?? ''} ${read(item, 'registrationCode', 'registration_code') ?? ''} ${read(item, 'emailAddress', 'email_address') ?? ''} ${read(item, 'mobileNumber', 'mobile_number') ?? ''}`
      .toLowerCase().includes(registrationSearch.trim().toLowerCase()));

  function openCreate() {
    setEditingBatchId(0); setForm(emptyForm()); setStartTime('09:00'); setEndTime('11:00');
    setError(''); setShowCreate(true);
  }

  async function openEdit(row: BatchRow) {
    setError(''); setSaving(true);
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
    setSaving(true);
    try {
      if (editingBatchId) await batchApi.update(editingBatchId, payload);
      else await batchApi.create(payload);
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

  async function viewSchedule(row: BatchRow) {
    setScheduleBatch(row); setEditingScheduleId(0); setError('');
    try {
      const [scheduleRows, studentRows] = await Promise.all([batchScheduleApi.getByBatch(row.batchId), batchStudentApi.getByBatch(row.batchId)]);
      setSchedules(scheduleRows);
      setRoster(studentRows.map((item) => ({
        ...item,
        batchStudentId: Number(read(item, 'batch_student_id', 'batchStudentId', 'id') ?? 0),
        registrationId: Number(read(item, 'registration_id', 'registrationId') ?? 0),
        studentName: String(read(item, 'student_name', 'studentName', 'candidateName', 'name') ?? 'Student'),
        isPresent: true,
      })));
    } catch (requestError: any) { setSchedules([]); setRoster([]); setError(requestError?.response?.data?.message || 'Unable to load batch details.'); }
  }

  async function generateSchedule(row: BatchRow) {
    if (!window.confirm(`Generate schedule for ${row.batchName}?`)) return;
    setSaving(true); setError('');
    try { await batchScheduleApi.generate(row.batchId); setSuccess('Schedule generated successfully.'); await viewSchedule(row); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to generate schedule.'); }
    finally { setSaving(false); }
  }

  async function removeStudent(student: StudentRow) {
    if (!student.batchStudentId || !window.confirm(`Remove ${student.studentName} from this batch?`)) return;
    setSaving(true); setError('');
    try {
      await batchStudentApi.remove(student.batchStudentId);
      setRoster((previous) => previous.filter((item) => item.batchStudentId !== student.batchStudentId));
      if (scheduleBatch) setCounts((previous) => ({ ...previous, [scheduleBatch.batchId]: Math.max(0, (previous[scheduleBatch.batchId] ?? 1) - 1) }));
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to remove student from batch.'); }
    finally { setSaving(false); }
  }

  async function openAddStudents(row: BatchRow) {
    setStudentBatch(row); setRegistrationSearch(''); setError(''); setRegistrations([]);
    setSaving(true);
    try {
      const available = await batchStudentApi.getRegistrations(row.batchId);
      setRegistrations(available.map((item) => ({
        ...item,
        registrationId: Number(read(item, 'registration_id', 'registrationId', 'student_registration_id', 'id') ?? 0),
        studentName: String(read(item, 'student_name', 'studentName', 'candidateName', 'firstName', 'first_name') ?? 'Student'),
        selected: false,
      })).filter((item) => item.registrationId > 0));
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
      const successes = outcomes.filter((item) => item.status === 'fulfilled').length;
      if (successes !== selected.length) setError(`${successes} of ${selected.length} students added. Some requests failed; check eligible list and retry.`);
      else setSuccess(`${successes} students added to ${studentBatch.batchName}.`);
      setStudentBatch(null); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to add students.'); }
    finally { setSaving(false); }
  }

  async function openAttendance(row: BatchRow) {
    setAttendanceBatch(row); setAttendanceDate(new Date().toISOString().slice(0, 10)); setAttendanceScheduleId(0); setAttendanceStudents([]);
    setError(''); setSaving(true);
    try {
      const [scheduleRows, students] = await Promise.all([batchScheduleApi.getByBatch(row.batchId), batchStudentApi.getByBatch(row.batchId)]);
      setSchedules(scheduleRows);
      setAttendanceScheduleId(Number(read(scheduleRows[0] ?? {}, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0));
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
    try { await batchScheduleApi.update(editingScheduleId, scheduleEdit); setEditingScheduleId(0); if (scheduleBatch) await viewSchedule(scheduleBatch); }
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

  return <section className="batch-page">
    <header className="batch-header"><div><div className="batch-eyebrow">GROUP LEADER / BATCH MANAGEMENT</div><h1>Batch Management</h1><p>Manage active batches, students and class schedules.</p></div>
      <div className="batch-header-actions"><button className="batch-secondary" type="button" onClick={() => void load()} disabled={loading}>↻ Refresh</button><button className="batch-primary" type="button" onClick={openCreate}>＋ New Batch</button></div>
    </header>
    {error && <div className="batch-error" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    {success && <div className="batch-success" role="status">{success}</div>}
    {scheduleBatch ? <section className="batch-table-card">
      <div className="batch-table-heading"><div><button className="batch-secondary" type="button" onClick={() => setScheduleBatch(null)}>← Back to Batches</button><h2>Schedule — {scheduleBatch.batchName}</h2></div><button className="batch-primary" type="button" disabled={saving} onClick={() => void generateSchedule(scheduleBatch)}>Generate Schedule</button></div>
      <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Content / Topic</th><th>Expected Date</th><th>Expected Day</th><th>Actual Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {schedules.map((row, index) => <tr key={String(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? index)}><td>{index + 1}</td><td>{String(read(row, 'content_name', 'contentName', 'topic_name') ?? '—')}</td><td>{formatDate(read(row, 'expected_date', 'expectedDate'))}</td><td>{String(read(row, 'expected_day', 'expectedDay') ?? '—')}</td><td>{formatDate(read(row, 'actual_date', 'actualDate'))}</td><td>{String(read(row, 'status') ?? '—')}</td><td>{deleted(row) ? <button className="restore" type="button" disabled={saving} onClick={() => void restoreSchedule(row)}>Restore</button> : <><button type="button" disabled={saving} onClick={() => void editSchedule(row)}>Edit</button><button className="remove" type="button" disabled={saving} onClick={() => void removeSchedule(row)}>Delete</button></>}</td></tr>)}
        {!schedules.length && <tr><td colSpan={7} className="batch-empty">No schedule entries found.</td></tr>}
      </tbody></table></div>
      {editingScheduleId > 0 && <form onSubmit={submitScheduleEdit} className="batch-modal" style={{ margin: 16 }}><h3>Update Schedule</h3><label>Actual Date<input type="date" value={String(scheduleEdit.actual_date ?? '')} onChange={(e) => setScheduleEdit({ ...scheduleEdit, actual_date: e.target.value ? localMidnightIso(e.target.value) : null })}/></label><label>Status<input value={String(scheduleEdit.status ?? '')} onChange={(e) => setScheduleEdit({ ...scheduleEdit, status: e.target.value })}/></label><footer><button type="button" className="batch-secondary" onClick={() => setEditingScheduleId(0)}>Cancel</button><button type="submit" className="batch-primary" disabled={saving}>Update</button></footer></form>}
      <div className="batch-table-heading"><div><h2>Assigned Students</h2><p>Students currently assigned to this batch</p></div><span className="batch-count">{roster.length} students</span></div>
      <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Student</th><th>Registration ID</th><th>Action</th></tr></thead><tbody>{roster.map((student, index) => <tr key={student.batchStudentId}><td>{index + 1}</td><td>{student.studentName}</td><td>{student.registrationId}</td><td><button className="remove" type="button" disabled={saving} onClick={() => void removeStudent(student)}>Remove</button></td></tr>)}{!roster.length && <tr><td colSpan={4} className="batch-empty">No students assigned.</td></tr>}</tbody></table></div>
    </section> : <>
      <div className="batch-tabs"><button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Batches <span>{active.length}</span></button><button type="button" className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>Deleted Batches <span>{removed.length}</span></button></div>
      <section className="batch-table-card"><div className="batch-table-heading"><div><h2>{tab === 'active' ? 'Active Batches' : 'Deleted Batches'}</h2><p>Batch overview and quick actions</p></div><span className="batch-count">{displayed.length} records</span></div>
        <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Batch Name</th><th>Topic Name</th><th>Trainer Name</th><th>Start Date</th><th>End Date</th><th>Batch Time</th><th># Students</th><th>Action</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={9} className="batch-empty">Loading batches...</td></tr> : displayed.map((row, i) => <tr key={row.batchId}><td>{i + 1}</td><td><strong>{row.batchName}</strong><small>ID: {row.batchId}</small></td><td>{String(read(row, 'topic_name', 'topicName') ?? `Topic #${read(row, 'topic_id', 'topicId') ?? '—'}`)}</td><td>{String(read(row, 'employee_name', 'employeeName') ?? `Employee #${read(row, 'employee_id', 'employeeId') ?? '—'}`)}</td><td>{formatDate(read(row, 'start_date', 'startDate'))}</td><td>{formatDate(read(row, 'end_date', 'endDate'))}</td><td>{String(read(row, 'batch_time', 'batchTime') ?? '—')}</td><td><span className="batch-student-count">{counts[row.batchId] ?? '—'}</span></td><td><div className="batch-actions">{tab === 'active' ? <><div><button type="button" disabled={saving} onClick={() => void viewSchedule(row)}>View Schedule</button><button type="button" disabled={saving} onClick={() => void openAddStudents(row)}>Add Students</button><button type="button" disabled={saving} onClick={() => void openAttendance(row)}>Attendance</button><button type="button" disabled={saving} onClick={() => void generateSchedule(row)}>Generate Schedule</button><button type="button" disabled={saving} onClick={() => void openEdit(row)}>Edit</button></div><button className="remove" type="button" disabled={saving} onClick={() => void removeBatch(row)}>Remove</button></> : <button className="restore" type="button" disabled={saving} onClick={() => void restoreBatch(row)}>Restore</button>}</div></td></tr>)}
          {!loading && !displayed.length && <tr><td colSpan={9} className="batch-empty">{tab === 'active' ? 'No active batches found.' : 'No deleted batches found.'}</td></tr>}
        </tbody></table></div>
      </section>
    </>}
    {showCreate && <div className="batch-modal-backdrop"><section className="batch-modal" role="dialog" aria-modal="true"><header><h2>{editingBatchId ? 'Edit Batch' : 'New Batch'}</h2><button type="button" disabled={saving} onClick={() => setShowCreate(false)}>×</button></header><form onSubmit={submitBatch}><div className="batch-form-grid">
      <label>Batch Name *<input required value={form.batch_name} onChange={(e) => setForm({ ...form, batch_name: e.target.value })}/></label>
      <label>Topic *<select required value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: Number(e.target.value) })}><option value={0}>Select Topic</option>{topics.map((item) => { const topicId = Number(read(item, 'topic_id', 'topicId', 'id') ?? 0); return <option key={topicId} value={topicId}>{String(read(item, 'topic_name', 'topicName', 'name') ?? 'Topic')}</option>; })}</select></label>
      <label>Trainer *<select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}><option value={0}>Select Trainer</option>{employees.map((item) => { const employeeId = Number(read(item, 'employee_id', 'employeeId', 'id') ?? 0); return <option key={employeeId} value={employeeId}>{String(read(item, 'employee_name', 'employeeName', 'name') ?? 'Employee')}</option>; })}</select></label>
      <label>Branch *<select required value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: Number(e.target.value) })}><option value={0}>Select Branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Start Date *<input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}/></label><label>End Date *<input type="date" min={form.start_date || undefined} required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}/></label>
      <label>Start Time *<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)}/></label><label>End Time *<input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)}/></label>
      <label>Playlist Title<input value={form.playlist_title} onChange={(e) => setForm({ ...form, playlist_title: e.target.value })}/></label><label>Playlist Key<input value={form.playlist_key} onChange={(e) => setForm({ ...form, playlist_key: e.target.value })}/></label>
    </div><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingBatchId ? 'Update Batch' : 'Create Batch'}</button></footer></form></section></div>}
    {studentBatch && <div className="batch-modal-backdrop"><section className="batch-modal batch-modal-small" role="dialog" aria-modal="true"><header><h2>Add Students — {studentBatch.batchName}</h2><button type="button" disabled={saving} onClick={() => setStudentBatch(null)}>×</button></header><form onSubmit={addSelectedStudents}><input aria-label="Search eligible students" placeholder="Search name, registration, email or mobile" value={registrationSearch} onChange={(e) => setRegistrationSearch(e.target.value)}/><div className="batch-student-selection" style={{ maxHeight: 360, overflow: 'auto', margin: '12px 0' }}><label><input type="checkbox" checked={filteredRegistrations.length > 0 && filteredRegistrations.every((item) => item.selected)} onChange={(e) => setRegistrations((previous) => previous.map((item) => filteredRegistrations.some((filtered) => filtered.registrationId === item.registrationId) ? { ...item, selected: e.target.checked } : item))}/> Select all visible ({filteredRegistrations.length})</label>{filteredRegistrations.map((item) => <label key={item.registrationId} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={item.selected} onChange={(e) => setRegistrations((previous) => previous.map((entry) => entry.registrationId === item.registrationId ? { ...entry, selected: e.target.checked } : entry))}/> {item.studentName} — Reg #{item.registrationId} {String(read(item, 'courseName', 'course_name') ?? '')}</label>)}{!filteredRegistrations.length && <p>No eligible registrations found.</p>}</div><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setStudentBatch(null)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : `Add Selected (${registrations.filter((item) => item.selected).length})`}</button></footer></form></section></div>}
    {attendanceBatch && <div className="batch-modal-backdrop"><section className="batch-modal" role="dialog" aria-modal="true"><header><h2>Attendance — {attendanceBatch.batchName}</h2><button type="button" disabled={saving} onClick={() => setAttendanceBatch(null)}>×</button></header><form onSubmit={saveAttendance}><label>Schedule *<select required value={attendanceScheduleId} onChange={(e) => setAttendanceScheduleId(Number(e.target.value))}><option value={0}>Select Schedule</option>{schedules.filter((item) => !deleted(item)).map((item) => { const sid = Number(read(item, 'batch_schedule_id', 'batchScheduleId', 'id') ?? 0); return <option key={sid} value={sid}>{String(read(item, 'content_name', 'contentName', 'topic_name') ?? 'Content')} — {formatDate(read(item, 'expected_date', 'expectedDate'))}</option>; })}</select></label><label>Attendance Date *<input type="date" required value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}/></label><div style={{ maxHeight: 320, overflow: 'auto', margin: '12px 0' }}>{attendanceStudents.map((student) => <label key={student.registrationId} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={student.isPresent} onChange={(e) => setAttendanceStudents((previous) => previous.map((item) => item.registrationId === student.registrationId ? { ...item, isPresent: e.target.checked } : item))}/> {student.studentName} (Registration #{student.registrationId})</label>)}</div><footer><button className="batch-secondary" type="button" disabled={saving} onClick={() => setAttendanceBatch(null)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Attendance'}</button></footer></form></section></div>}
  </section>;
}
