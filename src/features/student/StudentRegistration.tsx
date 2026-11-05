import RowActionsMenu from '@/components/RowActionsMenu';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent, ReactNode } from 'react';
import { Fragment } from 'react';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { http } from '@/core/http/httpClient';
import { courseApi, type TrainingCourseRecord } from '@/api/courseApi';
import { directoryApi, type BranchOption } from '@/api/directoryApi';
import { studentApi, type RegistrationRequest, type StudentRow } from '@/api/studentApi';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';

type Row = Record<string, unknown>;
type Qualification = { qualificationId: number; qualification: string };
const today = () => new Date().toISOString().slice(0, 10);
const pick = (row: Row, ...keys: string[]) => keys.map((key) => row[key]).find((v) => v !== undefined && v !== null && v !== '');
const show = (v: unknown) => v === undefined || v === null || v === '' ? '—' : String(v);
const money = (v: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v) || 0);
const iso = (v: string) => new Date(v + 'T00:00:00').toISOString();
const freshForm = () => ({
  branchId: 0, registrationDate: today(), studentName: '', lastName: '', gender: '', birthDate: '',
  emailAddress: '', mobileNumber: '', whatsappNumber: '', parentName: '', parentNumber: '',
  aadharCardNumber: '', aadharCardPhoto: '', localAddress: '', permanentAddress: '',
  qualification: '', university: '', passingYear: 0, medium: '', percentage: 0, discount: 0,
  currentStatus: 'Active', courseId: 0, paymentDate: today(), paymentAmount: 0,
  paymentMode: 'Cash', paymentDescription: '',
});

function Modal({ title, subtitle, onClose, children, large = true }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; large?: boolean }) {
  return createPortal(<div className="ciit-modal-backdrop" onMouseDown={onClose}>
    <div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="student-modal-title" onMouseDown={(e) => e.stopPropagation()}>
      <div className="ciit-modal-dialog" style={{ maxWidth: large ? 980 : 620 }}>
        <div className="modal-content ciit-glass-modal">
          <div className="modal-header"><div><span className="ciit-modal-kicker">CIIT · STUDENT MANAGEMENT</span><h2 id="student-modal-title" className="modal-title fs-5">{title}</h2><p className="small text-muted mb-0">{subtitle}</p></div><button className="btn-close" aria-label="Close" onClick={onClose} /></div>
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  </div>, document.body);
}

export default function StudentRegistration() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [courses, setCourses] = useState<TrainingCourseRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState(0);
  const [search, setSearch] = useState('');
  const [regSearch, setRegSearch] = useState('');
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feeLoading, setFeeLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState<'new' | 'existing' | 'details' | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [form, setForm] = useState(freshForm);
  const [existingStudentId, setExistingStudentId] = useState(0);
  const [existingCourseId, setExistingCourseId] = useState(0);
  const [existingDiscount, setExistingDiscount] = useState(0);
  const [existingPayment, setExistingPayment] = useState({ paymentAmount: 0, paymentDate: today(), paymentMode: 'Cash', paymentDescription: '' });
  const [feeInfo, setFeeInfo] = useState<{ actualFees: number; finalFees: number } | null>(null);

  async function loadData() {
    setLoading(true); setError('');
    const [s, r] = await Promise.allSettled([studentApi.getStudents(), studentApi.getRegistrations()]);
    if (s.status === 'fulfilled') setStudents(s.value);
    if (r.status === 'fulfilled') setRegistrations(r.value);
    if (s.status === 'rejected' || r.status === 'rejected') {
      console.error('Student data refresh failed:', { students: s.status === 'rejected' ? s.reason : undefined, registrations: r.status === 'rejected' ? r.reason : undefined });
      setError('Some student data could not be refreshed. Successfully loaded records remain visible.');
    }
    setLoading(false);
  }
  async function loadDropdowns() {
    setDropdownLoading(true);
    const results = await Promise.allSettled([
      directoryApi.getBranches(),
      http.get(API_ENDPOINTS.lead + '/Qualification').then(({ data }) => {
        const rows = Array.isArray(data) ? data : data?.data ?? data?.result ?? data?.items ?? data?.$values ?? [];
        return rows.map((x: Row) => ({ qualificationId: Number(pick(x, 'qualificationId', 'qualification_Id', 'id') ?? 0), qualification: String(pick(x, 'qualification', 'qualificationName', 'name') ?? '') })).filter((x: Qualification) => x.qualification);
      }),
      courseApi.getAll(),
    ]);
    if (results[0].status === 'fulfilled') setBranches(results[0].value);
    if (results[1].status === 'fulfilled') setQualifications(results[1].value);
    if (results[2].status === 'fulfilled') setCourses(results[2].value);
    if (results.some((x) => x.status === 'rejected')) setError('Some form dropdowns failed to load. Please retry before submitting.');
    setDropdownLoading(false);
  }
  useEffect(() => { void loadData(); }, []);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !q || [s.studentId, s.studentName, s.lastName, s.studentCode, s.mobileNumber, s.emailAddress, s.qualification, s.branchName].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [students, search]);
  const visibleRegs = useMemo(() => {
    const q = regSearch.trim().toLowerCase();
    return registrations.filter((r) => !q || [pick(r, 'registrationId', 'registration_Id'), pick(r, 'studentName', 'student_Name'), pick(r, 'courseName', 'course_Name'), pick(r, 'registrationCode', 'registration_Code')].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [registrations, regSearch]);

  const groupedRegs = useMemo(() => {
    const groups = new Map<string, { key: string; studentName: string; lastName: string; records: Row[] }>();
    visibleRegs.forEach((registration) => {
      const studentId = pick(registration, 'studentId', 'student_Id', 'student_id');
      const studentName = String(pick(registration, 'studentName', 'student_Name', 'student_name') ?? 'Unknown student').trim();
      const lastName = String(pick(registration, 'lastName', 'last_Name', 'last_name') ?? '').trim();
      const key = studentId != null && studentId !== '' ? 'student-' + studentId : 'name-' + (studentName + ' ' + lastName).toLowerCase();
      const group = groups.get(key);
      if (group) group.records.push(registration);
      else groups.set(key, { key, studentName, lastName, records: [registration] });
    });
    return Array.from(groups.values());
  }, [visibleRegs]);

  async function openForm(kind: 'new' | 'existing', studentId = 0) {
    setError(''); setSuccess(''); setFeeInfo(null); setModal(kind);
    if (!branches.length || !courses.length || !qualifications.length) await loadDropdowns();
    if (kind === 'new') {
      setForm(freshForm());
      setSelectedEnquiryId(0);
      try {
        setEnquiries((await enquiryApi.getAll()).filter((item) => !item.deletedAt));
      } catch (requestError) {
        console.error('Enquiry prefill list failed:', requestError);
        setEnquiries([]);
        setError('Enquiry list could not be loaded. You can still enter student details manually.');
      }
    }
    else { setExistingStudentId(studentId); setExistingCourseId(0); setExistingDiscount(0); setExistingPayment({ paymentAmount: 0, paymentDate: today(), paymentMode: 'Cash', paymentDescription: '' }); }
  }
  async function loadFees(courseId: number, discount: number) {
    if (!courseId) { setFeeInfo(null); return; }
    setFeeLoading(true); setError('');
    try {
      const data = await studentApi.getCourseFees(courseId, discount);
      setFeeInfo({ actualFees: Number(pick(data, 'actualFees', 'actual_Fees') ?? 0), finalFees: Number(pick(data, 'finalFees', 'final_Fees') ?? 0) });
    } catch (e) { console.error('Course fee lookup failed:', e); setFeeInfo(null); setError('Could not load the selected course fees. Please retry.'); }
    finally { setFeeLoading(false); }
  }
  const setField = (key: keyof ReturnType<typeof freshForm>, value: string | number) => setForm((f) => ({ ...f, [key]: value }));
  function prefillFromEnquiry(enquiryId: number) {
    setSelectedEnquiryId(enquiryId);
    const enquiry = enquiries.find((item) => Number(item.enquiryId) === enquiryId);
    if (!enquiry) return;
    const birthDate = String(pick(enquiry as unknown as Row, 'birthDate', 'birth_Date') ?? '');
    setForm((previous) => ({
      ...previous,
      studentName: String(pick(enquiry as unknown as Row, 'candidateName', 'candidate_name', 'studentName', 'name') ?? previous.studentName).trim().split(/\s+/)[0] || previous.studentName,
      lastName: String(pick(enquiry as unknown as Row, 'candidateName', 'candidate_name', 'studentName', 'name') ?? previous.studentName).trim().split(/\s+/).slice(1).join(' ') || previous.lastName,
      gender: String(pick(enquiry as unknown as Row, 'gender') ?? previous.gender),
      emailAddress: String(pick(enquiry as unknown as Row, 'emailAddress', 'email_address') ?? previous.emailAddress),
      mobileNumber: String(pick(enquiry as unknown as Row, 'mobileNumber', 'mobile_number', 'mobile', 'phone') ?? previous.mobileNumber).replace(/\D/g, '').slice(-10) || previous.mobileNumber,
      localAddress: String(pick(enquiry as unknown as Row, 'localAddress', 'local_address') ?? previous.localAddress),
      birthDate: birthDate ? birthDate.slice(0, 10) : previous.birthDate,
      qualification: String(pick(enquiry as unknown as Row, 'qualification', 'qualificationName') ?? previous.qualification),
      branchId: Number(pick(enquiry as unknown as Row, 'branchId', 'branch_id') ?? previous.branchId),
    }));
  }

  async function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (!form.studentName.trim() || !form.lastName.trim() || !form.branchId || !form.courseId || !form.gender || !form.birthDate) { setError('Complete all required student, branch, course, gender and date fields.'); return; }
    if (!/^\d{10}$/.test(form.mobileNumber)) { setError('Mobile number must contain exactly 10 digits.'); return; }
    if (form.whatsappNumber && !/^\d{10}$/.test(form.whatsappNumber)) { setError('WhatsApp number must contain exactly 10 digits.'); return; }
    if (form.parentNumber && !/^\d{10}$/.test(form.parentNumber)) { setError('Parent number must contain exactly 10 digits.'); return; }
    if (form.aadharCardNumber && !/^\d{12}$/.test(form.aadharCardNumber)) { setError('Aadhaar number must contain exactly 12 digits.'); return; }
    if (form.emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress)) { setError('Enter a valid email address.'); return; }
    if (feeLoading) { setError('Wait until the course fee calculation finishes.'); return; }
    if (form.courseId && !feeInfo) { setError('Course fee details are not available. Please select the course again.'); return; }
    if (feeInfo && (form.discount > feeInfo.actualFees || form.paymentAmount > feeInfo.finalFees)) { setError('Discount or initial payment exceeds the applicable course fee.'); return; }
    const payload: RegistrationRequest = { ...form, registrationDate: iso(form.registrationDate), birthDate: iso(form.birthDate), paymentDate: iso(form.paymentDate), leadId: null };
    setSaving(true);
    try { await studentApi.registerStudent(payload); setSuccess('Student registered successfully.'); setModal(null); await loadData(); }
    catch (err) { console.error('Student registration failed:', err); setError('Registration failed. Please verify the details and try again.'); }
    finally { setSaving(false); }
  }
  async function submitExisting(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (!existingStudentId || !existingCourseId || !feeInfo) { setError('Select a student and course, and wait for course fees to load.'); return; }
    if (existingDiscount < 0 || existingDiscount > feeInfo.actualFees || existingPayment.paymentAmount < 0 || existingPayment.paymentAmount > feeInfo.finalFees) { setError('Check the discount and payment amount.'); return; }
    setSaving(true);
    try {
      await studentApi.registerExistingStudentCourse({ studentId: existingStudentId, courseId: existingCourseId, discount: existingDiscount, paymentAmount: existingPayment.paymentAmount, paymentDate: iso(existingPayment.paymentDate), paymentMode: existingPayment.paymentMode, paymentDescription: existingPayment.paymentDescription, leadId: 0 });
      setSuccess('Existing student enrolled successfully.'); setModal(null); await loadData();
    } catch (err) { console.error('Existing student registration failed:', err); setError('Could not register this student for the selected course.'); }
    finally { setSaving(false); }
  }

  return <section className="container-fluid py-3 ciit-data-page">
    <div className="ciit-page-heading mb-4"><div><span className="ciit-section-eyebrow">ACADEMIC MANAGEMENT</span><h1 className="h3 mb-1">Student Registration</h1><p className="text-muted mb-0">Manage student profiles, course registrations and enrollment.</p></div><div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-primary" onClick={() => void loadData()} disabled={loading}><i className="bi bi-arrow-clockwise me-1" />Refresh</button><button className="btn btn-outline-primary" onClick={() => void openForm('existing')}><i className="bi bi-person-plus me-1" />Register Existing Student</button><button className="btn btn-primary" onClick={() => void openForm('new')}><i className="bi bi-plus-lg me-1" />Register New Student</button></div></div>
    {error && !modal && <div className="alert alert-warning">{error}</div>}{success && <div className="alert alert-success">{success}</div>}
    <div className="row g-3 mb-4"><div className="col-sm-6 col-xl-3"><div className="card ciit-stat-card"><div className="card-body"><span>Total Students</span><strong>{students.length}</strong><small>Student profiles</small></div></div></div><div className="col-sm-6 col-xl-3"><div className="card ciit-stat-card"><div className="card-body"><span>Course Registrations</span><strong>{registrations.length}</strong><small>Enrollment records</small></div></div></div></div>
    <div className="card ciit-data-card mb-4"><div className="card-header"><div><h2 className="h6 mb-1">Student Directory</h2><span className="small text-muted">{visibleStudents.length} of {students.length} students</span></div><div className="ciit-table-search"><i className="bi bi-search" /><input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, mobile or email..." /></div></div>
      <div className="table-responsive"><table className="table table-hover align-middle ciit-professional-table mb-0"><thead><tr><th>#</th><th>Student</th><th>Code</th><th>Mobile</th><th>Email</th><th>Qualification</th><th>Branch</th><th className="text-end">Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={8} className="ciit-table-state">Loading students...</td></tr> : visibleStudents.length ? visibleStudents.map((s, i) => <tr key={s.studentId}><td>{i + 1}</td><td><div className="ciit-student-cell"><span className="ciit-student-avatar">{s.studentName?.charAt(0)?.toUpperCase() || 'S'}</span><div><strong>{s.studentName} {s.lastName}</strong><small>Student ID: {s.studentId}</small></div></div></td><td>{show(s.studentCode)}</td><td>{show(s.mobileNumber)}</td><td>{show(s.emailAddress)}</td><td>{show(s.qualification)}</td><td>{show(s.branchName)}</td><td><RowActionsMenu label={`Actions for ${s.studentName} ${s.lastName ?? ''}`} actions={[
              { label: 'View student', onSelect: () => { setSelectedStudent(s); setModal('details'); } },
              { label: 'Register course', onSelect: () => void openForm('existing', s.studentId) },
            ]} /></td></tr>) : <tr><td colSpan={8} className="ciit-table-state">No student records found.</td></tr>}
      </tbody></table></div>
    </div>
    <div className="card ciit-data-card"><div className="card-header"><div><h2 className="h6 mb-1">Course Registration Records</h2><span className="small text-muted">{visibleRegs.length} records</span></div><div className="ciit-table-search"><i className="bi bi-search" /><input className="form-control" value={regSearch} onChange={(e) => setRegSearch(e.target.value)} placeholder="Search student, course or registration..." /></div></div><div className="table-responsive"><table className="table table-hover align-middle ciit-professional-table mb-0"><thead><tr><th>Registration</th><th>Student</th><th>Course</th><th>Registration Code</th><th>Status</th><th className="text-end">Initial Paid</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="ciit-table-state">Loading registrations...</td></tr> : groupedRegs.length ? groupedRegs.map((group) => {
  const isExpanded = expandedStudentKey === group.key;
  const totalPaid = group.records.reduce((sum, record) => sum + Number(pick(record, 'paymentAmount', 'payment_Amount') ?? 0), 0);
  return <Fragment key={group.key}>
    <tr className="ciit-registration-student-row"><td><button type="button" className="btn btn-sm btn-outline-primary" aria-expanded={isExpanded} aria-label={(isExpanded ? 'Collapse' : 'Expand') + ' registrations for ' + group.studentName + ' ' + group.lastName} onClick={() => setExpandedStudentKey(isExpanded ? null : group.key)}>{isExpanded ? '−' : '+'} {group.records.length}</button></td><td><strong>{group.studentName} {group.lastName}</strong><div className="small text-muted">{group.records.length} course registration{group.records.length === 1 ? '' : 's'}</div></td><td>{group.records.length} course{group.records.length === 1 ? '' : 's'}</td><td>—</td><td>—</td><td className="text-end fw-semibold">{money(totalPaid)}</td></tr>
    {isExpanded && group.records.map((record, index) => <tr className="ciit-registration-detail-row" key={String(pick(record, 'registrationId', 'registration_Id') ?? (group.key + '-' + index))}><td className="ps-4">↳ #{show(pick(record, 'registrationId', 'registration_Id'))}</td><td className="text-muted small">Course detail</td><td>{show(pick(record, 'courseName', 'course_Name'))}</td><td>{show(pick(record, 'registrationCode', 'registration_Code'))}</td><td><span className="badge rounded-pill text-bg-success">{show(pick(record, 'currentStatus', 'current_Status', 'status'))}</span></td><td className="text-end fw-semibold">{money(pick(record, 'paymentAmount', 'payment_Amount'))}</td></tr>)}
  </Fragment>;
}) : <tr><td colSpan={6} className="ciit-table-state">No course registrations found.</td></tr>}</tbody></table></div></div>

    {modal === 'details' && selectedStudent && <Modal title="Student Profile" subtitle={`Student ID: ${selectedStudent.studentId}`} onClose={() => setModal(null)} large={false}><div className="row g-3">{[['Name', `${selectedStudent.studentName} ${selectedStudent.lastName ?? ''}`], ['Student Code', selectedStudent.studentCode], ['Mobile', selectedStudent.mobileNumber], ['Email', selectedStudent.emailAddress], ['Qualification', selectedStudent.qualification], ['Branch', selectedStudent.branchName], ['Gender', selectedStudent.gender], ['Date of Birth', selectedStudent.birthDate], ['Parent', selectedStudent.parentName], ['Parent Mobile', selectedStudent.parentNumber], ['WhatsApp', selectedStudent.whatsappNumber], ['Address', selectedStudent.localAddress]].map(([label, value]) => <div className="col-sm-6" key={label}><div className="ciit-detail-field"><small>{label}</small><strong>{show(value)}</strong></div></div>)}</div><div className="text-end mt-4"><button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button></div></Modal>}

    {modal === 'new' && <div className="ciit-registration-form-page"><div className="ciit-page-heading mb-3"><div><span className="ciit-section-eyebrow">CIIT · STUDENT MANAGEMENT</span><h1 className="h3 mb-1">Register New Student</h1><p className="text-muted mb-0">Create a student profile and enroll in a course.</p></div><button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setModal(null)}>Back to Student Registration</button></div><div className="card ciit-data-card"><div className="card-body">
      {dropdownLoading && <div className="alert alert-info py-2">Loading branches, qualifications and courses...</div>}
      <form onSubmit={submitNew}>
        <div className="ciit-form-section"><h3>Personal Information</h3><div className="row g-3">
          <div className="col-12"><label className="form-label">Search Enquiry Student</label><select className="form-select" value={selectedEnquiryId} onChange={(e) => prefillFromEnquiry(Number(e.target.value))}><option value={0}>Select enquiry to auto-fill details (optional)</option>{enquiries.map((item) => <option key={item.enquiryId} value={item.enquiryId}>{item.candidateName} · {item.mobileNumber}</option>)}</select><small className="text-muted">Selecting an enquiry fills available personal details. You can edit them before registering.</small></div>
          <div className="col-md-6"><label className="form-label">First Name *</label><input className="form-control" required value={form.studentName} onChange={(e) => setField('studentName', e.target.value)} /></div>
          <div className="col-md-6"><label className="form-label">Last Name *</label><input className="form-control" required value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Gender *</label><select className="form-select" required value={form.gender} onChange={(e) => setField('gender', e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div className="col-md-4"><label className="form-label">Date of Birth *</label><input type="date" required className="form-control" value={form.birthDate} onChange={(e) => setField('birthDate', e.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Mobile *</label><input required maxLength={10} inputMode="numeric" className="form-control" value={form.mobileNumber} onChange={(e) => setField('mobileNumber', e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
          <div className="col-md-6"><label className="form-label">Email</label><input type="email" className="form-control" value={form.emailAddress} onChange={(e) => setField('emailAddress', e.target.value)} /></div>
          <div className="col-md-6"><label className="form-label">WhatsApp</label><input maxLength={10} className="form-control" value={form.whatsappNumber} onChange={(e) => setField('whatsappNumber', e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
          <div className="col-md-6"><label className="form-label">Parent Name</label><input className="form-control" value={form.parentName} onChange={(e) => setField('parentName', e.target.value)} /></div>
          <div className="col-md-6"><label className="form-label">Parent Mobile</label><input maxLength={10} className="form-control" value={form.parentNumber} onChange={(e) => setField('parentNumber', e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
          <div className="col-md-6"><label className="form-label">Aadhaar Number</label><input maxLength={12} className="form-control" value={form.aadharCardNumber} onChange={(e) => setField('aadharCardNumber', e.target.value.replace(/\D/g, '').slice(0, 12))} /></div>
          <div className="col-md-6"><label className="form-label">Qualification</label><select className="form-select" value={form.qualification} onChange={(e) => setField('qualification', e.target.value)}><option value="">Select</option>{qualifications.map((q) => <option key={q.qualificationId || q.qualification}>{q.qualification}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">University / Board</label><input className="form-control" value={form.university} onChange={(e) => setField('university', e.target.value)} /></div>
          <div className="col-md-3"><label className="form-label">Passing Year</label><input type="number" min="0" className="form-control" value={form.passingYear || ''} onChange={(e) => setField('passingYear', Number(e.target.value))} /></div>
          <div className="col-md-3"><label className="form-label">Medium</label><input className="form-control" value={form.medium} onChange={(e) => setField('medium', e.target.value)} /></div>
          <div className="col-md-3"><label className="form-label">Percentage</label><input type="number" min="0" max="100" className="form-control" value={form.percentage || ''} onChange={(e) => setField('percentage', Number(e.target.value))} /></div>
          <div className="col-md-3"><label className="form-label">Status</label><select className="form-select" value={form.currentStatus} onChange={(e) => setField('currentStatus', e.target.value)}><option>Active</option><option>Inactive</option></select></div>
          <div className="col-12"><label className="form-label">Local Address</label><textarea className="form-control" rows={2} value={form.localAddress} onChange={(e) => setField('localAddress', e.target.value)} /></div>
          <div className="col-12"><label className="form-label">Permanent Address</label><textarea className="form-control" rows={2} value={form.permanentAddress} onChange={(e) => setField('permanentAddress', e.target.value)} /></div>
        </div></div>
        <div className="ciit-form-section mt-4"><h3>Course & Fee Details</h3><div className="row g-3">
          <div className="col-md-6"><label className="form-label">Branch *</label><select className="form-select" required value={form.branchId} onChange={(e) => setField('branchId', Number(e.target.value))}><option value={0}>Select branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">Course *</label><select className="form-select" required value={form.courseId} onChange={(e) => { const id = Number(e.target.value); setField('courseId', id); void loadFees(id, form.discount); }}><option value={0}>Select course</option>{courses.map((c) => <option key={c.courseId} value={c.courseId}>{c.courseName}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label">Registration Date *</label><input type="date" required className="form-control" value={form.registrationDate} onChange={(e) => setField('registrationDate', e.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Discount</label><input type="number" min="0" className="form-control" value={form.discount} onChange={(e) => { const d = Number(e.target.value); setField('discount', d); if (form.courseId) void loadFees(form.courseId, d); }} /></div>
          <div className="col-md-4"><label className="form-label">Initial Payment</label><input type="number" min="0" className="form-control" value={form.paymentAmount} onChange={(e) => setField('paymentAmount', Number(e.target.value))} /></div>
          {feeLoading && <div className="col-12 small text-muted">Calculating course fees...</div>}{feeInfo && <div className="col-12"><div className="ciit-fee-summary"><span>Course Fee <strong>{money(feeInfo.actualFees)}</strong></span><span>Final Fee <strong>{money(feeInfo.finalFees)}</strong></span></div></div>}
          <div className="col-md-4"><label className="form-label">Payment Date</label><input type="date" required className="form-control" value={form.paymentDate} onChange={(e) => setField('paymentDate', e.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Payment Mode</label><select className="form-select" value={form.paymentMode} onChange={(e) => setField('paymentMode', e.target.value)}><option>Cash</option><option>UPI</option><option>Online</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></div>
          <div className="col-md-4"><label className="form-label">Payment Description</label><input className="form-control" value={form.paymentDescription} onChange={(e) => setField('paymentDescription', e.target.value)} /></div>
        </div></div>
        {error && <div className="alert alert-danger mt-3">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || dropdownLoading || feeLoading}>{saving ? 'Registering...' : 'Register Student'}</button></div>
      </form>
    </div></div>}

    {modal === 'existing' && <Modal title="Register Existing Student" subtitle="Enroll an existing student in another course." onClose={() => !saving && setModal(null)} large={false}>
      {dropdownLoading && <div className="alert alert-info py-2">Loading course list...</div>}
      <form onSubmit={submitExisting}><div className="row g-3">
        <div className="col-12"><label className="form-label">Student *</label><select required className="form-select" value={existingStudentId} onChange={(e) => setExistingStudentId(Number(e.target.value))}><option value={0}>Choose student</option>{students.map((s) => <option key={s.studentId} value={s.studentId}>{s.studentName} {s.lastName} · {s.mobileNumber}</option>)}</select></div>
        <div className="col-md-7"><label className="form-label">Course *</label><select required className="form-select" value={existingCourseId} onChange={(e) => { const id = Number(e.target.value); setExistingCourseId(id); void loadFees(id, existingDiscount); }}><option value={0}>Select course</option>{courses.map((c) => <option key={c.courseId} value={c.courseId}>{c.courseName}</option>)}</select></div>
        <div className="col-md-5"><label className="form-label">Discount</label><input type="number" min="0" className="form-control" value={existingDiscount} onChange={(e) => { const d = Number(e.target.value); setExistingDiscount(d); if (existingCourseId) void loadFees(existingCourseId, d); }} /></div>
        {feeInfo && <div className="col-12"><div className="ciit-fee-summary"><span>Course Fee <strong>{money(feeInfo.actualFees)}</strong></span><span>Final Fee <strong>{money(feeInfo.finalFees)}</strong></span></div></div>}{feeLoading && <div className="col-12 small text-muted">Loading fees...</div>}
        <div className="col-md-6"><label className="form-label">Payment Amount</label><input type="number" min="0" className="form-control" value={existingPayment.paymentAmount} onChange={(e) => setExistingPayment((p) => ({ ...p, paymentAmount: Number(e.target.value) }))} /></div>
        <div className="col-md-6"><label className="form-label">Payment Date *</label><input type="date" required className="form-control" value={existingPayment.paymentDate} onChange={(e) => setExistingPayment((p) => ({ ...p, paymentDate: e.target.value }))} /></div>
        <div className="col-md-6"><label className="form-label">Payment Mode *</label><select required className="form-select" value={existingPayment.paymentMode} onChange={(e) => setExistingPayment((p) => ({ ...p, paymentMode: e.target.value }))}><option>Cash</option><option>UPI</option><option>Online</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></div>
        <div className="col-12"><label className="form-label">Description</label><input className="form-control" value={existingPayment.paymentDescription} onChange={(e) => setExistingPayment((p) => ({ ...p, paymentDescription: e.target.value }))} /></div>
      </div>{error && <div className="alert alert-danger mt-3">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || dropdownLoading || feeLoading}>{saving ? 'Registering...' : 'Register Existing Student'}</button></div></form>
    </Modal>}
  </section>;
}
