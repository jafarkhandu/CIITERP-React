import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { studentApi, type PaymentRequest, type PaymentRow } from '@/api/studentApi';

type Row = Record<string, unknown>;
type Registration = { registrationId: number; studentId: number; courseId: number; registrationCode: string; courseName: string; discount: number };
const money = (v: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v) || 0);
const dateLabel = (v: unknown) => { const d = v ? new Date(String(v)) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN') : '—'; };
const dateKey = (v: unknown) => { const d = v ? new Date(String(v)) : null; return d && !Number.isNaN(d.getTime()) ? [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') : ''; };
const pick = (r: Row, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v !== undefined && v !== null && v !== '');
const rowsFrom = (v: unknown): Row[] => {
  if (Array.isArray(v)) return v.filter((x): x is Row => !!x && typeof x === 'object');
  if (!v || typeof v !== 'object') return [];
  const r = v as Row;
  for (const key of ['data', 'result', 'items', 'registrations', '$values']) { const nested = r[key]; if (Array.isArray(nested)) return rowsFrom(nested); if (nested && typeof nested === 'object') { const rows = rowsFrom(nested); if (rows.length) return rows; } }
  return [];
};

export default function StudentPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'receipts' | null>(null);
  const [receiptStudent, setReceiptStudent] = useState<PaymentRow | null>(null);
  const [studentId, setStudentId] = useState(0);
  const [registrationId, setRegistrationId] = useState(0);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: new Date().toISOString().slice(0, 10), paymentAmount: 0, paymentMode: 'Cash', paymentDescription: '' });
  const [fee, setFee] = useState<{ finalFees: number; actualFees: number } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  async function loadPayments() {
    setLoading(true); setError('');
    const [paymentResult, registrationResult] = await Promise.allSettled([studentApi.getPayments(), studentApi.getRegistrations()]);
    if (paymentResult.status === 'fulfilled') setPayments([...paymentResult.value].sort((a, b) => new Date(String(b.paymentDate ?? '')).getTime() - new Date(String(a.paymentDate ?? '')).getTime()));
    if (registrationResult.status === 'fulfilled') {
      const mapped: Registration[] = [];
      for (const item of rowsFrom(registrationResult.value)) {
        const student = Number(pick(item, 'studentId', 'student_id', 'student_Id') ?? 0);
        const nested = rowsFrom(pick(item, 'registrations', 'Registrations'));
        const source = nested.length ? nested : [item];
        for (const r of source) {
          const id = Number(pick(r, 'registrationId', 'registration_id', 'registration_Id') ?? 0);
          const courseId = Number(pick(r, 'courseId', 'course_id', 'course_Id') ?? 0);
          if (!id || !courseId) continue;
          mapped.push({ registrationId: id, studentId: Number(pick(r, 'studentId', 'student_id', 'student_Id') ?? student), courseId, registrationCode: String(pick(r, 'registrationCode', 'registration_code', 'registration_Code') ?? ''), courseName: String(pick(r, 'courseName', 'course_name', 'course_Name') ?? ''), discount: Number(pick(r, 'discount', 'Discount') ?? 0) });
        }
      }
      setRegistrations(mapped);
    }
    if (paymentResult.status === 'rejected' || registrationResult.status === 'rejected') {
      console.error('Payment page data load failed:', { payments: paymentResult.status === 'rejected' ? paymentResult.reason : undefined, registrations: registrationResult.status === 'rejected' ? registrationResult.reason : undefined });
      setError('Some payment data could not be refreshed. Successfully loaded records remain visible.');
    }
    setLoading(false);
  }
  useEffect(() => { void loadPayments(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      const searchMatch = !q || [p.paymentId, p.studentId, p.studentName, p.lastName, p.mobileNumber, p.registrationCode, p.registrationId, p.courseName, p.paymentMode].some((v) => String(v ?? '').toLowerCase().includes(q));
      const d = dateKey(p.paymentDate);
      return searchMatch && (!fromDate || (d && d >= fromDate)) && (!toDate || (d && d <= toDate)) && (!mode || p.paymentMode === mode);
    });
  }, [payments, search, fromDate, toDate, mode]);
  const total = filtered.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);
  const uniqueStudents = useMemo(() => {
    const grouped = new Map<string, { student: PaymentRow; total: number; count: number }>();
    for (const p of filtered) {
      const key = Number(p.studentId) > 0 ? 's:' + p.studentId : 'r:' + p.registrationId;
      const current = grouped.get(key);
      if (current) { current.total += Number(p.paymentAmount) || 0; current.count += 1; }
      else grouped.set(key, { student: p, total: Number(p.paymentAmount) || 0, count: 1 });
    }
    return [...grouped.values()];
  }, [filtered]);
  const receiptRows = useMemo(() => {
    if (!receiptStudent) return [];
    return payments.filter((p) => Number(p.studentId) === Number(receiptStudent.studentId) || (!receiptStudent.studentId && Number(p.registrationId) === Number(receiptStudent.registrationId)));
  }, [payments, receiptStudent]);
  const selectedRegistration = registrations.find((r) => r.registrationId === registrationId);
  const eligibleRegistrations = registrations.filter((r) => r.studentId === studentId);

  async function openCreate() {
    setError(''); setFee(null); setStudentId(0); setRegistrationId(0);
    setPaymentForm({ paymentDate: new Date().toISOString().slice(0, 10), paymentAmount: 0, paymentMode: 'Cash', paymentDescription: '' });
    setModal('create');
    if (!registrations.length) await loadPayments();
  }
  async function chooseRegistration(id: number) {
    setRegistrationId(id); setFee(null);
    const reg = registrations.find((r) => r.registrationId === id);
    if (!reg) return;
    setFeeLoading(true);
    try {
      const response = await studentApi.getCourseFees(reg.courseId, reg.discount);
      const finalFees = Number(pick(response, 'finalFees', 'final_Fees') ?? 0);
      const actualFees = Number(pick(response, 'actualFees', 'actual_Fees') ?? 0);
      setFee({ finalFees, actualFees });
    } catch (err) { console.error('Payment fee lookup failed:', err); setError('Could not load course fee details for this registration.'); }
    finally { setFeeLoading(false); }
  }
  async function createPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (!selectedRegistration || !fee) { setError('Select a course registration and wait for its fee details.'); return; }
    const alreadyPaid = payments.filter((p) => Number(p.registrationId) === registrationId).reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);
    const balance = Math.max(0, fee.finalFees - alreadyPaid);
    if (!Number.isFinite(paymentForm.paymentAmount) || paymentForm.paymentAmount <= 0 || paymentForm.paymentAmount > balance) { setError('Enter an amount greater than zero and no more than the remaining balance (' + money(balance) + ').'); return; }
    const payload: PaymentRequest = { ...paymentForm, paymentDate: new Date(paymentForm.paymentDate + 'T00:00:00').toISOString(), registrationId };
    setSaving(true);
    try { await studentApi.createPayment(payload); setModal(null); await loadPayments(); }
    catch (err) { console.error('Payment creation failed:', err); setError('Payment could not be saved. Verify the details and try again.'); }
    finally { setSaving(false); }
  }
  async function downloadReceipt(payment: PaymentRow) {
    const regId = Number(payment.registrationId || 0), payId = Number(payment.paymentId || 0);
    if (!regId || !payId) { setError('Receipt cannot be generated because the registration or payment ID is missing.'); return; }
    setReceiptLoading(true); setError('');
    try {
      const blob = await studentApi.downloadInvoice(regId, payId);
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Empty receipt PDF');
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Payment-Receipt-' + payId + '.pdf'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) { console.error('Receipt download failed:', err); setError('Receipt PDF could not be downloaded. Please retry.'); }
    finally { setReceiptLoading(false); }
  }
  const clearFilters = () => { setSearch(''); setFromDate(''); setToDate(''); setMode(''); };

  return <section className="container-fluid py-3 ciit-data-page">
    <div className="ciit-page-heading mb-4"><div><span className="ciit-section-eyebrow">ACCOUNTS MANAGEMENT</span><h1 className="h3 mb-1">Student Payments</h1><p className="text-muted mb-0">Track collections, filter transactions and download official receipts.</p></div><div className="d-flex gap-2"><button className="btn btn-outline-primary" onClick={() => void loadPayments()} disabled={loading}><i className="bi bi-arrow-clockwise me-1" />Refresh</button><button className="btn btn-primary" onClick={() => void openCreate()}><i className="bi bi-plus-lg me-1" />Create Payment</button></div></div>
    {error && !modal && <div className="alert alert-warning" role="alert">{error}</div>}
    <div className="row g-3 mb-4"><div className="col-sm-6 col-xl-3"><div className="card ciit-stat-card"><div className="card-body"><span>Payment Records</span><strong>{filtered.length}</strong><small>Filtered transactions</small></div></div></div><div className="col-sm-6 col-xl-3"><div className="card ciit-stat-card"><div className="card-body"><span>Total Collected</span><strong>{money(total)}</strong><small>Based on current filters</small></div></div></div><div className="col-sm-6 col-xl-3"><div className="card ciit-stat-card"><div className="card-body"><span>Students</span><strong>{uniqueStudents.length}</strong><small>With matching payments</small></div></div></div></div>
    <div className="card ciit-data-card mb-4"><div className="card-header"><div><h2 className="h6 mb-1">Payment Filters</h2><span className="small text-muted">Search, date range and payment mode</span></div><button className="btn btn-sm btn-light" onClick={clearFilters}><i className="bi bi-x-circle me-1" />Clear Filters</button></div><div className="card-body"><div className="row g-3"><div className="col-lg-4"><label className="form-label">Search</label><div className="ciit-table-search w-100"><i className="bi bi-search" /><input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student, payment ID, registration..." /></div></div><div className="col-sm-6 col-lg-2"><label className="form-label">From Date</label><input type="date" className="form-control" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div className="col-sm-6 col-lg-2"><label className="form-label">To Date</label><input type="date" className="form-control" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} /></div><div className="col-sm-6 col-lg-2"><label className="form-label">Payment Mode</label><select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">All Modes</option>{['Cash', 'UPI', 'Online', 'Card', 'Bank Transfer', 'Cheque'].map((m) => <option key={m}>{m}</option>)}</select></div></div></div></div>
    <div className="card ciit-data-card"><div className="card-header"><div><h2 className="h6 mb-1">Student Collection Summary</h2><span className="small text-muted">{uniqueStudents.length} students · {filtered.length} matching payments</span></div></div><div className="table-responsive"><table className="table table-hover align-middle ciit-professional-table mb-0"><thead><tr><th>#</th><th>Student ID</th><th>Student</th><th>Email</th><th>Payment Count</th><th className="text-end">Total Paid</th><th className="text-end">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="ciit-table-state">Loading payment records...</td></tr> : uniqueStudents.length ? uniqueStudents.map((item, i) => <tr key={String(item.student.studentId || item.student.registrationId || i)}><td>{i + 1}</td><td>{item.student.studentId || '—'}</td><td className="fw-semibold">{item.student.studentName} {item.student.lastName}</td><td>{item.student.emailAddress || '—'}</td><td><span className="badge rounded-pill text-bg-light">{item.count}</span></td><td className="text-end fw-semibold">{money(item.total)}</td><td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => { setReceiptStudent(item.student); setModal('receipts'); }}><i className="bi bi-receipt me-1" />Receipts</button></td></tr>) : <tr><td colSpan={7} className="ciit-table-state">No payment records match these filters.</td></tr>}</tbody></table></div></div>

    {modal === 'create' && <div className="modal-backdrop show ciit-modal-backdrop" onMouseDown={() => !saving && setModal(null)}><div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="create-payment-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: 720 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">CIIT · ACCOUNTS</span><h2 className="modal-title fs-5" id="create-payment-title">Create Student Payment</h2><p className="small text-muted mb-0">Select a student registration and record a payment.</p></div><button className="btn-close" onClick={() => !saving && setModal(null)} aria-label="Close" /></div><div className="modal-body"><form onSubmit={createPayment}><div className="row g-3">
      <div className="col-12"><label className="form-label">Student *</label><select required className="form-select" value={studentId} onChange={(e) => { setStudentId(Number(e.target.value)); setRegistrationId(0); setFee(null); }}><option value={0}>Select student</option>{[...new Map(registrations.map((r) => [r.studentId, r])).values()].map((r) => <option key={r.studentId} value={r.studentId}>{payments.find((p) => Number(p.studentId) === r.studentId)?.studentName || 'Student'} · ID {r.studentId}</option>)}</select></div>
      <div className="col-12"><label className="form-label">Course Registration *</label><select required className="form-select" value={registrationId} onChange={(e) => void chooseRegistration(Number(e.target.value))} disabled={!studentId}><option value={0}>Select registration</option>{eligibleRegistrations.map((r) => <option key={r.registrationId} value={r.registrationId}>{r.courseName || 'Course'} · {r.registrationCode || '#' + r.registrationId}</option>)}</select></div>
      {feeLoading && <div className="col-12 small text-muted">Loading course fee and balance...</div>}
      {fee && selectedRegistration && <div className="col-12"><div className="ciit-fee-summary"><span>Final Course Fee <strong>{money(fee.finalFees)}</strong></span><span>Already Paid <strong>{money(payments.filter((p) => Number(p.registrationId) === registrationId).reduce((s, p) => s + (Number(p.paymentAmount) || 0), 0))}</strong></span><span>Balance <strong>{money(Math.max(0, fee.finalFees - payments.filter((p) => Number(p.registrationId) === registrationId).reduce((s, p) => s + (Number(p.paymentAmount) || 0), 0)))}</strong></span></div></div>}
      <div className="col-md-4"><label className="form-label">Amount *</label><input type="number" min="0.01" step="0.01" required className="form-control" value={paymentForm.paymentAmount || ''} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentAmount: Number(e.target.value) }))} /></div>
      <div className="col-md-4"><label className="form-label">Payment Date *</label><input type="date" required className="form-control" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))} /></div>
      <div className="col-md-4"><label className="form-label">Payment Mode *</label><select className="form-select" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}><option>Cash</option><option>UPI</option><option>Online</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></div>
      <div className="col-12"><label className="form-label">Description</label><input className="form-control" value={paymentForm.paymentDescription} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDescription: e.target.value }))} placeholder="Installment / payment note" /></div>
    </div>{error && <div className="alert alert-danger mt-3">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || feeLoading}>{saving ? 'Saving...' : 'Save Payment'}</button></div></form></div></div></div></div></div>}

    {modal === 'receipts' && receiptStudent && <div className="modal-backdrop show ciit-modal-backdrop" onMouseDown={() => setModal(null)}><div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="receipts-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl"><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">PAYMENT HISTORY</span><h2 className="modal-title fs-5" id="receipts-title">{receiptStudent.studentName} {receiptStudent.lastName}</h2><p className="small text-muted mb-0">Student ID: {receiptStudent.studentId || 'N/A'} · {receiptRows.length} receipt(s)</p></div><button className="btn-close" onClick={() => setModal(null)} aria-label="Close" /></div><div className="modal-body"><div className="table-responsive"><table className="table table-hover align-middle ciit-professional-table mb-0"><thead><tr><th>Receipt No.</th><th>Date</th><th>Registration</th><th>Course</th><th>Payment Mode</th><th className="text-end">Amount</th><th className="text-end">PDF</th></tr></thead><tbody>{receiptRows.map((p) => <tr key={p.paymentId}><td>#{p.paymentId}</td><td>{dateLabel(p.paymentDate)}</td><td>{p.registrationCode || p.registrationId}</td><td>{p.courseName || '—'}</td><td>{p.paymentMode || '—'}</td><td className="text-end fw-semibold">{money(p.paymentAmount)}</td><td className="text-end"><button className="btn btn-sm btn-outline-primary" disabled={receiptLoading} onClick={() => void downloadReceipt(p)}><i className="bi bi-file-earmark-pdf me-1" />Download PDF</button></td></tr>)}{!receiptRows.length && <tr><td colSpan={7} className="ciit-table-state">No receipts found.</td></tr>}</tbody></table></div>{error && <div className="alert alert-warning mt-3">{error}</div>}</div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button></div></div></div></div></div>}
  </section>;
}
