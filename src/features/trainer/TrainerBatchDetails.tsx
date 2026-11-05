import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { trainerApi } from '@/api/studentApi';
import './Trainer.css';

type Row = Record<string, unknown>;
const val = (row: Row, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '');
const text = (row: Row, ...keys: string[]) => String(val(row, ...keys) ?? '');
const number = (row: Row, ...keys: string[]) => Number(val(row, ...keys) ?? 0);

export default function TrainerBatchDetails() {
  const { batchId: rawId } = useParams();
  const batchId = Number(rawId);
  const [details, setDetails] = useState<Row>({});
  const [students, setStudents] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [attendance, setAttendance] = useState<Row[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Row | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [studentSearch, setStudentSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadBatch() {
    if (!Number.isInteger(batchId) || batchId <= 0) { setError('Invalid batch selected.'); setLoading(false); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const [batch, roster, sessions] = await Promise.all([
        trainerApi.getBatchDetails(batchId),
        trainerApi.getBatchStudents(batchId),
        trainerApi.getBatchSchedules(batchId),
      ]);
      setDetails(batch);
      setStudents(roster.map((row) => ({ ...row, registrationId: number(row, 'registrationId', 'registration_id'), studentName: text(row, 'studentName', 'student_name', 'name') || 'Student' })));
      setSchedules(sessions.map((row) => ({ ...row, batchScheduleId: number(row, 'batchScheduleId', 'batch_schedule_id', 'id'), topicName: text(row, 'topicName', 'topic_name', 'contentName', 'content_name', 'title') || 'Scheduled Topic', expectedDate: text(row, 'expectedDate', 'expected_date'), actualDate: text(row, 'actualDate', 'actual_date'), status: text(row, 'status') })));
    } catch (err) { console.error('Trainer batch details load failed:', err); setError('Unable to load batch information. Check the API request and your session, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadBatch(); }, [batchId]);

  async function openAttendance(schedule: Row) {
    const id = number(schedule, 'batchScheduleId');
    if (!id) return;
    setSelectedSchedule(schedule); setAttendanceLoading(true); setAttendance([]); setError(''); setSuccess('');
    try {
      const rows = await trainerApi.getAttendanceStudents(id);
      setAttendance(rows.map((row) => ({ ...row, registrationId: number(row, 'registrationId', 'registration_id'), studentName: text(row, 'studentName', 'student_name', 'name') || 'Student', isPresent: Boolean(val(row, 'isPresent', 'is_present')) })));
    } catch (err) { console.error('Attendance roster load failed:', err); setError('Unable to load the attendance roster.'); }
    finally { setAttendanceLoading(false); }
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
      setSuccess('Attendance submitted successfully.');
      setSelectedSchedule(null);
      await loadBatch();
    } catch (err) { console.error('Attendance submission failed:', err); setError('Attendance could not be submitted. Please verify the date and try again.'); }
    finally { setSaving(false); }
  }

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return q ? students.filter((student) => `${text(student, 'studentName')} ${text(student, 'registrationId')} ${text(student, 'email')} ${text(student, 'mobileNumber')}`.toLowerCase().includes(q)) : students;
  }, [students, studentSearch]);

  if (loading) return <div className="text-center py-5"><span className="spinner-border me-2" />Loading batch...</div>;
  return <section className="container-fluid py-3 trainer-workspace trainer-batch-details">
    <div className="mb-3"><Link to="/main/trainer" className="text-decoration-none"><i className="bi bi-arrow-left me-1" />Back to batches</Link></div>
    <div className="trainer-page-heading d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"><div><span className="trainer-eyebrow">TRAINING WORKSPACE</span><h2 className="h3 mb-1">{text(details, 'batchName', 'batch_name', 'name') || 'Batch Details'}</h2><p className="text-muted mb-0">{text(details, 'courseName', 'course_name', 'course')}</p></div><button className="btn btn-outline-primary" onClick={() => void loadBatch()}><i className="bi bi-arrow-clockwise me-1" />Refresh</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}{success && <div className="alert alert-success" role="status">{success}</div>}
    <div className="row g-3 mb-3"><div className="col-sm-6 col-lg-3"><div className="card trainer-summary-card"><div className="card-body"><div className="small text-muted">Students</div><div className="fs-3 fw-semibold">{students.length}</div></div></div></div><div className="col-sm-6 col-lg-3"><div className="card"><div className="card-body"><div className="small text-muted">Schedules</div><div className="fs-3 fw-semibold">{schedules.length}</div></div></div></div></div>
    <div className="row g-3">
      <div className="col-lg-6"><div className="card trainer-panel-card h-100"><div className="card-header bg-white d-flex justify-content-between align-items-center"><h3 className="h6 mb-0">Students</h3><input className="form-control form-control-sm" style={{maxWidth:220}} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students" /></div><div className="table-responsive"><table className="table table-hover mb-0"><thead className="table-light"><tr><th>Student</th><th>Registration</th><th>Mobile</th></tr></thead><tbody>{filteredStudents.map((student, index) => <tr key={number(student, 'registrationId') || index}><td>{text(student, 'studentName')}</td><td>{text(student, 'registrationId') || '—'}</td><td>{text(student, 'mobileNumber', 'mobile_number') || '—'}</td></tr>)}{!filteredStudents.length && <tr><td colSpan={3} className="text-center text-muted py-4">No students found.</td></tr>}</tbody></table></div></div></div>
      <div className="col-lg-6"><div className="card h-100"><div className="card-header bg-white"><h3 className="h6 mb-0">Batch Schedule</h3></div><div className="list-group list-group-flush">{schedules.map((schedule, index) => <div className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2" key={number(schedule, 'batchScheduleId') || index}><div><div className="fw-semibold">{text(schedule, 'topicName')}</div><small className="text-muted">{text(schedule, 'expectedDate') || 'Date not set'} · {text(schedule, 'status') || 'Pending'}</small></div><button className="btn btn-sm btn-outline-primary" onClick={() => void openAttendance(schedule)}>Attendance</button></div>)}{!schedules.length && <div className="text-center text-muted py-4">No schedules found.</div>}</div></div></div>
    </div>
    {selectedSchedule && <div className="card trainer-attendance-panel mt-3"><div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2"><h3 className="h6 mb-0">Attendance · {text(selectedSchedule, 'topicName')}</h3><button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedSchedule(null)}>Close</button></div><div className="card-body">
      <div className="row g-2 mb-3"><div className="col-sm-4"><label className="form-label" htmlFor="attendanceDate">Attendance date</label><input id="attendanceDate" className="form-control" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></div></div>
      {attendanceLoading ? <div className="text-muted">Loading attendance roster...</div> : <><div className="table-responsive"><table className="table align-middle"><thead><tr><th>Student</th><th>Registration</th><th>Present</th></tr></thead><tbody>{attendance.map((student, index) => <tr key={number(student, 'registrationId') || index}><td>{text(student, 'studentName')}</td><td>{number(student, 'registrationId')}</td><td><input type="checkbox" className="form-check-input" checked={Boolean(student.isPresent)} onChange={(event) => setAttendance((rows) => rows.map((row, i) => i === index ? {...row, isPresent:event.target.checked} : row))} aria-label={`Mark ${text(student, 'studentName')} present`} /></td></tr>)}</tbody></table></div><button className="btn btn-primary" disabled={saving || !attendance.length} onClick={() => void saveAttendance()}>{saving ? 'Saving...' : 'Submit Attendance'}</button></>}
    </div></div>}
  </section>;
}
