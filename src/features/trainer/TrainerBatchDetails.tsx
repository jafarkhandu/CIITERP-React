import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { trainerApi } from '@/api/studentApi';
import { TablePagination, useTablePage } from '@/components/TablePagination';
import { emailAddressFrom, sendUniqueAutomaticEmails } from '@/core/notifications/automaticEmail';
import './Trainer.css';

type Row = Record<string, unknown>;
const val = (row: Row, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '');
const text = (row: Row, ...keys: string[]) => String(val(row, ...keys) ?? '');
const number = (row: Row, ...keys: string[]) => Number(val(row, ...keys) ?? 0);
const initialPending = { details: true, students: true, schedules: true };
type BatchSource = keyof typeof initialPending;

export default function TrainerBatchDetails() {
  const { batchId: rawId } = useParams();
  return <TrainerBatch key={rawId} batchId={Number(rawId)} />;
}

function TrainerBatch({ batchId }: { batchId: number }) {
  const [details, setDetails] = useState<Row>({});
  const [students, setStudents] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [attendance, setAttendance] = useState<Row[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Row | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [studentSearch, setStudentSearch] = useState('');
  const [pending, setPending] = useState(initialPending);
  const [failedSources, setFailedSources] = useState<BatchSource[]>([]);
  const loadVersion = useRef(0);
  const attendanceVersion = useRef(0);
  const rosterRequest = useRef<Promise<Row[]> | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadBatch() {
    if (!Number.isInteger(batchId) || batchId <= 0) {
      setError('Invalid batch selected.');
      setPending({ details: false, students: false, schedules: false });
      return;
    }

    const version = ++loadVersion.current;
    setPending(initialPending); setFailedSources([]); setError('');
    const roster = trainerApi.getBatchStudents(batchId);
    rosterRequest.current = roster;

    async function load<T>(source: BatchSource, request: Promise<T>, update: (data: T) => void) {
      try {
        const data = await request;
        if (version === loadVersion.current) update(data);
      } catch (err) {
        if (version !== loadVersion.current) return;
        console.error(`Trainer batch ${source} load failed:`, err);
        setFailedSources(previous => [...previous, source]);
      } finally {
        if (version === loadVersion.current) setPending(previous => ({ ...previous, [source]: false }));
      }
    }

    await Promise.all([
      load('details', trainerApi.getBatchDetails(batchId), setDetails),
      load('students', roster, (rows) => setStudents(rows.map((row) => ({ ...row, registrationId: number(row, 'registrationId', 'registration_id'), studentName: text(row, 'studentName', 'student_name', 'name') || 'Student' })))),
      load('schedules', trainerApi.getBatchSchedules(batchId), (rows) => setSchedules(rows.map((row) => ({ ...row, batchScheduleId: number(row, 'batchScheduleId', 'batch_schedule_id', 'id'), topicName: text(row, 'topicName', 'topic_name', 'contentName', 'content_name', 'title') || 'Scheduled Topic', expectedDate: text(row, 'expectedDate', 'expected_date'), actualDate: text(row, 'actualDate', 'actual_date'), status: text(row, 'status') })))),
    ]);
  }
  useEffect(() => {
    void loadBatch();
    return () => { loadVersion.current += 1; attendanceVersion.current += 1; };
  }, [batchId]);

  async function openAttendance(schedule: Row) {
    const id = number(schedule, 'batchScheduleId');
    if (!id) return;
    const version = ++attendanceVersion.current;
    setSelectedSchedule(schedule); setAttendanceLoading(true); setAttendance([]); setError(''); setSuccess('');
    try {
      const rows = await trainerApi.getAttendanceStudents(id);
      if (version === attendanceVersion.current) setAttendance(rows.map((row) => ({ ...row, registrationId: number(row, 'registrationId', 'registration_id'), studentName: text(row, 'studentName', 'student_name', 'name') || 'Student', isPresent: Boolean(val(row, 'isPresent', 'is_present')) })));
    } catch (err) {
      if (version === attendanceVersion.current) {
        console.error('Attendance roster load failed:', err);
        setError('Unable to load the attendance roster.');
      }
    } finally {
      if (version === attendanceVersion.current) setAttendanceLoading(false);
    }
  }

  function closeAttendance() {
    attendanceVersion.current += 1;
    setSelectedSchedule(null);
  }

  async function saveAttendance() {
    if (!selectedSchedule) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await trainerApi.submitAttendance({
        batchScheduleId: number(selectedSchedule, 'batchScheduleId'),
        attendanceDate,
        students: attendance.map((student) => ({ registrationId: number(student, 'registrationId'), isPresent: Boolean(student.isPresent) })),
      });
      const absent = attendance.filter((student) => !student.isPresent);
      const sendAttendanceEmails = (roster: Row[]) => {
        const emailsByRegistration = new Map<number, string>();
        for (const student of roster) {
          const registrationId = number(student, 'registrationId', 'registration_id');
          if (registrationId > 0 && !emailsByRegistration.has(registrationId)) emailsByRegistration.set(registrationId, emailAddressFrom(student));
        }
        sendUniqueAutomaticEmails(
          absent.map((student) => emailAddressFrom(student) || emailsByRegistration.get(number(student, 'registrationId')) || ''),
          'CIIT attendance notification',
          `Your attendance for ${text(selectedSchedule, 'topicName', 'topic_name') || 'your scheduled training'} on ${attendanceDate} was marked absent. Please contact CIIT Training Institute if you believe this is incorrect.`,
        );
      };
      if (absent.some((student) => !emailAddressFrom(student)) && rosterRequest.current) {
        void rosterRequest.current.then(sendAttendanceEmails, () => sendAttendanceEmails(students));
      } else if (absent.length) {
        sendAttendanceEmails([]);
      }
      setSuccess('Attendance submitted successfully.');
      closeAttendance();
      await loadBatch();
    } catch (err) { console.error('Attendance submission failed:', err); setError('Attendance could not be submitted. Please verify the date and try again.'); }
    finally { setSaving(false); }
  }

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return q ? students.filter((student) => `${text(student, 'studentName')} ${text(student, 'registrationId')} ${text(student, 'email')} ${text(student, 'mobileNumber')}`.toLowerCase().includes(q)) : students;
  }, [students, studentSearch]);
  const studentPage = useTablePage(filteredStudents, studentSearch);
  const schedulePage = useTablePage(schedules);
  const loading = Object.values(pending).some(Boolean);
  const studentsFailed = failedSources.includes('students');
  const schedulesFailed = failedSources.includes('schedules');

  return <section className="container-fluid py-3 trainer-workspace trainer-batch-details">
    <div className="mb-3"><Link to="/main/trainer" className="text-decoration-none"><i className="bi bi-arrow-left me-1" />Back to batches</Link></div>
    <div className="trainer-page-heading d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"><div><span className="trainer-eyebrow">TRAINING WORKSPACE</span><h2 className="h3 mb-1">{text(details, 'batchName', 'batch_name', 'name') || 'Batch Details'}</h2><p className="text-muted mb-0">{text(details, 'courseName', 'course_name', 'course')}</p></div><button className="btn btn-outline-primary" disabled={loading || saving} onClick={() => { setSuccess(''); void loadBatch(); }}><i className="bi bi-arrow-clockwise me-1" />Refresh</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}{success && <div className="alert alert-success" role="status">{success}</div>}
    {failedSources.length > 0 && <div className="alert alert-warning" role="status">Could not load batch {failedSources.join(', ')}. Refresh to retry.</div>}
    <div className="row g-3 mb-3"><div className="col-sm-6 col-lg-3"><div className="card trainer-summary-card"><div className="card-body"><div className="small text-muted">Students</div><div className="fs-3 fw-semibold">{pending.students ? '…' : studentsFailed ? '—' : students.length}</div></div></div></div><div className="col-sm-6 col-lg-3"><div className="card"><div className="card-body"><div className="small text-muted">Schedules</div><div className="fs-3 fw-semibold">{pending.schedules ? '…' : schedulesFailed ? '—' : schedules.length}</div></div></div></div></div>
    <div className="row g-3">
      <div className="col-lg-6"><div className="card trainer-panel-card h-100" aria-busy={pending.students}><div className="card-header bg-white d-flex justify-content-between align-items-center"><h3 className="h6 mb-0">Students</h3><input className="form-control form-control-sm" style={{maxWidth:220}} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students" /></div><div className="table-responsive"><table className="table table-hover mb-0"><thead className="table-light"><tr><th>Student</th><th>Registration</th><th>Mobile</th></tr></thead><tbody>
        {!pending.students && !studentsFailed && studentPage.pageRows.map((student, index) => <tr key={number(student, 'registrationId') || index}><td>{text(student, 'studentName')}</td><td>{text(student, 'registrationId') || '—'}</td><td>{text(student, 'mobileNumber', 'mobile_number') || '—'}</td></tr>)}
        {(pending.students || studentsFailed || !filteredStudents.length) && <tr><td colSpan={3} className="text-center text-muted py-4">{pending.students ? 'Loading students…' : studentsFailed ? 'Student roster unavailable.' : 'No students found.'}</td></tr>}
      </tbody></table></div>{!pending.students && !studentsFailed && <TablePagination {...studentPage.pagination} label="students" />}</div></div>
      <div className="col-lg-6"><div className="card h-100" aria-busy={pending.schedules}><div className="card-header bg-white"><h3 className="h6 mb-0">Batch Schedule</h3></div><div className="list-group list-group-flush">
        {!pending.schedules && !schedulesFailed && schedulePage.pageRows.map((schedule, index) => <div className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2" key={number(schedule, 'batchScheduleId') || index}><div><div className="fw-semibold">{text(schedule, 'topicName')}</div><small className="text-muted">{text(schedule, 'expectedDate') || 'Date not set'} · {text(schedule, 'status') || 'Pending'}</small></div><button className="btn btn-sm btn-outline-primary" disabled={saving} onClick={() => void openAttendance(schedule)}>Attendance</button></div>)}
        {(pending.schedules || schedulesFailed || !schedules.length) && <div className="text-center text-muted py-4">{pending.schedules ? 'Loading schedules…' : schedulesFailed ? 'Schedules unavailable.' : 'No schedules found.'}</div>}
      </div>{!pending.schedules && !schedulesFailed && <TablePagination {...schedulePage.pagination} label="schedules" />}</div></div>
    </div>
    {selectedSchedule && <div className="card trainer-attendance-panel mt-3"><div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2"><h3 className="h6 mb-0">Attendance · {text(selectedSchedule, 'topicName')}</h3><button className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={closeAttendance}>Close</button></div><div className="card-body">
      <div className="row g-2 mb-3"><div className="col-sm-4"><label className="form-label" htmlFor="attendanceDate">Attendance date</label><input id="attendanceDate" className="form-control" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></div></div>
      {attendanceLoading ? <div className="text-muted">Loading attendance roster...</div> : <><div className="table-responsive"><table className="table align-middle"><thead><tr><th>Student</th><th>Registration</th><th>Present</th></tr></thead><tbody>{attendance.map((student, index) => <tr key={number(student, 'registrationId') || index}><td>{text(student, 'studentName')}</td><td>{number(student, 'registrationId')}</td><td><input type="checkbox" className="form-check-input" checked={Boolean(student.isPresent)} onChange={(event) => setAttendance((rows) => rows.map((row, i) => i === index ? {...row, isPresent:event.target.checked} : row))} aria-label={`Mark ${text(student, 'studentName')} present`} /></td></tr>)}</tbody></table></div><button className="btn btn-primary" disabled={saving || !attendance.length} onClick={() => void saveAttendance()}>{saving ? 'Saving...' : 'Submit Attendance'}</button></>}
    </div></div>}
  </section>;
}
