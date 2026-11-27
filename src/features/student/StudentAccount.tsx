import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { authService } from '@/core/auth/authService';
import { useSession } from '@/core/auth/hooks';
import { readTokenIdentity } from '@/core/auth/tokenIdentity';
import { tokenService } from '@/core/services/tokenService';
import { studentApi } from '@/api/studentApi';
import { apiErrorMessage, httpStatus } from '@/core/http/errors';
import { downloadPremiumPaymentReceipt } from './paymentReceiptPdf';
import { API_ORIGINS } from '@/core/config/api-services';
import StudentProfileEditor from './StudentProfileEditor';
import StudentChangePassword from './StudentChangePassword';
import { studentBatchApi } from '@/api/batchApi';
import { loadStudentPhoto, removeStudentPhoto, saveStudentPhoto } from './studentPhotoStorage';
import StudentDashboard from './StudentDashboard';
import StudentBatchAttendance from './StudentBatchAttendance';
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

function profilePhotoSource(row: StudentRecord | null): string | null {
  const value = readField(row, 'profilePhotoUrl', 'profilePhotoURL', 'photoUrl', 'photoURL', 'profilePhoto', 'photoPath', 'ProfilePhoto');
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (/^https:\/\//i.test(url) || /^data:image\/(?:jpeg|png|webp);base64,/i.test(url)) return url;
  if ((url.startsWith('/') || /^[a-z0-9_-]+\//i.test(url)) && !url.includes('..') && !url.includes('\\')) {
    return API_ORIGINS.student + '/' + url.replace(/^\//, '');
  }
  return null;
}

function formatStudentDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return display(value);
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function comparePaymentsNewestFirst(first: StudentRecord, second: StudentRecord): number {
  const dateKeys = ['paymentDate', 'payment_Date', 'payment_date', 'PaymentDate'];
  const firstDate = String(readField(first, ...dateKeys) ?? '').trim().replace(' ', 'T');
  const secondDate = String(readField(second, ...dateKeys) ?? '').trim().replace(' ', 'T');
  const byDate = secondDate.localeCompare(firstDate);
  if (byDate !== 0) return byDate;

  const paymentIds = ['paymentId', 'payment_Id', 'payment_id', 'PaymentId'];
  return Number(readField(second, ...paymentIds) ?? 0) - Number(readField(first, ...paymentIds) ?? 0);
}

function nestedRows(row: StudentRecord | null, ...keys: string[]): StudentRecord[] {
  const entries = readField(row, ...keys);
  return Array.isArray(entries) ? entries.filter((item): item is StudentRecord => asRecord(item) !== null) : [];
}

const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const currency = (amount: number) => currencyFormatter.format(amount);

function courseDetailKey(row: StudentRecord, index: number): string {
  return `course-${String(readField(row, 'registrationId', 'registration_Id') ?? index)}`;
}

function coursePaymentIds(row: StudentRecord): number[] {
  return [...new Set(nestedRows(row, 'payments', 'Payments')
    .map(payment => Number(readField(payment, 'paymentId', 'payment_Id'))))]
    .filter(id => Number.isInteger(id) && id > 0);
}

export default function StudentAccount() {
  const session = useSession();
  const [identity] = useState(() => readTokenIdentity(tokenService.getAccessToken() ?? ''));
  // StudentLogin returns studentId in its response body, not necessarily in JWT claims.
  const studentId = identity.studentId ?? session.currentUser?.studentId ?? null;
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentRecord | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(Boolean(studentId));
  const [detailsError, setDetailsError] = useState('');
  const [recordLoading, setRecordLoading] = useState(Boolean(studentId));
  const [recordError, setRecordError] = useState('');
  const [myBatchResult, setMyBatchResult] = useState<{ studentId: number; rows: StudentRecord[] } | null>(null);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState('');
  const [batchLookupAttempt, setBatchLookupAttempt] = useState(0);
  const [registrationLookupAttempt, setRegistrationLookupAttempt] = useState(0);
  const [coursePaymentDetails, setCoursePaymentDetails] = useState<{
    registration: StudentRecord;
    rowsByCourse: Record<string, StudentRecord[]>;
  } | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [expandedAttendanceBatch, setExpandedAttendanceBatch] = useState<string | null>(null);
  const [invoiceDownloadingId, setInvoiceDownloadingId] = useState<number | null>(null);
  const [invoiceError, setInvoiceError] = useAutoDismissMessage<{ paymentId: number; message: string } | null>(null);

  async function downloadPaymentInvoice(
    paymentId: number,
    registrationId: number,
    payment: StudentRecord,
    registration: StudentRecord | null,
  ): Promise<void> {
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0 ||
        !Number.isSafeInteger(registrationId) || registrationId <= 0 ||
        !studentId || invoiceDownloadingId !== null) return;

    setInvoiceError(null);
    setInvoiceDownloadingId(paymentId);
    try {
      const result = await downloadPremiumPaymentReceipt({
        paymentId,
        registrationId,
        studentId: Number(studentId),
        payment,
        student: studentRecord,
        profile: studentDetails,
        registration,
      });
      if (result === 'official') {
        setInvoiceError({ paymentId, message: 'The official receipt was downloaded because the full premium receipt details were unavailable.' });
      }
    } catch (error) {
      console.error('Student invoice download failed:', error);
      setInvoiceError({ paymentId, message: apiErrorMessage(error, 'Receipt PDF could not be generated. Please try again.') });
    } finally {
      setInvoiceDownloadingId(null);
    }
  }

  function toggleDetail(key: string) {
    setExpandedDetail(current => current === key ? null : key);
  }
  const { page } = useParams<{ page: string }>();
  const { hash } = useLocation();
  const legacyPage = sections.find(section => '#' + section.id === hash)?.slug;
  const activeSection = sections.find(section => section.slug === (page ?? legacyPage ?? 'dashboard'))?.id;
  const showingCourses = activeSection === 'student-course';
  useEffect(() => {
    setExpandedAttendanceBatch(null);
  }, [activeSection, studentId, session.generation]);
  const showingBatches = activeSection === 'student-batch' || activeSection === 'student-overview';
  const paymentDetails = coursePaymentDetails?.registration === studentRecord && expandedDetail
    ? coursePaymentDetails.rowsByCourse[expandedDetail]
    : undefined;

  // Start each routed page at the top, even when navigating from a scrolled view.
  useEffect(() => { window.scrollTo(0, 0); }, [page, hash]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useAutoDismissMessage();
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoUploadLock = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = ++photoRevision.current;
    setProfilePhoto(null);
    setPhotoMessage('');
    setStudentDetails(null);
    setDetailsError('');
    setDetailsLoading(Boolean(studentId));

    if (studentId) {
      Promise.allSettled([studentApi.getStudentDetailsById(studentId), loadStudentPhoto(studentId)])
        .then(([detailsResult, cachedPhotoResult]) => {
          if (!active) return;
          const localPhoto = cachedPhotoResult.status === 'fulfilled' ? cachedPhotoResult.value : null;
          if (detailsResult.status === 'fulfilled') {
            const details = ownedRegistrationResponse(detailsResult.value, studentId);
            if (details) {
              setStudentDetails(details);
              if (revision === photoRevision.current) setProfilePhoto(profilePhotoSource(details) ?? localPhoto);
            } else {
              setDetailsError('Student details could not be matched to your signed-in account.');
              if (revision === photoRevision.current) setProfilePhoto(localPhoto);
            }
          } else {
            setDetailsError(apiErrorMessage(detailsResult.reason, 'Editable student details are currently unavailable.'));
            if (revision === photoRevision.current) setProfilePhoto(localPhoto);
          }
        })
        .finally(() => {
          if (active) setDetailsLoading(false);
        });
    }

    return () => { active = false; };
  }, [studentId]);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (photoUploadLock.current) return;
    if (!studentId) {
      setPhotoMessage('Your student account could not be identified. Please sign in again.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 4 * 1024 * 1024) {
      setPhotoMessage('Choose a JPG, PNG or WebP image between 1 byte and 4 MB.');
      return;
    }

    photoUploadLock.current = true;
    setPhotoUploading(true);
    const revision = ++photoRevision.current;
    setPhotoMessage('');
    try {
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result) : reject(new Error('Image preview unavailable'));
        reader.onerror = () => reject(new Error('Image preview unavailable'));
        reader.readAsDataURL(file);
      });
      if (revision !== photoRevision.current) return;
      await studentApi.uploadMyProfilePhoto(file);
      if (revision !== photoRevision.current) return;
      setProfilePhoto(photo);
      await saveStudentPhoto(studentId, photo).catch(() => {
        // The backend upload succeeded; browser cache is only a fallback.
      });
      if (revision === photoRevision.current) {
        setPhotoMessage('Photo uploaded to your student account successfully.');
      }
      // Re-read the server-backed profile so its photo URL is available on later visits.
      studentApi.getStudentDetailsById(studentId)
        .then(response => {
          if (revision !== photoRevision.current) return;
          const details = ownedRegistrationResponse(response, studentId);
          if (details) setStudentDetails(details);
        })
        .catch(() => { /* Upload already succeeded; the local preview remains visible. */ });
    } catch (error) {
      if (revision === photoRevision.current) {
        setPhotoMessage(apiErrorMessage(error, 'Photo upload failed. No new photo was saved.'));
      }
    } finally {
      photoUploadLock.current = false;
      setPhotoUploading(false);
    }
  }

  function handlePhotoDisplayError() {
    setProfilePhoto(null);
    setPhotoMessage('Profile photo could not be displayed. You can upload a new image.');
  }

  async function handleRemovePhoto() {
    if (!studentId || !profilePhoto) return;
    const revision = ++photoRevision.current;
    try {
      await removeStudentPhoto(studentId);
      if (revision !== photoRevision.current) return;
      setProfilePhoto(profilePhotoSource(studentDetails));
      setPhotoMessage('Local photo cache cleared. Server-uploaded photos are not deleted.');
      if (photoInputRef.current) photoInputRef.current.value = '';
    } catch {
      if (revision === photoRevision.current) setPhotoMessage('Could not clear the local photo cache.');
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
    setRecordLoading(true);
    setRecordError('');
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
      .catch((error: unknown) => {
        if (active) setRecordError(apiErrorMessage(error, 'Registration details are currently unavailable.'));
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });

    return () => { active = false; };
  }, [studentId, registrationLookupAttempt]);

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
        const status = httpStatus(error);
        setBatchesError(apiErrorMessage(error, status === 404
          ? 'The batch service could not find your assigned batch (404). Please retry or contact your institute.'
          : status === 403
            ? 'The batch service did not allow access to your assigned batches (403).'
            : 'Your assigned batches could not be loaded. Please try again.'));
      })
      .finally(() => {
        if (active) setBatchesLoading(false);
      });

    return () => { active = false; };
  }, [showingBatches, studentId, studentRecord, myBatchResult?.studentId, batchLookupAttempt]);

  // Fee and balance enrichment is only rendered for an expanded course.
  // Keep the results scoped to the verified registration snapshot and card.
  useEffect(() => {
    if (!showingCourses || !studentId || !studentRecord || !expandedDetail?.startsWith('course-') ||
        paymentDetails !== undefined) return;

    const record = studentRecord;
    const key = expandedDetail;
    const owned = nestedRows(record, 'registrations', 'Registrations').filter(row => {
      const owner = readField(row, 'studentId', 'student_Id', 'student_id', 'StudentId');
      return owner === null || Number(owner) === studentId;
    });
    const selected = owned.find((row, index) => courseDetailKey(row, index) === key);
    if (!selected) return;
    const registrationId = Number(readField(selected, 'registrationId', 'registration_Id'));
    const paymentIds = coursePaymentIds(selected);
    if (!Number.isInteger(registrationId) || registrationId <= 0 || !paymentIds.length) return;

    let active = true;
    async function loadPaymentDetails() {
      const verified: StudentRecord[] = [];
      // Bound concurrent requests while preserving payment ordering.
      for (let index = 0; active && index < paymentIds.length; index += 4) {
        const results = await Promise.allSettled(paymentIds.slice(index, index + 4).map(id => studentApi.getPaymentById(id)));
        if (!active) return;
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const payment = asRecord(result.value);
          if (!payment || Number(readField(payment, 'studentId', 'student_Id')) !== studentId ||
              Number(readField(payment, 'registrationId', 'registration_Id')) !== registrationId) continue;
          verified.push(payment);
        }
      }
      if (!active) return;
      setCoursePaymentDetails(previous => ({
        registration: record,
        rowsByCourse: {
          ...(previous?.registration === record ? previous.rowsByCourse : {}),
          [key]: verified,
        },
      }));
    }

    void loadPaymentDetails();
    return () => { active = false; };
  }, [showingCourses, studentId, studentRecord, expandedDetail, paymentDetails]);

  const studentName = display(
    readField(studentDetails, 'studentName', 'student_Name', 'name') ||
    readField(studentRecord, 'studentName', 'student_Name', 'name') ||
    identity.displayName || session.employeeName || session.username,
  );
  const qualifications = nestedRows(studentRecord, 'qualifications', 'Qualifications');
  const qualification = readField(
    studentDetails,
    'qualification', 'qualificationName', 'qualification_Name', 'qualification_name', 'Qualification', 'QualificationName',
  ) ?? readField(
    studentRecord,
    'qualification',
    'qualificationName',
    'qualification_Name',
    'qualification_name',
    'Qualification',
    'QualificationName',
  ) ?? readField(qualifications[0] ?? null, 'qualification_Name', 'qualificationName', 'qualification_name', 'QualificationName');

  const studentCode = identity.username || session.username;
  const { registrations, courseRows, paymentRows, batchRows, ownedRegistrationIds } = useMemo(() => {
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
    // A failed batch lookup must not hide assignments already returned by
    // the verified student registration response.
    const registrationMatchesStudent = !!studentId &&
      Number(readField(studentRecord, 'studentId', 'student_Id', 'student_id', 'StudentId')) === studentId;
    const ownedRegistrationIds = new Set(
      [...courseRows, ...(studentRecord ? [studentRecord] : [])]
        .filter(belongsToStudent)
        .map(row => Number(readField(row, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId')))
        .filter(id => Number.isSafeInteger(id) && id > 0),
    );
    const batchRows = myBatchResult?.studentId === studentId
      ? myBatchResult.rows
      : registrationMatchesStudent
        ? [
            ...nestedRows(studentRecord, 'batches', 'Batches'),
            ...courseRows.flatMap((row) => nestedRows(row, 'batches', 'Batches')),
          ].filter(row => {
            if (!belongsToStudent(row)) return false;
            const registrationId = readField(row, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId');
            return registrationId === null || ownedRegistrationIds.has(Number(registrationId));
          })
        : [];
    return { registrations, courseRows, paymentRows, batchRows, ownedRegistrationIds };
  }, [studentId, studentRecord, myBatchResult]);
  const totalPaid = paymentRows.reduce((sum, row) =>
    sum + (Number(readField(row, 'paymentAmount', 'payment_Amount')) || 0), 0);
  const newestPayments = useMemo(() => [...paymentRows].sort(comparePaymentsNewestFirst), [paymentRows]);

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
            <span className="ciit-sidebar-avatar">{profilePhoto ? <img src={profilePhoto} alt="" className="sp-profile-avatar-image" onError={handlePhotoDisplayError} /> : studentName.charAt(0).toUpperCase()}</span>
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
          {recordError && <AutoDismissAlert className="sp-alert" message={recordError} />}
          {activeSection === 'student-profile' && (
            <div className="sp-my-profile" id="student-profile">
              
              <section className="sp-panel sp-profile-glass" aria-labelledby="sp-profile-details-title">
                <div className="sp-my-profile-photo">
                  <div className="sp-my-profile-avatar">
                    {profilePhoto ? <img src={profilePhoto} alt="Your selected profile photo" onError={handlePhotoDisplayError} /> : studentName.charAt(0).toUpperCase()}
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
                      disabled={!studentId || photoUploading}
                    />
                    <label htmlFor="sp-profile-photo-input" className="sp-profile-upload-button">{photoUploading ? 'Uploading…' : 'Upload profile photo'}</label>
                    {profilePhoto && (
                      <button type="button" className="btn btn-outline-danger btn-sm ms-2" onClick={() => void handleRemovePhoto()}>
                        Clear local photo
                      </button>
                    )}
                    <p className="sp-muted">JPG, PNG or WebP · Max 4 MB · Uploads to your student account</p>
                    {(photoUploading || photoMessage) && <p role="status" className="sp-muted">{photoUploading ? 'Uploading profile photo…' : photoMessage}</p>}
                  </div>
                </div>
                <div className="sp-profile-divider" aria-hidden="true" />
                <h2 id="sp-profile-details-title" className="sp-profile-details-title">Personal Details</h2>
                <dl className="sp-details sp-profile-details">
                  <div><dt>Student code</dt><dd>{display(studentCode)}</dd></div>
                  <div><dt>Full name</dt><dd>{studentName}</dd></div>
                  <div><dt>Email</dt><dd>{display(readField(studentDetails, 'emailAddress', 'email_Address') || readField(studentRecord, 'emailAddress', 'email_Address') || identity.email || session.email)}</dd></div>
                  <div><dt>Mobile number</dt><dd>{display(readField(studentDetails, 'mobileNumber', 'mobile_Number') ?? readField(studentRecord, 'mobileNumber', 'mobile_Number'))}</dd></div>
                  <div><dt>Qualification</dt><dd>{display(qualification)}</dd></div>
                  <div><dt>Branch</dt><dd>{display(readField(studentRecord, 'branchName', 'branch_Name'))}</dd></div>
                </dl>
                <StudentProfileEditor
                  studentId={studentId}
                  profile={studentDetails}
                  registration={studentRecord}
                  loading={detailsLoading}
                  error={detailsError}
                  onSaved={updated => setStudentDetails(current => current ? { ...current, ...updated } : current)}
                />
              </section>
              <StudentChangePassword key={session.generation} />
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
                const key = courseDetailKey(row, index);
                const expanded = expandedDetail === key;
                const registrationId = Number(readField(row, 'registrationId', 'registration_Id'));
                const detailsPending = expanded && paymentDetails === undefined && coursePaymentIds(row).length > 0 &&
                  Number.isInteger(registrationId) && registrationId > 0 && registrations.includes(row);
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
                      return detailsPending ? 'Loading…' : 'Not available';
                    })()}</dd></div>
                    <div><dt>Discount</dt><dd>{currency(Number(readField(row, 'discount')) || 0)}</dd></div>
                    <div><dt>Amount Paid</dt><dd>{currency(paid)}</dd></div>
                    <div><dt>Remaining Balance</dt><dd>{(() => {
                      const registrationId = Number(readField(row, 'registrationId', 'registration_Id'));
                      const detail = paymentDetails?.find(payment => Number(readField(payment, 'registrationId', 'registration_Id')) === registrationId);
                      const balance = readField(detail ?? null, 'remainingBalance', 'remaining_Balance') ??
                        readField(row, 'remainingBalance', 'remaining_Balance');
                      return balance === null ? (detailsPending ? 'Loading…' : 'Not available') : currency(Number(balance));
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
              {recordError && !recordLoading && (
                <div className="sp-batch-attendance-content">
                  <p className="sp-muted">Your registration information is unavailable.</p>
                  <button type="button" className="sp-batch-attendance-retry"
                    onClick={() => setRegistrationLookupAttempt(attempt => attempt + 1)}>Retry registration</button>
                </div>
              )}
              {batchesError && !batchesLoading && (
                <AutoDismissAlert className="sp-alert" message={batchesError}>
                  <button type="button" className="sp-batch-attendance-retry"
                    onClick={() => setBatchLookupAttempt(attempt => attempt + 1)}>Retry batches</button>
                </AutoDismissAlert>
              )}
              {!recordLoading && !recordError && !batchesLoading && (batchRows.length
                ? <div className="sp-stack">{batchRows.map((row, index) => {
                    const batch = asRecord(readField(row, 'batch', 'Batch'));
                    const details = batch ? { ...row, ...batch } : row;
                    const course = readField(details, 'courseName', 'course_Name', 'course_name');
                    const topic = readField(details, 'topicName', 'topic_Name', 'topic_name');
                    const start = readField(details, 'startDate', 'start_date', 'start_Date');
                    const end = readField(details, 'endDate', 'end_date', 'end_Date');
                    const status = readField(details, 'status', 'batchStatus', 'batch_status');
                    const assignedBatchId = readField(row, 'batchId', 'batch_Id', 'batch_id', 'BatchId');
                    const nestedBatchId = readField(batch, 'batchId', 'batch_Id', 'batch_id', 'BatchId', 'id');
                    // Never substitute a batch-student assignment ID for the actual batch ID.
                    const conflictingBatchIds = assignedBatchId !== null && nestedBatchId !== null &&
                      Number(assignedBatchId) !== Number(nestedBatchId);
                    const batchId = conflictingBatchIds ? 0 : Number(nestedBatchId ?? assignedBatchId ?? 0);
                    const batchKey = `${batchId}-${index}`;
                    const expanded = expandedAttendanceBatch === batchKey;
                    const canViewAttendance = !!studentId &&
                      Number(readField(studentRecord, 'studentId', 'student_Id', 'student_id', 'StudentId')) === studentId &&
                      Number.isSafeInteger(batchId) && batchId > 0;
                    const registrationIds = [...ownedRegistrationIds];
                    return <article className="sp-entry" key={batchKey}>
                      <h3>{display(readField(details, 'batchName', 'batch_Name', 'batch_name', 'BatchName'))}</h3>
                      <p>Time: {display(readField(details, 'batchTime', 'batch_Time', 'batch_time'))}</p>
                      {course !== null && <p>Course: {display(course)}</p>}
                      {topic !== null && <p>Topic: {display(topic)}</p>}
                      {start !== null && <p>Start date: {formatStudentDate(start)}</p>}
                      {end !== null && <p>End date: {formatStudentDate(end)}</p>}
                      {status !== null && <p>Status: {display(status)}</p>}
                      {!canViewAttendance && <p className="sp-muted">Attendance is unavailable because the batch ID could not be verified.</p>}
                      {canViewAttendance && (
                        <div className="sp-batch-attendance">
                          <button type="button" className="sp-batch-attendance-toggle" aria-expanded={expanded}
                            onClick={() => setExpandedAttendanceBatch(previous => previous === batchKey ? null : batchKey)}>
                            <span><i className="bi bi-calendar-check" aria-hidden="true" /> My Attendance</span>
                            <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
                          </button>
                          {expanded && (
                            <StudentBatchAttendance key={`${studentId}-${session.generation}-${batchKey}`}
                              batchId={batchId} studentId={studentId!} registrationIds={registrationIds} />
                          )}
                        </div>
                      )}
                    </article>;
                  })}</div>
                : <p className="sp-muted">{batchesError
                    ? 'Assigned batch information is currently unavailable.'
                    : 'No batches have been assigned to your student account yet.'}</p>
              )}
            </section>
            </div>
          )}
          {activeSection === 'student-payments' && (
            <div className="sp-section-page">
              
              <section id="student-payments" className="sp-panel">
              <div className="sp-student-payment-summary"><div><span>Total Amount Paid</span><strong>{currency(totalPaid)}</strong></div><div><span>Payment entries</span><strong>{paymentRows.length}</strong></div></div>
              <h2>Payment history</h2>
              {paymentRows.length ? <div className="sp-stack">{newestPayments.map((row, index) => {
                const id = readField(row, 'paymentId', 'payment_Id');
                const paymentRegistrationId = Number(readField(row, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId') ?? 0);
                const registration = courseRows.find(course =>
                  nestedRows(course, 'payments', 'Payments').some(payment =>
                    String(readField(payment, 'paymentId', 'payment_Id', 'payment_id', 'PaymentId')) === String(id),
                  ) || (paymentRegistrationId > 0 &&
                    Number(readField(course, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId')) === paymentRegistrationId),
                );
                const paymentId = Number(id ?? 0);
                const linkedRegistrationId = Number(readField(registration ?? null, 'registrationId', 'registration_Id', 'registration_id', 'RegistrationId') ?? 0);
                const canDownloadInvoice = Number.isSafeInteger(paymentId) && paymentId > 0 &&
                  Number.isSafeInteger(linkedRegistrationId) && linkedRegistrationId > 0;
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
                  {expanded && (
                    <div className="sp-student-invoice-actions">
                      {canDownloadInvoice ? (
                        <button type="button" className="sp-student-invoice-button"
                          disabled={invoiceDownloadingId !== null}
                          onClick={() => void downloadPaymentInvoice(paymentId, linkedRegistrationId, row, registration ?? null)}>
                          <i className="bi bi-file-earmark-pdf" aria-hidden="true" />
                          {invoiceDownloadingId === paymentId ? 'Generating…' : 'Download Receipt (PDF)'}
                        </button>
                      ) : <p className="sp-muted">Invoice is unavailable for this payment.</p>}
                      {invoiceError?.paymentId === paymentId && (
                        <p className="sp-muted sp-student-invoice-error" role="alert">{invoiceError.message}</p>
                      )}
                    </div>
                  )}
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
