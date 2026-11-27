import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { batchApi, batchDirectoryApi, batchScheduleApi, batchScheduleAttendanceApi, batchStudentApi } from '@/api/batchApi';
import { getAllUsers } from '@/api/userApi';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import { apiErrorMessage } from '@/core/http/errors';
import { PERMISSIONS, permissionService } from '@/core/services/permissionService';
import './Trainer.css';
import './TrainerPortal.css';

type Row = Record<string, unknown>;
type Result = { status: 'loading' | 'ready' | 'error'; rows: Row[]; error: string };
type Trainer = { employeeId: number; name: string; profile: Row };
type PortalContext = {
  portalTrainerId: number;
  setPortalTrainerId: (id: number) => void;
  setPortalTrainers: (trainers: { employeeId: number; name: string }[]) => void;
};

const pending = (): Result => ({ status: 'loading', rows: [], error: '' });
const read = (row: Row | undefined, ...keys: string[]) =>
  keys.map(key => row?.[key]).find(value => value !== undefined && value !== null && value !== '');
const text = (row: Row | undefined, ...keys: string[]) => {
  const value = read(row, ...keys);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};
const positive = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const employeeId = (row: Row) => positive(read(row, 'employee_id', 'employeeId', 'EmployeeId'));
const directoryId = (row: Row) => employeeId(row) || positive(read(row, 'id'));
const batchId = (row: Row) => positive(read(row, 'batch_id', 'batchId', 'BatchId', 'id'));
const scheduleId = (row: Row) => positive(read(row, 'batch_schedule_id', 'batchScheduleId', 'id'));
const batchName = (row: Row) => text(row, 'batch_name', 'batchName', 'name') || 'Unnamed batch';
const employeeName = (row: Row) => text(row, 'employee_name', 'employeeName', 'employee_Name', 'name');
const employeeCode = (row: Row) => text(row, 'employeeCode', 'employee_Code', 'employee_code');
const normalized = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
function isTrainer(row: Row) {
  const roles = Array.isArray(row.roles) ? row.roles : [];
  return [read(row, 'roleName', 'role_name', 'role'), ...roles].some(role => {
    const name = typeof role === 'object' && role !== null
      ? text(role as Row, 'roleName', 'name') : typeof role === 'string' ? role : '';
    return normalized(name) === 'trainer';
  });
}
function removed(row: Row) {
  const marker = read(row, 'is_deleted', 'isDeleted', 'deleted');
  return Boolean(read(row, 'deletedAt', 'deleted_at'))
    || marker === true || marker === 1 || marker === '1' || marker === 'true'
    || read(row, 'is_active', 'isActive') === false;
}
function dateLabel(value: string) {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return iso ? iso[0] : value || 'Not available';
}
function uniqueRows(rows: Row[], idOf: (row: Row) => number) {
  const seen = new Set<number>();
  return rows.filter(row => {
    const id = idOf(row);
    if (!id || seen.has(id) || removed(row)) return false;
    seen.add(id);
    return true;
  });
}
function fetchRows(request: Promise<Row[]>, fallback: string): Promise<Result> {
  return request.then(rows => ({ status: 'ready', rows, error: '' }),
    error => ({ status: 'error', rows: [], error: apiErrorMessage(error, fallback) }));
}
function statusText(result: Result, empty: string) {
  return result.status === 'loading' ? 'Loading…' : result.status === 'error' ? result.error : empty;
}

function BatchDetails({ batch, attendanceAllowed }: { batch: Row; attendanceAllowed: boolean }) {
  const id = batchId(batch);
  const [roster, setRoster] = useState<Result>(pending);
  const [schedules, setSchedules] = useState<Result>(pending);
  const [sessions, setSessions] = useState<Result>(pending);
  useEffect(() => {
    let active = true;
    setRoster(pending());
    setSchedules(pending());
    setSessions(pending());
    void fetchRows(batchStudentApi.getByBatch(id), 'Unable to load the batch roster.')
      .then(result => { if (active) setRoster(result); });
    const scheduleRequest = fetchRows(batchScheduleApi.getByBatch(id), 'Unable to load batch schedules.');
    void scheduleRequest.then(result => { if (active) setSchedules(result); });
    if (attendanceAllowed) {
      // Use the existing staff-management read endpoint, never the trainer's identity.
      void scheduleRequest.then(async result => {
        if (!active) return;
        if (result.status !== 'ready') {
          setSessions({ status: 'error', rows: [], error: 'Attendance is unavailable without the batch schedules.' });
          return;
        }
        if (!result.rows.length) {
          setSessions({ status: 'ready', rows: [], error: '' });
          return;
        }
        const ids = new Set(result.rows.filter(row => !removed(row)).map(scheduleId).filter(Boolean));
        if (result.rows.some(row => !removed(row) && !scheduleId(row))) {
          setSessions({ status: 'error', rows: [], error: 'Attendance cannot be matched reliably: schedule IDs are missing.' });
          return;
        }
        const response = await fetchRows(batchScheduleAttendanceApi.getAll(), 'Unable to load attendance sessions.');
        if (!active) return;
        setSessions({ ...response, rows: response.rows.filter(row => !removed(row) &&
          ids.has(positive(read(row, 'batch_schedule_id', 'batchScheduleId')))) });
      });
    }
    return () => { active = false; };
  }, [id, attendanceAllowed]);
  const students = roster.rows.filter(row => !removed(row));
  const classes = schedules.rows.filter(row => !removed(row));
  return <div className="tp-detail-grid">
    <section className="tp-card">
      <h3>Assigned students {roster.status === 'ready' && <small>({students.length})</small>}</h3>
      {students.length ? <div className="tp-scroll" tabIndex={0} role="region" aria-label="Assigned students">
        {students.map((row, index) => <div className="tp-record" key={index}>
          <strong>{text(row, 'student_name', 'studentName', 'candidateName', 'name') || 'Student name unavailable'}</strong>
          <small>Registration ID: {text(row, 'registration_id', 'registrationId', 'registration_Id') || 'Not available'}</small>
        </div>)}
      </div> : <p className="tp-message" role="status">{statusText(roster, 'No students assigned to this batch.')}</p>}
    </section>
    <section className="tp-card">
      <h3>Batch schedule {schedules.status === 'ready' && <small>({classes.length})</small>}</h3>
      {classes.length ? <div className="tp-scroll" tabIndex={0} role="region" aria-label="Batch schedule">
        {classes.map((row, index) => <div className="tp-record" key={index}>
          <strong>{text(row, 'content_name', 'contentName', 'topic_name', 'topicName') || 'Topic not available'}</strong>
          <small>Expected: {dateLabel(text(row, 'expected_date', 'expectedDate'))}</small>
          <small>Actual: {dateLabel(text(row, 'actual_date', 'actualDate'))} · {text(row, 'status') || 'Status not available'}</small>
        </div>)}
      </div> : <p className="tp-message" role="status">{statusText(schedules, 'No schedule entries available.')}</p>}
    </section>
    {attendanceAllowed && <section className="tp-card tp-wide">
      <h3>Attendance sessions {sessions.status === 'ready' && <small>({sessions.rows.length})</small>}</h3>
      {sessions.rows.length ? <div className="tp-scroll" tabIndex={0} role="region" aria-label="Recorded attendance sessions">
        {sessions.rows.map((row, index) => <div className="tp-record" key={index}>
          <strong>{dateLabel(text(row, 'attendance_date', 'attendanceDate'))}</strong>
          <small>Schedule ID: {text(row, 'batch_schedule_id', 'batchScheduleId') || 'Not available'}</small>
        </div>)}
      </div> : <p className="tp-message" role="status">{statusText(sessions, 'No attendance sessions recorded for this batch.')}</p>}
      <p className="tp-note">Read-only session history. No attendance changes are made here.</p>
    </section>}
  </div>;
}

function TrainerOverview({ trainer, batches, batchResult, attendanceAllowed }: {
  trainer: Trainer; batches: Row[]; batchResult: Result; attendanceAllowed: boolean;
}) {
  const [selectedBatch, setSelectedBatch] = useState(0);
  const batch = batches.find(row => batchId(row) === selectedBatch) ?? batches[0];
  const initials = trainer.name.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
  const fields = [
    ['Employee code', employeeCode(trainer.profile)],
    ['Email', text(trainer.profile, 'emailAddress', 'email_address', 'email_Address')],
    ['Mobile', text(trainer.profile, 'mobileNumber', 'mobile_number', 'mobile_Number')],
    ['Branch', text(trainer.profile, 'branchName', 'branch_name', 'branch_Name')],
  ];
  const counts = batches.map(row => {
    const raw = read(row, 'studentCount', 'student_count', 'totalStudents');
    const count = Number(raw);
    return raw !== undefined && Number.isSafeInteger(count) && count >= 0 ? count : null;
  });
  const totalAssignments = batchResult.status === 'ready' && counts.every(count => count !== null)
    ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) : null;
  return <>
    <section className="tp-card tp-identity">
      <span className="tp-avatar" aria-hidden="true">{initials || 'T'}</span>
      <div><span className="tp-note">TRAINER PROFILE</span><h2>{trainer.name}</h2>
        <p>{employeeCode(trainer.profile) || 'Employee ID: ' + trainer.employeeId} · {text(trainer.profile, 'branchName', 'branch_name') || 'Branch not available'}</p></div>
    </section>
    <div className="tp-metrics">
      <section className="tp-card"><span>Assigned batches</span><strong>{batchResult.status === 'ready' ? batches.length : '—'}</strong></section>
      <section className="tp-card"><span>Student assignments</span><strong>{totalAssignments ?? '—'}</strong><small>Across assigned batches; not unique students</small></section>
    </div>
    <div className="tp-detail-grid">
      <section className="tp-card"><h3>Personal information</h3>
        <dl className="tp-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not available'}</dd></div>)}</dl>
      </section>
      <section className="tp-card"><h3>Assigned batches</h3>
        {batches.length ? <div className="tp-scroll" tabIndex={0} role="region" aria-label="Assigned batches">
          {batches.map(row => <div className="tp-record" key={batchId(row)}>
            <strong>{batchName(row)}</strong>
            <small>{text(row, 'courseName', 'course_name', 'topic_name', 'topicName') || 'Course not available'} · {text(row, 'batch_time', 'batchTime') || 'Time not available'}</small>
            <small>{dateLabel(text(row, 'start_date', 'startDate'))} — {dateLabel(text(row, 'end_date', 'endDate'))}</small>
          </div>)}
        </div> : <p className="tp-message" role="status">{statusText(batchResult, 'No batches assigned to this trainer.')}</p>}
      </section>
    </div>
    {batch && <>
      <section className="tp-card tp-batch-picker">
        <label htmlFor="tp-batch">View batch details</label>
        <select id="tp-batch" value={batchId(batch)} onChange={event => setSelectedBatch(Number(event.target.value))}>
          {batches.map(row => <option key={batchId(row)} value={batchId(row)}>{batchName(row)}</option>)}
        </select>
      </section>
      <BatchDetails key={batchId(batch)} batch={batch} attendanceAllowed={attendanceAllowed} />
    </>}
  </>;
}

export default function TrainerPortal() {
  const session = useSession();
  usePermissionVersion();
  const canReadUsers = permissionService.hasPermission(PERMISSIONS.USER_VIEW);
  const attendanceAllowed = permissionService.hasPermission(PERMISSIONS.TRAINER_ATTENDANCE_VIEW);
  const { portalTrainerId, setPortalTrainerId, setPortalTrainers } = useOutletContext<PortalContext>();
  const [directory, setDirectory] = useState<Result>(pending);
  const [batchResult, setBatchResult] = useState<Result>(pending);
  const [users, setUsers] = useState<Result>(pending);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setDirectory(pending()); setBatchResult(pending()); setUsers(pending());
    void fetchRows(batchDirectoryApi.getEmployees(), 'Unable to load the trainer directory.')
      .then(result => { if (active) setDirectory(result); });
    void fetchRows(batchApi.getAll(), 'Unable to load assigned batches.')
      .then(result => { if (active) setBatchResult(result); });
    if (canReadUsers) {
      void fetchRows(getAllUsers().then(rows => rows.map(row => row as unknown as Row)), 'Employee profile details are unavailable.')
        .then(result => { if (active) setUsers(result); });
    } else {
      setUsers({ status: 'ready', rows: [], error: '' });
    }
    return () => { active = false; };
  }, [session.generation, canReadUsers, refresh]);

  const batches = useMemo(() => uniqueRows(batchResult.rows, batchId), [batchResult.rows]);
  const trainers = useMemo(() => {
    const byId = new Map<number, Trainer>();
    const assignedIds = new Set(batches.map(employeeId).filter(Boolean));
    for (const row of directory.rows) {
      const id = directoryId(row);
      if (!id || removed(row)) continue;
      const code = employeeCode(row);
      const matches = users.rows.filter(user => employeeId(user) === id ||
        (!employeeId(user) && !!code && employeeCode(user).toLowerCase() === code.toLowerCase()));
      const user = matches.length === 1 ? matches[0] : undefined;
      if (!assignedIds.has(id) && !isTrainer(row) && !(user && isTrainer(user))) continue;
      byId.set(id, { employeeId: id, name: employeeName(row) || (user && employeeName(user)) || 'Trainer #' + id,
        profile: { ...row, ...user } });
    }
    for (const user of users.rows) {
      const id = employeeId(user);
      if (id && isTrainer(user) && !removed(user) && !byId.has(id)) {
        byId.set(id, { employeeId: id, name: employeeName(user) || 'Trainer #' + id, profile: user });
      }
    }
    for (const row of batches) {
      const id = employeeId(row);
      if (id && !byId.has(id)) {
        const name = text(row, 'employee_name', 'employeeName', 'trainerName') || 'Trainer #' + id;
        byId.set(id, { employeeId: id, name, profile: {} });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.employeeId - b.employeeId);
  }, [directory.rows, users.rows, batches]);

  useEffect(() => {
    setPortalTrainers(trainers.map(trainer => ({
      employeeId: trainer.employeeId, name: trainer.name + ' · ' + (employeeCode(trainer.profile) || trainer.employeeId),
    })));
    return () => setPortalTrainers([]);
  }, [trainers, setPortalTrainers]);
  useEffect(() => () => setPortalTrainerId(0), [setPortalTrainerId]);

  const trainer = trainers.find(item => item.employeeId === portalTrainerId);
  const selectedBatches = batches.filter(row => employeeId(row) === portalTrainerId);
  const loading = directory.status === 'loading' || batchResult.status === 'loading' || users.status === 'loading';
  const errors = [directory.error, batchResult.error, users.error].filter(Boolean);
  const missingOwners = batchResult.status === 'ready' && batchResult.rows.some(row => !removed(row) && !employeeId(row));
  return <main className="trainer-workspace tp-workspace">
    <div className="tp-toolbar"><p className="tp-note">Read-only trainer overview</p>
      <button type="button" className="btn btn-outline-primary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
        <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />Refresh
      </button>
    </div>
    {errors.length > 0 && <div className="alert alert-warning" role="alert">{errors.join(' ')}</div>}
    {missingOwners && <p className="tp-message" role="status">Some batch records lack an employee ID and cannot be attributed to a trainer.</p>}
    {!trainer ? <section className="tp-card tp-empty" role="status">
      <i className="bi bi-person-video3" aria-hidden="true" />
      <h2>{loading ? 'Loading trainers…' : trainers.length ? 'Select a trainer above' : 'No verified trainers available'}</h2>
      <p>{loading ? 'Loading employee and batch information.' : 'Only confirmed trainer roles or employees with a batch assignment can be shown.'}</p>
    </section> : <TrainerOverview key={trainer.employeeId} trainer={trainer} batches={selectedBatches}
      batchResult={batchResult} attendanceAllowed={attendanceAllowed} />}
  </main>;
}
