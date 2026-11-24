import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useOutletContext } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { studentApi, type StudentRow, type PaymentRow } from '@/api/studentApi';
import { batchApi, batchStudentApi } from '@/api/batchApi';
import './StudentPortal.css';

type Row = Record<string, unknown>;
type SourceStatus = 'loading' | 'ready' | 'error';
const sourceLabels = {
  students: 'students', registrations: 'registrations', payments: 'payments',
  batches: 'batches', assignments: 'batch assignments',
};
type Source = keyof typeof sourceLabels;
const initialStatuses: Record<Source, SourceStatus> = {
  students: 'loading', registrations: 'loading', payments: 'loading', batches: 'loading', assignments: 'loading',
};
const value = (row: Row | undefined, ...keys: string[]) => keys.map(key => row?.[key]).find(v => v !== undefined && v !== null && v !== '');
const label = (v: unknown) => v === undefined || v === null || v === '' ? 'Not available' : String(v);
const id = (row: Row | undefined, ...keys: string[]) => Number(value(row, ...keys) ?? 0);
const batchId = (row: Row) => id(row, 'batchId', 'batch_id', 'BatchId');
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nameOf = (s: StudentRow) => [s.studentName, s.lastName].filter(Boolean).join(' ').trim();
const fields: { title: string; keys: string[] }[] = [
  { title: 'Student ID', keys: ['studentCode', 'studentId'] },
  { title: 'Email address', keys: ['emailAddress'] },
  { title: 'Mobile number', keys: ['mobileNumber'] },
  { title: 'Branch', keys: ['branchName'] },
  { title: 'Qualification', keys: ['qualification'] },
  { title: 'Registration status', keys: ['currentStatus', 'status'] },
];

function combineStatuses(...statuses: SourceStatus[]): SourceStatus {
  if (statuses.includes('loading')) return 'loading';
  return statuses.includes('error') ? 'error' : 'ready';
}

function readTotal(status: SourceStatus, total: number | string): number | string {
  if (status === 'loading') return 'Loading…';
  return status === 'ready' ? total : 'Not available';
}

export default function StudentPortal() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const { portalStudentId: selectedId, setPortalStudents } = useOutletContext<{
    portalStudentId: number;
    setPortalStudents: (students: { studentId: number; name: string }[]) => void;
  }>();
  const [statuses, setStatuses] = useState(initialStatuses);

  useEffect(() => {
    let active = true;
    function load<T>(source: Source, request: Promise<T>, update: (rows: T) => void) {
      void request.then((rows) => {
        if (!active) return;
        update(rows);
        setStatuses(previous => ({ ...previous, [source]: 'ready' }));
      }, () => {
        if (!active) return;
        setStatuses(previous => ({ ...previous, [source]: 'error' }));
      });
    }

    load('students', studentApi.getStudents(), setStudents);
    load('registrations', studentApi.getRegistrations(), setRegistrations);
    load('payments', studentApi.getPayments(), setPayments);
    load('batches', batchApi.getAll(), setBatches);
    load('assignments', batchStudentApi.getAll(), setAssignments);
    return () => { active = false; };
  }, []);

  const studentOptions = useMemo(() => students.map(s => ({ studentId: s.studentId, name: nameOf(s) + ' · ' + (s.studentCode || s.studentId) })).sort((a, b) => a.name.localeCompare(b.name)), [students]);
  useEffect(() => {
    setPortalStudents(studentOptions);
    return () => setPortalStudents([]);
  }, [studentOptions, setPortalStudents]);
  const student = students.find(s => s.studentId === selectedId);
  const myRegistrations = useMemo(() => student
    ? registrations.filter(r => id(r, 'studentId', 'student_Id', 'student_id') === student.studentId)
    : [], [registrations, student]);
  const registrationIds = useMemo(() => new Set(myRegistrations.map(r => id(r, 'registrationId', 'registration_Id', 'registration_id')).filter(Boolean)), [myRegistrations]);
  const myPayments = useMemo(() => student
    ? payments.filter(p => registrationIds.has(Number(p.registrationId)) || (!p.registrationId && Number(p.studentId) === student.studentId))
    : [], [payments, registrationIds, student]);
  const batchesById = useMemo(() => {
    const byId = new Map<number, Row>();
    for (const batch of batches) {
      const id = batchId(batch);
      if (!Number.isNaN(id) && !byId.has(id)) byId.set(id, batch);
    }
    return byId;
  }, [batches]);
  const myBatches = useMemo(() => assignments
    .filter(assignment => registrationIds.has(id(assignment, 'registrationId', 'registration_id', 'registration_Id')))
    .map(assignment => batchesById.get(batchId(assignment)))
    .filter((batch): batch is Row => !!batch), [assignments, batchesById, registrationIds]);
  const paid = myPayments.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);
  const batchStatus = combineStatuses(statuses.registrations, statuses.batches, statuses.assignments);
  const paymentStatus = combineStatuses(statuses.registrations, statuses.payments);
  const partialPayments = statuses.registrations === 'error' && statuses.payments === 'ready' && myPayments.length > 0;
  const errors = (Object.keys(sourceLabels) as Source[]).filter(source => statuses[source] === 'error').map(source => sourceLabels[source]);

  return <main className="ciit-student-portal">
    {statuses.students === 'loading' && <div className="sp-panel" role="status">Loading student records…</div>}
    {!!errors.length && <AutoDismissAlert className="sp-alert" message={`Could not load: ${errors.join(', ')}. Some information may be unavailable. Refresh to retry.`} />}
    {statuses.students === 'ready' && !students.length && <div className="sp-panel">No student records are available for this account.</div>}
    {!!students.length && !student && <div className="sp-panel sp-empty">Select a student above to view their profile, courses, batches and payments.</div>}
    {student && <div className="sp-content">
      <section className="sp-panel sp-hero"><div className="sp-avatar" aria-hidden="true">{nameOf(student).split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()}</div><div><span className="sp-eyebrow">STUDENT PROFILE</span><h2>{nameOf(student)}</h2><p>{label(student.studentCode || student.studentId)} · {label(student.branchName)}</p></div></section>
      <div className="sp-stats">
        <div className="sp-panel"><span>Course registrations</span><strong>{readTotal(statuses.registrations, myRegistrations.length)}</strong></div>
        <div className="sp-panel"><span>Assigned batches</span><strong>{readTotal(batchStatus, myBatches.length)}</strong></div>
        <div className="sp-panel"><span>Recorded payments</span><strong>{readTotal(paymentStatus, myPayments.length)}</strong></div>
        <div className="sp-panel"><span>Total payments</span><strong>{readTotal(paymentStatus, money.format(paid))}</strong></div>
      </div>
      <div className="sp-columns">
        <section className="sp-panel">
          <h2>Personal information</h2>
          <dl className="sp-details">{fields.map(({ title, keys }) => {
            const detail = value(student, ...keys) ?? value(myRegistrations[0], ...keys);
            return <div key={title}><dt>{title}</dt><dd>{detail === undefined && statuses.registrations === 'loading' ? 'Loading…' : label(detail)}</dd></div>;
          })}</dl>
        </section>
        <section className="sp-panel" aria-busy={statuses.registrations === 'loading'}>
          <h2>Courses</h2>
          {myRegistrations.length ? <div className="sp-stack">{myRegistrations.map((r, i) => <article className="sp-entry" key={String(value(r, 'registrationId', 'registration_id') ?? i)}><h3>{label(value(r, 'courseName', 'course_name', 'CourseName'))}</h3><p>Registration: {label(value(r, 'registrationCode', 'registration_code'))}</p><p>Status: {label(value(r, 'currentStatus', 'status'))}</p></article>)}</div> : (
            <p className="sp-muted">{readTotal(statuses.registrations, 'No course registration found.')}</p>
          )}
        </section>
        <section className="sp-panel sp-staff-record-panel" aria-busy={batchStatus === 'loading'}>
          <h2>Batches</h2>
          {batchStatus === 'ready' && myBatches.length ? <div className="sp-stack sp-staff-batch-list" role="region" aria-label="Assigned batch records" tabIndex={0}>{myBatches.map((b, i) => <article className="sp-entry" key={String(id(b, 'batchId', 'batch_id') || i)}><h3>{label(value(b, 'batchName', 'batch_name'))}</h3><p>Time: {label(value(b, 'batchTime', 'batch_time'))}</p><p>Start: {label(value(b, 'startDate', 'start_date'))}</p><p>End: {label(value(b, 'endDate', 'end_date'))}</p></article>)}</div> : (
            <p className="sp-muted">{readTotal(batchStatus, 'No batch assignment found.')}</p>
          )}
        </section>
        <section className="sp-panel sp-staff-record-panel" aria-busy={paymentStatus === 'loading'}>
          <h2>Payment history</h2>
          {partialPayments && <p className="sp-muted">Only payments recorded directly against this student are shown.</p>}
          {(paymentStatus === 'ready' || partialPayments) && myPayments.length ? <div className="sp-stack sp-staff-payment-list" role="region" aria-label="Payment history records" tabIndex={0}>{myPayments.map((p, i) => <article className="sp-entry sp-payment" key={p.paymentId || i}><div><h3>{label(p.paymentDate?.slice(0, 10))}</h3><p>{label(p.paymentMode)} · {label(p.courseName)}</p></div><strong>{money.format(Number(p.paymentAmount) || 0)}</strong></article>)}</div> : (
            <p className="sp-muted">{readTotal(paymentStatus, 'No payment records found.')}</p>
          )}
        </section>
      </div>
      <p className="sp-footnote">Information is read-only and comes from existing ERP records. Missing details are not estimated. This preview does not grant students access.</p>
    </div>}
  </main>;
}
