import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { authService } from '@/core/auth/authService';
import { useSession } from '@/core/auth/hooks';
import { readTokenIdentity } from '@/core/auth/tokenIdentity';
import { tokenService } from '@/core/services/tokenService';
import { studentApi } from '@/api/studentApi';
import { studentBatchApi } from '@/api/batchApi';
import { loadStudentPhoto, removeStudentPhoto, saveStudentPhoto } from './studentPhotoStorage';
import StudentDashboard from './StudentDashboard';
import '@/layouts/MainLayout.css';
import './StudentPortal.css';

const sections = [
  { id: 'student-overview', slug: 'dashboard', path: '/student-portal', title: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { id: 'student-profile', slug: 'profile', path: '/student-portal/profile', title: 'Profile', icon: 'bi-person-vcard' },
  { id: 'student-course', slug: 'courses', path: '/student-portal/courses', title: 'Courses', icon: 'bi-journal-bookmark-fill' },
  { id: 'student-batch', slug: 'batches', path: '/student-portal/batches', title: 'Batches', icon: 'bi-calendar2-week' },
  { id: 'student-payments', slug: 'payments', path: '/student-portal/payments', title: 'Payments', icon: 'bi-wallet2' },
] as const;

type StudentRecord = Record<string, unknown>;

function asRecord(value: unknown): StudentRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as StudentRecord : null;
}

function readField(row: StudentRecord | null, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'Not available' : String(value);
}

function ownedRegistrationResponse(response: unknown, studentId: number): StudentRecord | null {
  const root = asRecord(response);
  const data = asRecord(readField(root, 'data', 'result', 'student', 'studentDetails')) ?? root;
  if (!data) return null;

  // Only render records explicitly linked to the student id in the JWT.
  const ownerId = Number(readField(data, 'studentId', 'student_Id', 'student_id', 'StudentId'));
  return ownerId === studentId ? data : null;
}

function formatStudentDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return display(value);
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function nestedRows(row: StudentRecord | null, ...keys: string[]): StudentRecord[] {
  const entries = readField(row, ...keys);
  return Array.isArray(entries) ? entries.filter((item): item is StudentRecord => asRecord(item) !== null) : [];
}

const currency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function StudentAccount() {
  const session = useSession();
  const [identity] = useState(() => readTokenIdentity(tokenService.getAccessToken() ?? ''));
  // StudentLogin returns studentId in its response body, not necessarily in JWT claims.
  const studentId = identity.studentId ?? session.currentUser?.studentId ?? null;
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(Boolean(studentId));
  const [recordError, setRecordError] = useState('');
  const [myBatchResult, setMyBatchResult] = useState<{ studentId: number; rows: StudentRecord[] } | null>(null);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState('');
  const [coursePaymentDetails, setCoursePaymentDetails] = useState<{
    registration: StudentRecord;
    rows: StudentRecord[];
  } | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);

  function toggleDetail(key: string) {
    setExpandedDetail(current => current === key ? null : key);
  }
  const { page } = useParams<{ page: string }>();
  const { hash } = useLocation();
  const legacyPage = sections.find(section => '#' + section.id === hash)?.slug;
  const activeSection = sections.find(section => section.slug === (page ?? legacyPage ?? 'dashboard'))?.id;
  const showingCourses = activeSection === 'student-course';
  const showingBatches = activeSection === 'student-batch' || activeSection === 'student-overview';
  const paymentDetails = coursePaymentDetails?.registration === studentRecord ? coursePaymentDetails.rows : null;

  // Start each routed page at the top, even when navigating from a scrolled view.
  useEffect(() => { window.scrollTo(0, 0); }, [page, hash]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const [editSource, setEditSource] = useState<StudentRecord | null>(null);
  const [editFields, setEditFields] = useState({ studentName: '', emailAddress: '', mobileNumber: '', qualification: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMessage, setEditMessage] = useState('');

  async function beginProfileEdit() {
    if (!studentId) return;
    setEditMessage('');
    try {
      const result = await studentApi.getStudentDetailsById(studentId);
      const row = ownedRegistrationResponse(result, studentId);
      if (!row) throw new Error('Profile does not match authenticated student.');
      setEditSource(row);
      setEditFields({
        studentName: String(readField(row, 'studentName') ?? ''),
        emailAddress: String(readField(row, 'emailAddress') ?? ''),
        mobileNumber: String(readField(row, 'mobileNumber') ?? ''),
        qualification: String(readField(row, 'qualification') ?? ''),
      });
      setIsEditing(true);
    } catch {
      setEditMessage('Cannot load verified profile details for editing. Please try again.');
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentId || !editSource || Number(readField(editSource, 'studentId')) !== studentId) return;
    const name = editFields.studentName.trim();
    const email = editFields.emailAddress.trim();
    const mobile = editFields.mobileNumber.trim();
    if (!name || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !/^\\d{10}$/.test(mobile)) {
      setEditMessage('Enter a name, valid email and 10-digit mobile number.');
      return;
    }
    const required = ['studentId', 'studentName', 'gender', 'mobileNumber', 'emailAddress',
      'birthDate', 'qualification', 'parentName', 'parentNumber', 'lastName',
      'whatsappNumber', 'localAddress', 'permanentAddress', 'aadharCardNumber',
      'aadharCardPhoto', 'branchId'] as const;
    const payload: Record<string, unknown> = {};
    for (const key of required) {
      if (editSource[key] === undefined || editSource[key] === null) {
        setEditMessage('Update blocked: the API did not return all original fields required for a safe update.');
        return;
      }
      payload[key] = editSource[key];
    }
    Object.assign(payload, { studentName: name, emailAddress: email, mobileNumber: mobile, qualification: editFields.qualification });
    setIsSaving(true);
    setEditMessage('');
    try {
      await studentApi.updateMyProfile(payload);
      setEditSource({ ...editSource, ...payload });
      setStudentRecord(current => current ? { ...current, ...payload } : current);
      setIsEditing(false);
      setEditMessage('Profile updated successfully.');
    } catch {
      setEditMessage('Profile update failed. Existing details were preserved.');
    } finally {
      setIsSaving(false);
    }
  }

  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = ++photoRevision.current;
    setProfilePhoto(null);
    setPhotoMessage('');

    if (studentId) {
      loadStudentPhoto(studentId)
        .then((photo) => {
          if (active && revision === photoRevision.current) setProfilePhoto(photo);
        })
        .catch(() => {
          // Photo storage may be blocked by the browser. Keep initials as fallback.
        });
    }

    return () => { active = false; };
  }, [studentId]);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!studentId) {
      setPhotoMessage('Please sign in again to upload a photo.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setPhotoMessage('Choose a JPG, PNG or WebP image no larger than 2 MB.');
      return;
    }

    const revision = ++photoRevision.current;
    setPhotoMessage('Uploading photo to the server…');
    try {
      await studentApi.uploadMyProfilePhoto(file);
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'));
        reader.onerror = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
      });
      if (revision !== photoRevision.current) return;
      setProfilePhoto(photo);
      try {
        await saveStudentPhoto(studentId, photo);
        setPhotoMessage('Photo uploaded successfully and cached in this browser.');
      } catch {
        setPhotoMessage('Photo uploaded successfully, but the local preview could not be saved.');
      }
    } catch {
      if (revision === photoRevision.current) setPhotoMessage('Photo upload failed. Your previous photo is unchanged.');
    }
  }
  async function handleRemovePhoto() {
    if (!studentId || !profilePhoto) return;

    const revision = ++photoRevision.current;
    try {
      await removeStudentPhoto(studentId);
      if (revision !== photoRevision.current) return;
      setProfilePhoto(null);
      setPhotoMessage('Local photo preview removed. Your server photo is unchanged.');
      if (photoInputRef.current) photoInputRef.current.value = '';
    } catch {
      if (revision === photoRevision.current) {
        setPhotoMessage('Could not remove the photo. Please try again.');
      }
    }
  }

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('ciit-sidebar-collapsed') === 'true');
  const [isDarkTheme, setIsDarkTheme] = useState(() => (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  useEffect(() => {
    if (!studentId) return;

    let active = true;
    studentApi.getRegistrationById(studentId)
      .then((response) => {
        if (!active) return;
        const record = ownedRegistrationResponse(response, studentId);
        if (!record) {
          setRecordError('Student registration details could not be matched to your signed-in account.');
          return;
        }
        setStudentRecord(record);
      })
      .catch(() => {
        if (active) setRecordError('Registration details are currently unavailable.');
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });

    return () => { active = false; };
  }, [studentId]);

  useEffect(() => {
    if (!showingBatches || !studentId || !studentRecord ||
        Number(readField(studentRecord, 'studentId', 'student_Id', 'student_id', 'StudentId')) !== studentId ||
        myBatchResult?.studentId === studentId) return;

    let active = true;
    setBatchesLoading(true);
    setBatchesError('');

    studentBatchApi.getMyBatches()
      .then((rows) => {
        if (!active) return;

        const ownedRegistrations = nestedRows(studentRecord, 'registrations', 'Registrations');
        const registrationIds = new Set(
          [...ownedRegistrations, studentRecord]
            .filter((row) => {
              const ownerId = readField(row, 'studentId', 'student_Id', 'student_id', 'StudentId');
              return ownerId === null || Number(ownerId) === studentId;
            })
            .map((row) => Number(readField(row, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId')))
            .filter((id) => Number.isInteger(id) && id > 0),
        );

        const ownBatches = rows.filter((row) => {
          const ownerId = readField(row, 'studentId', 'student_Id', 'student_id', 'StudentId');
          if (ownerId !== null && Number(ownerId) !== studentId) return false;
          const registrationId = readField(row, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId');
          return registrationId === null || registrationIds.has(Number(registrationId));
        });
        setMyBatchResult({ studentId, rows: ownBatches });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Student batch lookup failed:', error);
        setBatchesError('Your assigned batches could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setBatchesLoading(false);
      });

    return () => { active = false; };
  }, [showingBatches, studentId, studentRecord, myBatchResult?.studentId]);

  useEffect(() => {
    if (!showingCourses || !studentId || !studentRecord || paymentDetails) return;

    const owned = nestedRows(studentRecord, 'registrations', 'Registrations').filter(row => {
      const owner = readField(row, 'studentId', 'student_Id');
      return owner === null || Number(owner) === studentId;
    });
    const registrationIds = new Set(owned.map(row => Number(readField(row, 'registrationId', 'registration_Id'))));
    const paymentIds = [...new Set(owned.flatMap(row =>
      nestedRows(row, 'payments', 'Payments').map(payment => Number(readField(payment, 'paymentId', 'payment_Id'))),
    ))].filter(id => Number.isInteger(id) && id > 0);
    if (!paymentIds.length) return;

    let active = true;
    Promise.allSettled(paymentIds.map(id => studentApi.getPaymentById(id))).then(results => {
      if (!active) return;
      const verified = results.flatMap(result => {
        if (result.status !== 'fulfilled') return [];
        const payment = asRecord(result.value);
        if (!payment || Number(readField(payment, 'studentId', 'student_Id')) !== studentId ||
            !registrationIds.has(Number(readField(payment, 'registrationId', 'registration_Id')))) return [];
        return [payment];
      });
      setCoursePaymentDetails({ registration: studentRecord, rows: verified });
    });
    return () => { active = false; };
  }, [showingCourses, studentId, studentRecord, paymentDetails]);

  const studentName = display(
    readField(studentRecord, 'studentName', 'student_Name', 'name') ||
    identity.displayName || session.employeeName || session.username,
  );
  const qualifications = nestedRows(studentRecord, 'qualifications', 'Qualifications');
  const qualification = readField(
    studentRecord,
    'qualification',
    'qualificationName',
    'qualification_Name',
    'qualification_name',
    'Qualification',
    'QualificationName',
  ) ?? readField(qualifications[0] ?? null, 'qualification_Name', 'qualificationName', 'qualification_name', 'QualificationName');

  const studentCode = identity.username || session.username;
  const belongsToStudent = (row: StudentRecord): boolean => {
    const explicitId = readField(row, 'studentId', 'student_Id', 'student_id', 'StudentId');
    return explicitId === null || Number(explicitId) === studentId;
  };
  const registrations = nestedRows(studentRecord, 'registrations', 'Registrations')
    .filter(belongsToStudent);
  const courseRows = registrations.length ? registrations :
    studentRecord && (
      readField(studentRecord, 'registrationId', 'registration_Id') ||
      readField(studentRecord, 'courseName', 'course_Name')
    ) ? [studentRecord] : [];
  const paymentRows = [
    ...nestedRows(studentRecord, 'payments', 'Payments'),
    ...courseRows.flatMap((row) => nestedRows(row, 'payments', 'Payments')),
  ].filter(belongsToStudent);
  const batchRows = myBatchResult?.studentId === studentId
    ? myBatchResult.rows
    : [
        ...nestedRows(studentRecord, 'batches', 'Batches'),
        ...courseRows.flatMap((row) => nestedRows(row, 'batches', 'Batches')),
      ].filter(belongsToStudent);
  const totalPaid = paymentRows.reduce((sum, row) =>
    sum + (Number(readField(row, 'paymentAmount', 'payment_Amount')) || 0), 0);

  function toggleTheme() {
    const next = !isDarkTheme;
    localStorage.setItem('ciit-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDarkTheme(next);
    window.dispatchEvent(new CustomEvent('ciit-theme-change', { detail: next ? 'dark' : 'light' }));
  }

  function toggleSidebarCollapse() {
    setIsSidebarCollapsed(current => {
      const next = !current;
      localStorage.setItem('ciit-sidebar-collapsed', String(next));
      return next;
    });
  }
  if (!activeSection) return <Navigate to="/student-portal" replace />;

  return (
    <div className={'cmp-main-layout ciit-app-shell ciit-student-public-shell' + (isSidebarCollapsed ? ' is-sidebar-collapsed' : '')}>
      <header className="ciit-topbar">
        <div className="ciit-topbar-left">
          <button type="button" className="ciit-shell-icon-button ciit-mobile-menu-button" onClick={() => setIsMobileSidebarOpen(true)} aria-label="Open navigation" aria-controls="ciit-student-sidebar" aria-expanded={isMobileSidebarOpen}><i className="bi bi-list" aria-hidden="true" /></button>
          <button type="button" className="ciit-shell-icon-button ciit-desktop-collapse-button" onClick={toggleSidebarCollapse} aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-controls="ciit-student-sidebar" aria-expanded={!isSidebarCollapsed} title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><i className={"bi " + (isSidebarCollapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar")} aria-hidden="true" /></button>
          <Link className="ciit-shell-brand" to="/student-portal" aria-label="Student Portal home"><span className="ciit-brand-mark">C</span><span className="ciit-brand-copy"><strong>CIIT</strong><small>TRAINING INSTITUTE</small></span></Link>
          <div className="ciit-topbar-divider" aria-hidden="true" />
          <div className="ciit-topbar-heading"><span>STUDENT WORKSPACE</span><strong>Student Portal</strong></div>
        </div>
        <div className="ciit-topbar-actions">
          <div className="ciit-student-identity" aria-label="Signed-in student">
            <span>Student</span>
            <strong>{studentCode || studentName}</strong>
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}><i className={"bi " + (isDarkTheme ? "bi-moon-stars-fill" : "bi-sun-fill")} aria-hidden="true" /><span>{isDarkTheme ? "Dark" : "Light"}</span><span className={"theme-switch-track" + (isDarkTheme ? " is-dark" : "")} aria-hidden="true"><span /></span></button>
          <button type="button" className="ciit-public-login-link" onClick={() => authService.logout()}>Sign out</button>
        </div>
      </header>
      <div className={"ciit-shell-main" + (isMobileSidebarOpen ? " is-mobile-sidebar-open" : "")}>
        <button type="button" className="ciit-sidebar-backdrop" aria-label="Close navigation" tabIndex={isMobileSidebarOpen ? 0 : -1} onClick={() => setIsMobileSidebarOpen(false)} />
        <aside id="ciit-student-sidebar" className="ciit-shell-sidebar" aria-label="Student navigation">
          <div className="ciit-sidebar-user">
            <span className="ciit-sidebar-avatar">{profilePhoto ? <img src={profilePhoto} alt="" className="sp-profile-avatar-image" /> : studentName.charAt(0).toUpperCase()}</span>
            <div className="ciit-sidebar-user-copy"><strong>{studentName}</strong><small>{studentCode || 'Student account'}</small></div>
          </div>
          <div className="ciit-sidebar-section-label">STUDENT MENU</div>
          <nav className="ciit-sidebar-nav" aria-label="Student sections"><ul className="ciit-sidebar-list">
            {sections.map(section => (
              <li key={section.id}>
                <Link to={section.path} className={activeSection === section.id ? 'active-link' : ''} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => setIsMobileSidebarOpen(false)}>
                  <i className={'bi ' + section.icon} aria-hidden="true" />
                  <span className="ciit-menu-label">{section.title}</span>
                  <span className="ciit-menu-active-mark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul></nav>
          <div className="ciit-sidebar-footer"><span className="ciit-sidebar-footer-mark"><i className="bi bi-mortarboard-fill" aria-hidden="true" /></span><span><strong>CIIT ERP</strong><small>Training Institute</small></span></div>
        </aside>
        <main className="ciit-workspace"><div className="ciit-content"><div className="ciit-page-transition"><div className="ciit-student-portal ciit-student-public-content">

          {!studentId && <div className="sp-alert" role="status">
            Your login was successful, but a student ID was not provided by the authentication service.
            Student records cannot be safely linked without it.
          </div>}
          {recordLoading && <div className="sp-alert" role="status">Loading your registration information…</div>}
          {recordError && <div className="sp-alert" role="alert">{recordError}</div>}
          {activeSection === 'student-profile' && (
            <div className="sp-my-profile" id="student-profile">
              
              <section className="sp-panel sp-profile-glass" aria-labelledby="sp-profile-details-title">
                <div className="sp-my-profile-photo">
                  <div className="sp-my-profile-avatar">
                    {profilePhoto ? <img src={profilePhoto} alt="Your selected profile photo" /> : studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="sp-my-profile-identity">
                    <h2>{studentName}</h2>
                    <p>{studentCode || 'Student account'}</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sp-profile-file-input"
                      id="sp-profile-photo-input"
                      onChange={selectPhoto}
                      disabled={!studentId}
                    />
                    <label htmlFor="sp-profile-photo-input" className="sp-profile-upload-button">Choose profile photo</label>
                    {profilePhoto && (
                      <button type="button" className="btn btn-outline-danger btn-sm ms-2" onClick={() => void handleRemovePhoto()}>
                        Remove photo
                      </button>
                    )}
                    <p className="sp-muted">JPG, PNG or WebP · Max 2 MB · Uploads to your student profile</p>
                    {photoMessage && <p role="status" className="sp-muted">{photoMessage}</p>}
                  </div>
                </div>
                <div className="sp-profile-divider" aria-hidden="true" />
                <h2 id="sp-profile-details-title" className="sp-profile-details-title">Personal Details</h2>
                <dl className="sp-details sp-profile-details">
                  <div><dt>Student code</dt><dd>{display(studentCode)}</dd></div>
                  <div><dt>Full name</dt><dd>{studentName}</dd></div>
                  <div><dt>Email</dt><dd>{display(readField(studentRecord, 'emailAddress', 'email_Address') || identity.email || session.email)}</dd></div>
                  <div><dt>Mobile number</dt><dd>{display(readField(studentRecord, 'mobileNumber', 'mobile_Number'))}</dd></div>
                  <div><dt>Qualification</dt><dd>{display(qualification)}</dd></div>
                  <div><dt>Branch</dt><dd>{display(readField(studentRecord, 'branchName', 'branch_Name'))}</dd></div>
                </dl>
                {!isEditing && <button type="button" className="btn btn-primary mt-3" onClick={() => void beginProfileEdit()} disabled={!studentId}>Edit profile</button>}
                {isEditing && <form className="sp-stack mt-3" onSubmit={saveProfile}>
                  {([
                    ['studentName', 'Full name'],
                    ['emailAddress', 'Email'],
                    ['mobileNumber', 'Mobile number'],
                    ['qualification', 'Qualification'],
                  ] as const).map(([key, label]) => <label key={key}>{label}
                    <input className="form-control" value={editFields[key]} onChange={event => setEditFields(current => ({ ...current, [key]: event.target.value }))} disabled={isSaving} />
                  </label>)}
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save changes'}</button>
                    <button type="button" className="btn btn-outline-secondary" disabled={isSaving} onClick={() => setIsEditing(false)}>Cancel</button>
                  </div>
                </form>}
                {editMessage && <p role="status" className="sp-muted mt-2">{editMessage}</p>}
              </section>
              <section className="sp-panel"><h2>Change Password</h2><p className="sp-muted">Student password changes are not yet available. The existing ERP change-password API belongs to staff accounts and cannot safely be used for student credentials.</p></section>
            </div>
          )}
          {activeSection === 'student-overview' && (
            <StudentDashboard
              studentRecordLoaded={studentRecord !== null}
              loading={recordLoading}
              courseRows={courseRows}
              batchRows={batchRows}
              batchesLoading={batchesLoading}
              batchesError={batchesError}
              paymentRows={paymentRows}
              totalPaid={totalPaid}
            />
          )}
          {activeSection === 'student-course' && (
            <div className="sp-section-page">
              
              <section id="student-course" className="sp-panel">
              <h2>Courses ({courseRows.length})</h2>
              {courseRows.length ? <div className="sp-stack">{courseRows.map((row, index) => {
                const payments = nestedRows(row, 'payments', 'Payments');
                const paid = payments.reduce((sum, payment) => sum + (Number(readField(payment, 'paymentAmount', 'payment_Amount')) || 0), 0);
                const key = `course-${String(readField(row, 'registrationId', 'registration_Id') ?? index)}`;
                const expanded = expandedDetail === key;
                return <article className="sp-entry sp-student-detail-card" key={key}>
                  <button type="button" className="sp-student-detail-toggle" aria-expanded={expanded} aria-controls={`detail-${key}`} onClick={() => toggleDetail(key)}>
                    <span className="sp-student-detail-main"><strong>{display(readField(row, 'courseName', 'course_Name'))}</strong><small>Amount Paid: {currency(paid)}</small></span>
                    <span className="sp-student-detail-actions"><span className="sp-student-status">{display(readField(row, 'currentStatus', 'current_Status', 'status'))}</span><i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" /></span>
                  </button>
                  {expanded && <dl className="sp-student-detail-grid" id={`detail-${key}`}>
                    <div><dt>Course ID</dt><dd>{display(readField(row, 'courseId', 'course_Id'))}</dd></div>
                    <div><dt>Registration code</dt><dd>{display(readField(row, 'registrationCode', 'registration_Code'))}</dd></div>
                    <div><dt>Registration date</dt><dd>{formatStudentDate(readField(row, 'registrationDate', 'registration_Date'))}</dd></div>
                    <div><dt>Course Fee</dt><dd>{(() => {
                      const registrationId = Number(readField(row, 'registrationId', 'registration_Id'));
                      const detail = paymentDetails?.find(payment => Number(readField(payment, 'registrationId', 'registration_Id')) === registrationId);
                      const finalFees = readField(detail ?? null, 'finalFees', 'final_Fees') ??
                        readField(row, 'finalFees', 'final_Fees');
                      const balance = readField(detail ?? null, 'remainingBalance', 'remaining_Balance') ??
                        readField(row, 'remainingBalance', 'remaining_Balance');
                      if (finalFees !== null && Number.isFinite(Number(finalFees))) return currency(Number(finalFees));
                      if (balance !== null && Number.isFinite(Number(balance))) {
                        const totalPaid = readField(detail ?? null, 'totalPaid', 'total_Paid');
                        return currency((totalPaid !== null ? Number(totalPaid) : paid) + Number(balance));
                      }
                      return 'Not available';
                    })()}</dd></div>
                    <div><dt>Discount</dt><dd>{currency(Number(readField(row, 'discount')) || 0)}</dd></div>
                    <div><dt>Amount Paid</dt><dd>{currency(paid)}</dd></div>
                    <div><dt>Remaining Balance</dt><dd>{(() => {
                      const registrationId = Number(readField(row, 'registrationId', 'registration_Id'));
                      const detail = paymentDetails?.find(payment => Number(readField(payment, 'registrationId', 'registration_Id')) === registrationId);
                      const balance = readField(detail ?? null, 'remainingBalance', 'remaining_Balance') ??
                        readField(row, 'remainingBalance', 'remaining_Balance');
                      return balance === null ? 'Not available' : currency(Number(balance));
                    })()}</dd></div>
                  </dl>}
                </article>;
              })}</div> : <p className="sp-muted">No course records available from your student registration details.</p>}
            </section>
            </div>
          )}
          {activeSection === 'student-batch' && (
            <div className="sp-section-page">
              
              <section id="student-batch" className="sp-panel">
              <h2>Batches</h2>
              {(recordLoading || batchesLoading) && <p className="sp-muted" role="status">Loading your assigned batches…</p>}
              {batchesError && <div className="sp-alert" role="alert">{batchesError}</div>}
              {!recordLoading && !recordError && !batchesLoading && !batchesError && (batchRows.length
                ? <div className="sp-stack">{batchRows.map((row, index) => {
                    const batch = asRecord(readField(row, 'batch', 'Batch'));
                    const details = batch ? { ...row, ...batch } : row;
                    const course = readField(details, 'courseName', 'course_Name', 'course_name');
                    const topic = readField(details, 'topicName', 'topic_Name', 'topic_name');
                    const start = readField(details, 'startDate', 'start_date', 'start_Date');
                    const end = readField(details, 'endDate', 'end_date', 'end_Date');
                    const status = readField(details, 'status', 'batchStatus', 'batch_status');
                    return <article className="sp-entry" key={String(readField(details, 'batchId', 'batch_Id', 'batch_id') ?? index) + '-' + index}>
                      <h3>{display(readField(details, 'batchName', 'batch_Name', 'batch_name', 'BatchName'))}</h3>
                      <p>Time: {display(readField(details, 'batchTime', 'batch_Time', 'batch_time'))}</p>
                      {course !== null && <p>Course: {display(course)}</p>}
                      {topic !== null && <p>Topic: {display(topic)}</p>}
                      {start !== null && <p>Start date: {formatStudentDate(start)}</p>}
                      {end !== null && <p>End date: {formatStudentDate(end)}</p>}
                      {status !== null && <p>Status: {display(status)}</p>}
                    </article>;
                  })}</div>
                : <p className="sp-muted">No batches have been assigned to your student account yet.</p>
              )}
            </section>
            </div>
          )}
          {activeSection === 'student-payments' && (
            <div className="sp-section-page">
              
              <section id="student-payments" className="sp-panel">
              <div className="sp-student-payment-summary"><div><span>Total Amount Paid</span><strong>{currency(totalPaid)}</strong></div><div><span>Payment entries</span><strong>{paymentRows.length}</strong></div></div>
              <h2>Payment history</h2>
              {paymentRows.length ? <div className="sp-stack">{paymentRows.map((row, index) => {
                const id = readField(row, 'paymentId', 'payment_Id');
                const registration = courseRows.find(course => nestedRows(course, 'payments', 'Payments').some(payment => String(readField(payment, 'paymentId', 'payment_Id')) === String(id)));
                const key = `payment-${String(id ?? index)}`;
                const expanded = expandedDetail === key;
                return <article className="sp-entry sp-student-detail-card" key={key}>
                  <button type="button" className="sp-student-detail-toggle" aria-expanded={expanded} aria-controls={`detail-${key}`} onClick={() => toggleDetail(key)}>
                    <span className="sp-student-detail-main"><strong>{registration ? display(readField(registration, 'courseName', 'course_Name')) : 'Course payment'}</strong><small>{formatStudentDate(readField(row, 'paymentDate', 'payment_Date'))}</small></span>
                    <span className="sp-student-detail-actions"><strong>{currency(Number(readField(row, 'paymentAmount', 'payment_Amount')) || 0)}</strong><i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" /></span>
                  </button>
                  {expanded && <dl className="sp-student-detail-grid" id={`detail-${key}`}>
                    <div><dt>Payment ID</dt><dd>{display(id)}</dd></div>
                    <div><dt>Registration code</dt><dd>{display(registration ? readField(registration, 'registrationCode', 'registration_Code') : null)}</dd></div>
                    <div><dt>Payment date</dt><dd>{formatStudentDate(readField(row, 'paymentDate', 'payment_Date'))}</dd></div>
                    <div><dt>Payment mode</dt><dd>{display(readField(row, 'paymentMode', 'payment_Mode'))}</dd></div>
                    <div className="sp-student-detail-wide"><dt>Description</dt><dd>{display(readField(row, 'paymentDescription', 'payment_Description'))}</dd></div>
                  </dl>}
                </article>;
              })}</div> : <p className="sp-muted">No payment records available from your registration details.</p>}
              <p className="sp-muted">Attendance will appear when a student-scoped attendance API is available.</p>
            </section>
            </div>
          )}
        </div></div></div></main>
      </div>
    </div>
  );
}
