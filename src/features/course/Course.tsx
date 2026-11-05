import RowActionsMenu from '@/components/RowActionsMenu';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { courseApi, type TrainingCourseRecord } from '@/api/courseApi';
import { PERMISSIONS, permissionService } from '@/core/services/permissionService';
import { usePermissionVersion } from '@/core/auth/hooks';
import './Course.css';

type CourseForm = {
  courseName: string;
  feesAmount: string;
  feesChangeDate: string;
  installmentPercentage: string;
};
const EMPTY_FORM: CourseForm = { courseName: '', feesAmount: '', feesChangeDate: '', installmentPercentage: '' };

function dateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export default function Course() {
  usePermissionVersion();
  const [courses, setCourses] = useState<TrainingCourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canCreate = permissionService.hasPermission(PERMISSIONS.COURSE_CREATE);
  const canUpdate = permissionService.hasPermission(PERMISSIONS.COURSE_UPDATE);
  const canDelete = permissionService.hasPermission(PERMISSIONS.COURSE_DELETE);
  const canRestore = permissionService.hasPermission(PERMISSIONS.COURSE_RESTORE);

  async function loadCourses() {
    setError('');
    try { setCourses(await courseApi.getAll()); }
    catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load courses.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const cached = courseApi.getCached();
    if (cached.length) { setCourses(cached); setLoading(false); }
    void loadCourses();
  }, []);

  const filtered = useMemo(() => courses.filter((course) => {
    const matchesSearch = course.courseName.toLowerCase().includes(search.trim().toLowerCase());
    const deleted = Boolean(course.deletedAt);
    return matchesSearch && (showDeleted ? deleted : !deleted);
  }), [courses, search, showDeleted]);

  function openAdd() {
    setEditingId(null); setForm(EMPTY_FORM); setError(''); setSuccess(''); setModalOpen(true);
  }
  function openEdit(course: TrainingCourseRecord) {
    setEditingId(course.courseId);
    setForm({
      courseName: course.courseName,
      feesAmount: course.feesAmount == null ? '' : String(course.feesAmount),
      feesChangeDate: dateInput(course.feesChangeDate),
      installmentPercentage: course.installmentPercentage == null ? '' : String(course.installmentPercentage),
    });
    setError(''); setSuccess(''); setModalOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    const fees = form.feesAmount.trim() === '' ? null : Number(form.feesAmount);
    const installment = form.installmentPercentage.trim() === '' ? null : Number(form.installmentPercentage);
    if (!form.courseName.trim() || (fees !== null && (!Number.isFinite(fees) || fees < 0)) ||
        (installment !== null && (!Number.isFinite(installment) || installment < 0 || installment > 100))) {
      setError('Enter a course name, valid fee amount, and installment percentage between 0 and 100.');
      return;
    }
    setSaving(true);
    const course: TrainingCourseRecord = {
      courseId: editingId ?? 0,
      courseName: form.courseName.trim(),
      feesAmount: fees,
      feesChangeDate: form.feesChangeDate ? new Date(`${form.feesChangeDate}T00:00:00`).toISOString() : null,
      installmentPercentage: installment,
    };
    try {
      if (editingId !== null) await courseApi.update(editingId, course);
      else {
        const created = await courseApi.create(course);
        const createdId = Number(created?.courseId ?? created?.data?.courseId ?? created?.id);
        // Preserve Angular's create-then-update behavior when the API returns an ID.
        if (createdId > 0) await courseApi.update(createdId, { ...course, courseId: createdId });
      }
      setModalOpen(false); setForm(EMPTY_FORM); setSuccess(editingId === null ? 'Course created successfully.' : 'Course updated successfully.');
      await loadCourses();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to save the course.');
    } finally { setSaving(false); }
  }

  async function remove(course: TrainingCourseRecord) {
    if (!window.confirm(`Delete course "${course.courseName}"?`)) return;
    setError(''); setSuccess('');
    try { await courseApi.remove(course.courseId); setSuccess('Course deleted.'); await loadCourses(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Course deletion failed.'); }
  }
  async function restore(course: TrainingCourseRecord) {
    if (!window.confirm(`Restore course "${course.courseName}"?`)) return;
    setError(''); setSuccess('');
    try { await courseApi.restore(course.courseId); setSuccess('Course restored.'); await loadCourses(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Course restore failed.'); }
  }

  return <section className="course-page">
    <header className="course-header"><div><h1>Training Courses</h1><p>Manage courses, fees, and installment settings</p></div>
      {canCreate && <button className="course-primary-btn" type="button" onClick={openAdd}>+ Add Course</button>}
    </header>
    {error && <div className="course-alert error" role="alert">{error}</div>}
    {success && <div className="course-alert success" role="status">{success}</div>}
    <div className="course-toolbar"><input aria-label="Search courses" placeholder="Search course name..." value={search} onChange={(event) => setSearch(event.target.value)} />
      <label><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Show deleted courses</label>
      <span>{filtered.length} courses</span></div>
    <div className="course-table-card"><div className="course-table-scroll"><table className="course-table">
      <thead><tr><th>#</th><th>Course Name</th><th>Fees Amount</th><th>Fees Change Date</th><th>Installment %</th><th>Action</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={6} className="course-empty">Loading courses...</td></tr> :
        filtered.map((course, index) => <tr key={course.courseId}><td>{index + 1}</td><td className="course-name">{course.courseName}</td><td>{course.feesAmount == null ? '—' : course.feesAmount.toLocaleString('en-IN')}</td><td>{course.feesChangeDate ? new Date(course.feesChangeDate).toLocaleDateString('en-GB') : '—'}</td><td>{course.installmentPercentage == null ? '—' : `${course.installmentPercentage}%`}</td>
          <td><RowActionsMenu label={`Actions for ${course.courseName}`} actions={course.deletedAt ? (canRestore ? [{ label: 'Restore', onSelect: () => void restore(course) }] : []) : [
              ...(canUpdate ? [{ label: 'Edit', onSelect: () => openEdit(course) }] : []),
              ...(canDelete ? [{ label: 'Delete', danger: true, onSelect: () => void remove(course) }] : []),
            ]} /></td></tr>)}
        {!loading && filtered.length === 0 && <tr><td colSpan={6} className="course-empty">No courses found.</td></tr>}
      </tbody>
    </table></div></div>
    {modalOpen && createPortal(<div className="course-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
      <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title">
        <header><div><h2 id="course-modal-title">{editingId === null ? 'Add Course' : 'Edit Course'}</h2><p>Course details and fee settings</p></div><button type="button" aria-label="Close" disabled={saving} onClick={() => setModalOpen(false)}>×</button></header>
        <form onSubmit={submit}><div className="course-form-grid">
          <label>Course Name *<input required minLength={2} value={form.courseName} onChange={(event) => setForm({ ...form, courseName: event.target.value })} /></label>
          <label>Fees Amount<input type="number" min="0" step="0.01" value={form.feesAmount} onChange={(event) => setForm({ ...form, feesAmount: event.target.value })} /></label>
          <label>Fees Change Date<input type="date" value={form.feesChangeDate} onChange={(event) => setForm({ ...form, feesChangeDate: event.target.value })} /></label>
          <label>Installment Percentage<input type="number" min="0" max="100" step="0.01" value={form.installmentPercentage} onChange={(event) => setForm({ ...form, installmentPercentage: event.target.value })} /></label>
        </div>
        {error && <div className="course-alert error" role="alert">{error}</div>}
        <footer><button className="course-secondary-btn" type="button" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button><button className="course-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Course'}</button></footer></form>
      </section>
    </div>, document.body)}
  </section>;
}
