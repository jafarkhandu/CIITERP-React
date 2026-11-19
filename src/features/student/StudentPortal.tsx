import { useEffect, useMemo, useState } from 'react';
import { studentApi, type StudentRow, type PaymentRow } from '@/api/studentApi';
import { batchApi, batchStudentApi } from '@/api/batchApi';
import './StudentPortal.css';

type Row = Record<string, unknown>;
const value = (row: Row | undefined, ...keys: string[]) => keys.map(key => row?.[key]).find(v => v !== undefined && v !== null && v !== '');
const label = (v: unknown) => v === undefined || v === null || v === '' ? 'Not available' : String(v);
const id = (row: Row | undefined, ...keys: string[]) => Number(value(row, ...keys) ?? 0);
const money = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const nameOf = (s: StudentRow) => [s.studentName, s.lastName].filter(Boolean).join(' ').trim();
const fields: { title: string; keys: string[] }[] = [
  { title: 'Student ID', keys: ['studentCode', 'studentId'] },
  { title: 'Email address', keys: ['emailAddress'] },
  { title: 'Mobile number', keys: ['mobileNumber'] },
  { title: 'Branch', keys: ['branchName'] },
  { title: 'Qualification', keys: ['qualification'] },
  { title: 'Registration status', keys: ['currentStatus', 'status'] },
];

export default function StudentPortal() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const sources = [
      { name: 'students', request: studentApi.getStudents() },
      { name: 'registrations', request: studentApi.getRegistrations() },
      { name: 'payments', request: studentApi.getPayments() },
      { name: 'batches', request: batchApi.getAll() },
      { name: 'batch assignments', request: batchStudentApi.getAll() },
    ];
    Promise.allSettled(sources.map(source => source.request)).then(results => {
      if (!active) return;
      const failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') { failed.push(sources[index].name); return; }
        const rows = result.value as Row[];
        switch (index) {
          case 0: setStudents(rows as StudentRow[]); break;
          case 1: setRegistrations(rows); break;
          case 2: setPayments(rows as PaymentRow[]); break;
          case 3: setBatches(rows); break;
          case 4: setAssignments(rows); break;
        }
      });
      setErrors(failed);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredStudents = useMemo(() => students.filter(s => (nameOf(s) + ' ' + (s.studentCode ?? '') + ' ' + s.studentId).toLowerCase().includes(search.toLowerCase())).sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [students, search]);
  const student = students.find(s => s.studentId === selectedId);
  const myRegistrations = registrations.filter(r => id(r, 'studentId', 'student_Id', 'student_id') === selectedId);
  const registrationIds = new Set(myRegistrations.map(r => id(r, 'registrationId', 'registration_Id', 'registration_id')).filter(Boolean));
  const myPayments = payments.filter(p => registrationIds.has(Number(p.registrationId)) || (!p.registrationId && Number(p.studentId) === selectedId));
  const myAssignments = assignments.filter(a => registrationIds.has(id(a, 'registrationId', 'registration_id', 'registration_Id')));
  const myBatches = myAssignments.map(a => batches.find(b => id(b, 'batchId', 'batch_id', 'BatchId') === id(a, 'batchId', 'batch_id', 'BatchId'))).filter((b): b is Row => !!b);
  const paid = myPayments.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);

  return <main className="ciit-student-portal">
    <header className="sp-heading">
      <div><span className="sp-eyebrow">CIIT · STUDENT WORKSPACE</span><h1>Student Portal</h1><p>Preview registered students' learning and enrollment information.</p></div>
      <span className="sp-preview">Staff preview · No student login</span>
    </header>
    <section className="sp-panel sp-picker" aria-label="Choose student">
      <div><h2>Choose a student</h2><p>Switch between registered students without logging out.</p></div>
      <div className="sp-controls">
        <label htmlFor="sp-search">Search students</label>
        <input id="sp-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID" />
        <label htmlFor="sp-select">Registered student</label>
        <select id="sp-select" value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))} disabled={loading || !filteredStudents.length}>
          <option value="">Select a student</option>
          {filteredStudents.map(s => <option key={s.studentId} value={s.studentId}>{nameOf(s)} · {s.studentCode || s.studentId}</option>)}
        </select>
      </div>
    </section>
    {loading && <div className="sp-panel" role="status">Loading student records…</div>}
    {!!errors.length && <div className="sp-alert" role="alert">Could not load: {errors.join(', ')}. Some information may be unavailable. Refresh to retry.</div>}
    {!loading && !students.length && <div className="sp-panel">No student records are available for this account.</div>}
    {!loading && !!students.length && !student && <div className="sp-panel sp-empty">Select a student above to view their profile, courses, batches and payments.</div>}
    {student && <div className="sp-content">
      <section className="sp-panel sp-hero"><div className="sp-avatar" aria-hidden="true">{nameOf(student).split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()}</div><div><span className="sp-eyebrow">STUDENT PROFILE</span><h2>{nameOf(student)}</h2><p>{label(student.studentCode || student.studentId)} · {label(student.branchName)}</p></div></section>
      <div className="sp-stats">
        <div className="sp-panel"><span>Course registrations</span><strong>{myRegistrations.length}</strong></div>
        <div className="sp-panel"><span>Assigned batches</span><strong>{myBatches.length}</strong></div>
        <div className="sp-panel"><span>Recorded payments</span><strong>{myPayments.length}</strong></div>
        <div className="sp-panel"><span>Total payments</span><strong>{money(paid)}</strong></div>
      </div>
      <div className="sp-columns">
        <section className="sp-panel"><h2>Personal information</h2><dl className="sp-details">{fields.map(f => <div key={f.title}><dt>{f.title}</dt><dd>{label(value(student, ...f.keys) ?? value(myRegistrations[0], ...f.keys))}</dd></div>)}</dl></section>
        <section className="sp-panel"><h2>My courses</h2>{myRegistrations.length ? <div className="sp-stack">{myRegistrations.map((r, i) => <article className="sp-entry" key={String(value(r, 'registrationId', 'registration_id') ?? i)}><h3>{label(value(r, 'courseName', 'course_name', 'CourseName'))}</h3><p>Registration: {label(value(r, 'registrationCode', 'registration_code'))}</p><p>Status: {label(value(r, 'currentStatus', 'status'))}</p></article>)}</div> : <p className="sp-muted">No course registration found.</p>}</section>
        <section className="sp-panel"><h2>My batches</h2>{myBatches.length ? <div className="sp-stack">{myBatches.map((b, i) => <article className="sp-entry" key={String(id(b, 'batchId', 'batch_id') || i)}><h3>{label(value(b, 'batchName', 'batch_name'))}</h3><p>Time: {label(value(b, 'batchTime', 'batch_time'))}</p><p>Start: {label(value(b, 'startDate', 'start_date'))}</p><p>End: {label(value(b, 'endDate', 'end_date'))}</p></article>)}</div> : <p className="sp-muted">No batch assignment found.</p>}</section>
        <section className="sp-panel"><h2>Payment history</h2>{myPayments.length ? <div className="sp-stack">{myPayments.map((p, i) => <article className="sp-entry sp-payment" key={p.paymentId || i}><div><h3>{label(p.paymentDate?.slice(0, 10))}</h3><p>{label(p.paymentMode)} · {label(p.courseName)}</p></div><strong>{money(Number(p.paymentAmount) || 0)}</strong></article>)}</div> : <p className="sp-muted">No payment records found.</p>}</section>
      </div>
      <p className="sp-footnote">Information is read-only and comes from existing ERP records. Missing details are not estimated. This preview does not grant students access.</p>
    </div>}
  </main>;
}
