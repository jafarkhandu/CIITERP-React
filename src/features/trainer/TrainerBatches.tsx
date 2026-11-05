import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trainerApi } from '@/api/studentApi';
import './Trainer.css';

interface Batch { batchId: number; batchName: string; courseName?: string; startDate?: string; endDate?: string; batchTime?: string; studentCount?: number; }
const read = (row: Record<string, unknown>, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '') ;
const formatDate = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-IN') : '—';

export default function TrainerBatches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await trainerApi.getMyBatches();
      setBatches(rows.map((row) => ({
        batchId: Number(read(row, 'batchId', 'batch_id', 'id') ?? 0),
        batchName: String(read(row, 'batchName', 'batch_name', 'name') ?? 'Unnamed Batch'),
        courseName: String(read(row, 'courseName', 'course_name', 'course') ?? ''),
        startDate: String(read(row, 'startDate', 'start_date') ?? ''),
        endDate: String(read(row, 'endDate', 'end_date') ?? ''),
        batchTime: String(read(row, 'batchTime', 'batch_time') ?? ''),
        studentCount: Number(read(row, 'studentCount', 'student_count', 'totalStudents') ?? 0),
      })).filter((batch) => batch.batchId > 0));
    } catch (err) { console.error('Trainer batches load failed:', err); setError('Unable to load assigned batches. Check the API request and your session, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="container-fluid py-3 trainer-workspace trainer-batches-page">
    <div className="trainer-page-heading d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"><div><span className="trainer-eyebrow">TRAINING WORKSPACE</span><h2 className="h3 mb-1">My Assigned Batches</h2><p className="text-muted mb-0">Batches assigned to your trainer account.</p></div><button className="btn btn-outline-primary" onClick={() => void load()} disabled={loading}><i className="bi bi-arrow-clockwise me-1" />Refresh</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {loading ? <div className="text-center py-5"><span className="spinner-border me-2" />Loading assigned batches...</div>
      : batches.length ? <div className="row g-3">{batches.map((batch) => <div className="col-md-6 col-xl-4" key={batch.batchId}><article className="card trainer-batch-card h-100"><div className="card-body"><div className="d-flex justify-content-between gap-2"><h3 className="h5">{batch.batchName}</h3><span className="badge text-bg-primary">{batch.studentCount ?? 0} students</span></div><p className="text-muted mb-2">{batch.courseName || 'Course not specified'}</p><div className="small text-muted mb-3">Start: {formatDate(batch.startDate)} · End: {formatDate(batch.endDate)}{batch.batchTime ? ` · ${batch.batchTime}` : ''}</div><Link className="btn btn-primary btn-sm" to={`/main/trainer/batches/${batch.batchId}`}>Open batch <i className="bi bi-arrow-right ms-1" /></Link></div></article></div>)}</div>
      : <div className="alert alert-info">{error ? 'Batch list is unavailable.' : 'No batches are currently assigned to this trainer.'}</div>}
  </section>;
}
