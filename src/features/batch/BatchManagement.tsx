import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  batchApi,
  batchDirectoryApi,
  batchScheduleApi,
  batchStudentApi,
  type CreateBatchRequest,
} from '@/api/batchApi';
import './BatchManagement.css';

type BatchRow = Record<string, unknown> & { batchId: number; batchName: string; };
const read = (row: Record<string, unknown>, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '');
const idOf = (row: Record<string, unknown>) => Number(read(row, 'batch_id', 'batchId', 'BatchId', 'id') ?? 0);
const formatDate = (value: unknown) => value && !Number.isNaN(new Date(String(value)).getTime()) ? new Date(String(value)).toLocaleDateString('en-GB') : '—';
const deleted = (row: Record<string, unknown>) => Boolean(read(row, 'is_deleted', 'isDeleted', 'deleted')) || read(row, 'is_active', 'isActive') === false;

export default function BatchManagement() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [topics, setTopics] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [scheduleBatch, setScheduleBatch] = useState<BatchRow | null>(null);
  const [studentBatch, setStudentBatch] = useState<BatchRow | null>(null);
  const [registrationId, setRegistrationId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateBatchRequest>({
    batch_name: '', topic_id: 0, employee_id: 0, start_date: '', end_date: '',
    batch_time: '09:00 AM - 11:00 AM', branch_id: 0, playlist_title: '', playlist_key: '',
  });
  const [schedules, setSchedules] = useState<Record<string, unknown>[]>([]);

  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await batchApi.getAll();
      const mapped = rows.map((row) => ({
        ...row,
        batchId: idOf(row),
        batchName: String(read(row, 'batch_name', 'batchName', 'BatchName') ?? 'Unnamed Batch'),
      })).filter((row) => row.batchId > 0) as BatchRow[];
      setBatches(mapped);
      const countEntries = await Promise.all(mapped.filter((row) => !deleted(row)).map(async (row) => {
        try { return [row.batchId, (await batchStudentApi.getByBatch(row.batchId)).length] as const; }
        catch { return [row.batchId, 0] as const; }
      }));
      setCounts(Object.fromEntries(countEntries));
    } catch (requestError: any) {
      console.error('Batch list load failed:', requestError);
      setError(requestError?.response?.data?.message || 'Unable to load batches. Check the Batch API and retry.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    Promise.allSettled([batchDirectoryApi.getTopics(), batchDirectoryApi.getEmployees()]).then(([topicResult, employeeResult]) => {
      if (topicResult.status === 'fulfilled') setTopics(topicResult.value);
      if (employeeResult.status === 'fulfilled') setEmployees(employeeResult.value);
    });
  }, []);

  const active = useMemo(() => batches.filter((row) => !deleted(row)), [batches]);
  const removed = useMemo(() => batches.filter(deleted), [batches]);
  const displayed = tab === 'active' ? active : removed;

  async function generate(row: BatchRow) {
    if (!window.confirm(`Generate schedule for ${row.batchName}?`)) return;
    setSaving(true); setError('');
    try { await batchScheduleApi.generate(row.batchId); await viewSchedule(row); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to generate schedule.'); }
    finally { setSaving(false); }
  }

  async function viewSchedule(row: BatchRow) {
    setScheduleBatch(row); setError('');
    try { setSchedules(await batchScheduleApi.getByBatch(row.batchId)); }
    catch (requestError: any) { setSchedules([]); setError(requestError?.response?.data?.message || 'Unable to load batch schedule.'); }
  }

  async function remove(row: BatchRow) {
    if (!window.confirm(`Remove batch “${row.batchName}”?`)) return;
    setSaving(true);
    try { await batchApi.remove(row.batchId); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to remove batch.'); }
    finally { setSaving(false); }
  }

  async function restore(row: BatchRow) {
    setSaving(true);
    try { await batchApi.restore(row.batchId); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore batch.'); }
    finally { setSaving(false); }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentBatch || Number(registrationId) <= 0) return;
    setSaving(true);
    try {
      await batchStudentApi.create({ batch_id: studentBatch.batchId, registration_id: Number(registrationId) });
      setStudentBatch(null); setRegistrationId(''); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to add student.'); }
    finally { setSaving(false); }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try { await batchApi.create(form); setShowCreate(false); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to create batch.'); }
    finally { setSaving(false); }
  }

  return <section className="batch-page">
    <header className="batch-header"><div><div className="batch-eyebrow">GROUP LEADER / BATCH MANAGEMENT</div><h1>Batch Management</h1><p>Manage active batches, students and class schedules.</p></div>
      <div className="batch-header-actions"><button className="batch-secondary" type="button" onClick={() => void load()} disabled={loading}>↻ Refresh</button><button className="batch-primary" type="button" onClick={() => setShowCreate(true)}>＋ New Batch</button></div>
    </header>
    {error && <div className="batch-error" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    {scheduleBatch ? <section className="batch-table-card"><div className="batch-table-heading"><div><button className="batch-secondary" type="button" onClick={() => setScheduleBatch(null)}>← Back to Batches</button><h2>Schedule — {scheduleBatch.batchName}</h2></div><button className="batch-primary" type="button" onClick={() => void generate(scheduleBatch)} disabled={saving}>Generate Schedule</button></div>
      <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Content / Topic</th><th>Expected Date</th><th>Expected Day</th><th>Actual Date</th><th>Status</th></tr></thead><tbody>{schedules.map((row, i) => <tr key={String(read(row, 'batch_schedule_id', 'batchScheduleId', 'id') ?? i)}><td>{i + 1}</td><td>{String(read(row, 'content_name', 'contentName', 'topic_name') ?? '—')}</td><td>{formatDate(read(row, 'expected_date', 'expectedDate'))}</td><td>{String(read(row, 'expected_day', 'expectedDay') ?? '—')}</td><td>{formatDate(read(row, 'actual_date', 'actualDate'))}</td><td>{String(read(row, 'status') ?? '—')}</td></tr>)}{!schedules.length && <tr><td colSpan={6} className="batch-empty">{loading ? 'Loading schedule...' : 'No schedule entries found.'}</td></tr>}</tbody></table></div>
    </section> : <>
      <div className="batch-tabs"><button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Batches <span>{active.length}</span></button><button type="button" className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>Deleted Batches <span>{removed.length}</span></button></div>
      <section className="batch-table-card"><div className="batch-table-heading"><div><h2>{tab === 'active' ? 'Active Batches' : 'Deleted Batches'}</h2><p>Batch overview and quick actions</p></div><span className="batch-count">{displayed.length} records</span></div>
        <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>#</th><th>Batch Name</th><th>Topic Name</th><th>Trainer Name</th><th>Start Date</th><th>End Date</th><th>Batch Time</th><th># Students</th><th>Action</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={9} className="batch-empty">Loading batches...</td></tr> : displayed.map((row, i) => <tr key={row.batchId}><td>{i + 1}</td><td><strong>{row.batchName}</strong><small>ID: {row.batchId}</small></td><td>{String(read(row, 'topic_name', 'topicName') ?? `Topic #${read(row, 'topic_id', 'topicId') ?? '—'}`)}</td><td>{String(read(row, 'employee_name', 'employeeName') ?? `Employee #${read(row, 'employee_id', 'employeeId') ?? '—'}`)}</td><td>{formatDate(read(row, 'start_date', 'startDate'))}</td><td>{formatDate(read(row, 'end_date', 'endDate'))}</td><td>{String(read(row, 'batch_time', 'batchTime') ?? '—')}</td><td><span className="batch-student-count">{counts[row.batchId] ?? 0}</span></td><td><div className="batch-actions">{tab === 'active' ? <><div><button type="button" onClick={() => void viewSchedule(row)}>View Schedule</button><button type="button" onClick={() => { setStudentBatch(row); setRegistrationId(''); }}>Add Students</button><button type="button" onClick={() => void generate(row)} disabled={saving}>Generate Schedule</button></div><button className="remove" type="button" onClick={() => void remove(row)} disabled={saving}>Remove</button></> : <button className="restore" type="button" onClick={() => void restore(row)} disabled={saving}>Restore</button>}</div></td></tr>)}
          {!loading && !displayed.length && <tr><td colSpan={9} className="batch-empty">{tab === 'active' ? 'No active batches found.' : 'No deleted batches found.'}</td></tr>}
        </tbody></table></div>
      </section>
    </>}
    {showCreate && <div className="batch-modal-backdrop"><section className="batch-modal" role="dialog" aria-modal="true"><header><h2>New Batch</h2><button type="button" onClick={() => setShowCreate(false)}>×</button></header><form onSubmit={createBatch}><div className="batch-form-grid">
      <label>Batch Name *<input required value={form.batch_name} onChange={(e) => setForm({...form, batch_name:e.target.value})}/></label>
      <label>
        Topic *
        <select
          required
          value={form.topic_id}
          onChange={(event) => setForm((previous) => ({
            ...previous,
            topic_id: Number(event.target.value),
          }))}
        >
          <option value={0}>Select Topic</option>
          {topics.map((item) => {
            const topicId = read(item, 'topic_id', 'topicId', 'id');
            const topicName = read(item, 'topic_name', 'topicName', 'name');
            return (
              <option key={String(topicId)} value={Number(topicId)}>
                {String(topicName ?? 'Topic')}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        Trainer *
        <select
          required
          value={form.employee_id}
          onChange={(event) => setForm((previous) => ({
            ...previous,
            employee_id: Number(event.target.value),
          }))}
        >
          <option value={0}>Select Trainer</option>
          {employees.map((item) => {
            const employeeId = read(item, 'employee_id', 'employeeId', 'id');
            const employeeName = read(item, 'employee_name', 'employeeName', 'name');
            return (
              <option key={String(employeeId)} value={Number(employeeId)}>
                {String(employeeName ?? 'Employee')}
              </option>
            );
          })}
        </select>
      </label>
      <label>Branch ID *<input type="number" min="1" required value={form.branch_id || ''} onChange={(e) => setForm({...form, branch_id:Number(e.target.value)})}/></label>
      <label>Start Date *<input type="date" required value={form.start_date} onChange={(e) => setForm({...form, start_date:e.target.value})}/></label><label>End Date *<input type="date" min={form.start_date || undefined} required value={form.end_date} onChange={(e) => setForm({...form, end_date:e.target.value})}/></label>
      <label>Batch Time *<input required value={form.batch_time} onChange={(e) => setForm({...form, batch_time:e.target.value})}/></label><label>Playlist Title<input value={form.playlist_title} onChange={(e) => setForm({...form, playlist_title:e.target.value})}/></label><label>Playlist Key<input value={form.playlist_key} onChange={(e) => setForm({...form, playlist_key:e.target.value})}/></label>
    </div><footer><button className="batch-secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Batch'}</button></footer></form></section></div>}
    {studentBatch && <div className="batch-modal-backdrop"><section className="batch-modal batch-modal-small" role="dialog" aria-modal="true"><header><h2>Add Student — {studentBatch.batchName}</h2><button type="button" onClick={() => setStudentBatch(null)}>×</button></header><form onSubmit={addStudent}><label>Registration ID *<input type="number" min="1" required value={registrationId} onChange={(e) => setRegistrationId(e.target.value)}/></label><footer><button className="batch-secondary" type="button" onClick={() => setStudentBatch(null)}>Cancel</button><button className="batch-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Student'}</button></footer></form></section></div>}
  </section>;
}
