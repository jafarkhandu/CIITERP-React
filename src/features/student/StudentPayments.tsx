import { useEffect, useMemo, useState } from 'react';
import { studentApi, type PaymentRow } from '@/api/studentApi';

const money = (value: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (value: unknown) => { const parsed = value ? new Date(String(value)) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('en-IN') : '—'; };

export default function StudentPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadPayments() {
    setLoading(true); setError('');
    try { setPayments(await studentApi.getPayments()); }
    catch (err) { console.error('Student payments load failed:', err); setError('Unable to load payment records. Check the API request and your session, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadPayments(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return payments;
    return payments.filter((item) => [item.studentName, item.lastName, item.mobileNumber, item.registrationCode, item.courseName, item.paymentMode, item.branchName]
      .some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [payments, search]);
  const total = filtered.reduce((sum, item) => sum + (Number(item.paymentAmount) || 0), 0);

  return <section className="container-fluid py-3">
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <div><h2 className="h4 mb-1">Student Payments</h2><p className="text-muted mb-0">Payment history and collected amounts.</p></div>
      <button className="btn btn-outline-primary" onClick={() => void loadPayments()} disabled={loading}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="row g-3 mb-3">
      <div className="col-sm-6 col-lg-3"><div className="card h-100"><div className="card-body"><div className="text-muted small">Payment Records</div><div className="fs-3 fw-semibold">{payments.length}</div></div></div></div>
      <div className="col-sm-6 col-lg-3"><div className="card h-100"><div className="card-body"><div className="text-muted small">Filtered Collection</div><div className="fs-3 fw-semibold">{money(total)}</div></div></div></div>
    </div>
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3"><h3 className="h6 mb-0">Payment History</h3>
        <input className="form-control" style={{ maxWidth: 360 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, registration, course..." aria-label="Search payments" />
      </div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0">
        <thead className="table-light"><tr><th>#</th><th>Payment Date</th><th>Student</th><th>Registration</th><th>Course</th><th>Mode</th><th>Description</th><th className="text-end">Amount</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading payment records...</td></tr>
          : filtered.length ? filtered.map((item, index) => <tr key={item.paymentId || `${item.registrationId}-${index}`}>
            <td>{index + 1}</td><td>{date(item.paymentDate)}</td><td className="fw-semibold">{item.studentName} {item.lastName}</td><td>{item.registrationCode || item.registrationId || '—'}</td><td>{item.courseName || '—'}</td><td>{item.paymentMode || '—'}</td><td>{item.paymentDescription || '—'}</td><td className="text-end fw-semibold">{money(item.paymentAmount)}</td>
          </tr>) : <tr><td colSpan={8} className="text-center text-muted py-5">{error ? 'Payment data could not be retrieved.' : 'No payment records found.'}</td></tr>}
        </tbody>
      </table></div>
    </div>
  </section>;
}
