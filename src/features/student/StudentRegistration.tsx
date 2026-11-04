import { useEffect, useMemo, useState } from 'react';
import { studentApi, type StudentRow } from '@/api/studentApi';

export default function StudentRegistration() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [registrations, setRegistrations] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [studentResult, registrationResult] = await Promise.allSettled([
        studentApi.getStudents(),
        studentApi.getRegistrations(),
      ]);
      if (studentResult.status === 'fulfilled') setStudents(studentResult.value);
      if (registrationResult.status === 'fulfilled') setRegistrations(registrationResult.value);
      if (studentResult.status === 'rejected' || registrationResult.status === 'rejected') {
        console.error('Partial student registration data failure:', {
          students: studentResult.status === 'rejected' ? studentResult.reason : undefined,
          registrations: registrationResult.status === 'rejected' ? registrationResult.reason : undefined,
        });
        setError('Some student data could not be loaded. Successful sections are still displayed; refresh after checking the failed API request.');
      }
    } catch (err) {
      console.error('Student registration data load failed:', err);
      setError('Unable to load student data. Check the API request and your session, then retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.studentId, student.studentName, student.lastName, student.studentCode, student.mobileNumber, student.emailAddress, student.qualification, student.branchName]
        .some((value) => String(value ?? '').toLowerCase().includes(query)),
    );
  }, [students, search]);

  return <section className="container-fluid py-3">
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <div><h2 className="h4 mb-1">Student Registration</h2><p className="text-muted mb-0">Student profiles and course registration records.</p></div>
      <button className="btn btn-outline-primary" onClick={() => void loadData()} disabled={loading}>
        <i className="bi bi-arrow-clockwise me-1" /> Refresh
      </button>
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="row g-3 mb-3">
      <div className="col-sm-6 col-lg-3"><div className="card h-100"><div className="card-body"><div className="text-muted small">Total Students</div><div className="fs-3 fw-semibold">{students.length}</div></div></div></div>
      <div className="col-sm-6 col-lg-3"><div className="card h-100"><div className="card-body"><div className="text-muted small">Course Registrations</div><div className="fs-3 fw-semibold">{registrations.length}</div></div></div></div>
    </div>
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3">
        <h3 className="h6 mb-0">Student List</h3>
        <input className="form-control" style={{ maxWidth: 360 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code, mobile, email..." aria-label="Search students" />
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light"><tr><th>#</th><th>Student</th><th>Student Code</th><th>Mobile</th><th>Email</th><th>Qualification</th><th>Branch</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading student records...</td></tr>
              : filtered.length ? filtered.map((student, index) => <tr key={student.studentId}>
                <td>{index + 1}</td><td className="fw-semibold">{student.studentName} {student.lastName}</td><td>{student.studentCode || '—'}</td><td>{student.mobileNumber || '—'}</td><td>{student.emailAddress || '—'}</td><td>{student.qualification || '—'}</td><td>{student.branchName || '—'}</td>
              </tr>)
              : <tr><td colSpan={7} className="text-center text-muted py-5">{error ? 'Student data could not be retrieved.' : 'No student records found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </section>;
}
