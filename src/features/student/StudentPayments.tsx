import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { studentApi, type PaymentRequest, type PaymentRow } from '@/api/studentApi';

type Row = Record<string, unknown>;
type Registration = { registrationId: number; studentId: number; courseId: number; registrationCode: string; courseName: string; discount: number; studentName: string; lastName: string; mobileNumber: string };
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
  const [modal, setModal] = useState<'create' | 'receipts' | 'edit' | 'details' | 'delete' | null>(null);
  const [receiptStudent, setReceiptStudent] = useState<PaymentRow | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRow | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState(0);
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
          mapped.push({ registrationId: id, studentId: Number(pick(r, 'studentId', 'student_id', 'student_Id') ?? student), courseId, registrationCode: String(pick(r, 'registrationCode', 'registration_code', 'registration_Code') ?? ''), courseName: String(pick(r, 'courseName', 'course_name', 'course_Name') ?? ''), discount: Number(pick(r, 'discount', 'Discount') ?? 0), studentName: String(pick(r, 'studentName', 'student_name', 'student_Name') ?? pick(item, 'studentName', 'student_name', 'student_Name') ?? ''), lastName: String(pick(r, 'lastName', 'last_name', 'last_Name') ?? pick(item, 'lastName', 'last_name', 'last_Name') ?? ''), mobileNumber: String(pick(r, 'mobileNumber', 'mobile_number', 'mobile_Number') ?? pick(item, 'mobileNumber', 'mobile_number', 'mobile_Number') ?? '') });
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
  async function openPaymentDetails(payment: PaymentRow) {
    setDetailPayment(payment);
    setDetailsError('');
    setModal('details');
    setDetailsLoading(true);
    try {
      const details = await studentApi.getPaymentById(payment.paymentId);
      setDetailPayment({
        ...payment,
        ...details,
        paymentId: Number(pick(details, 'paymentId', 'payment_id', 'payment_Id', 'PaymentId') ?? payment.paymentId),
        paymentDate: String(pick(details, 'paymentDate', 'payment_date', 'payment_Date') ?? payment.paymentDate ?? ''),
        paymentAmount: Number(pick(details, 'paymentAmount', 'payment_amount', 'payment_Amount') ?? payment.paymentAmount ?? 0),
        paymentMode: String(pick(details, 'paymentMode', 'payment_mode', 'payment_Mode') ?? payment.paymentMode ?? ''),
        paymentDescription: String(pick(details, 'paymentDescription', 'payment_description', 'payment_Description') ?? payment.paymentDescription ?? ''),
        registrationId: Number(pick(details, 'registrationId', 'registration_id', 'registration_Id') ?? payment.registrationId ?? 0),
        studentName: String(pick(details, 'studentName', 'student_name', 'student_Name') ?? payment.studentName ?? ''),
        lastName: String(pick(details, 'lastName', 'last_name', 'last_Name') ?? payment.lastName ?? ''),
        courseName: String(pick(details, 'courseName', 'course_name', 'course_Name') ?? payment.courseName ?? ''),
        branchName: String(pick(details, 'branchName', 'branch_name', 'branch_Name') ?? payment.branchName ?? ''),
      });
    } catch (err) {
      console.error('Payment detail lookup failed:', err);
      setDetailsError('Could not load the latest payment details. Showing the available list information.');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function openEditPayment(payment: PaymentRow) {
    setError('');
    setFee(null);
    setEditingPaymentId(payment.paymentId);
    setRegistrationId(Number(payment.registrationId || 0));
    setStudentId(Number(payment.studentId || 0));
    setPaymentForm({
      paymentDate: dateKey(payment.paymentDate) || new Date().toISOString().slice(0, 10),
      paymentAmount: Number(payment.paymentAmount) || 0,
      paymentMode: payment.paymentMode || 'Cash',
      paymentDescription: payment.paymentDescription || '',
    });
    setModal('edit');

    const registration = registrations.find((item) => item.registrationId === Number(payment.registrationId || 0));
    if (!registration) {
      setError('The linked course registration is not available. Refresh the payment page before editing this record.');
      return;
    }

    setFeeLoading(true);
    try {
      const response = await studentApi.getCourseFees(registration.courseId, registration.discount);
      const finalFees = Number(pick(response, 'finalFees', 'final_Fees') ?? 0);
      const actualFees = Number(pick(response, 'actualFees', 'actual_Fees') ?? 0);
      setFee({ finalFees, actualFees });
    } catch (err) {
      console.error('Payment edit fee lookup failed:', err);
      setError('Could not verify the course balance. Refresh the payment page and try again.');
    } finally {
      setFeeLoading(false);
    }
  }

  async function updatePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const payment = payments.find((item) => item.paymentId === editingPaymentId);
    const registration = registrations.find((item) => item.registrationId === registrationId);
    if (!payment || !registration || !fee) {
      setError('Payment, course registration, or fee details are unavailable. Refresh and try again.');
      return;
    }

    const alreadyPaidExcludingThisPayment = payments
      .filter((item) => Number(item.registrationId) === registrationId && item.paymentId !== editingPaymentId)
      .reduce((sum, item) => sum + (Number(item.paymentAmount) || 0), 0);
    const balanceAvailableForThisPayment = Math.max(0, fee.finalFees - alreadyPaidExcludingThisPayment);
    if (!Number.isFinite(paymentForm.paymentAmount) || paymentForm.paymentAmount <= 0 || paymentForm.paymentAmount > balanceAvailableForThisPayment) {
      setError('Enter an amount greater than zero and no more than the available balance (' + money(balanceAvailableForThisPayment) + ').');
      return;
    }

    const payload: PaymentRequest = {
      ...paymentForm,
      paymentDate: new Date(paymentForm.paymentDate + 'T00:00:00').toISOString(),
      registrationId,
    };

    setSaving(true);
    try {
      await studentApi.updatePayment(editingPaymentId, payload);
      setModal(null);
      setEditingPaymentId(0);
      await loadPayments();
    } catch (err) {
      console.error('Payment update failed:', err);
      setError('Payment could not be updated. Verify the details and try again.');
    } finally {
      setSaving(false);
    }
  }

  function requestDeletePayment(payment: PaymentRow) {
    setPaymentToDelete(payment);
    setError('');
    setModal('delete');
  }

  async function confirmDeletePayment() {
    if (!paymentToDelete) return;
    setSaving(true);
    setError('');
    try {
      await studentApi.removePayment(paymentToDelete.paymentId);
      setPaymentToDelete(null);
      setModal('receipts');
      await loadPayments();
    } catch (err) {
      console.error('Payment deletion failed:', err);
      setError('Payment could not be deleted. Please retry.');
    } finally {
      setSaving(false);
    }
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

    {modal === 'create' && createPortal(<div className="ciit-modal-backdrop" onMouseDown={() => !saving && setModal(null)}><div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="create-payment-title" onMouseDown={(e) => e.stopPropagation()}><div className="ciit-modal-dialog" style={{ maxWidth: 720 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">CIIT · ACCOUNTS</span><h2 className="modal-title fs-5" id="create-payment-title">Create Student Payment</h2><p className="small text-muted mb-0">Select a student registration and record a payment.</p></div><button className="btn-close" onClick={() => !saving && setModal(null)} aria-label="Close" /></div><div className="modal-body"><form onSubmit={createPayment}><div className="row g-3">
      <div className="col-12"><label className="form-label">Student *</label><select required className="form-select" value={studentId} onChange={(e) => { setStudentId(Number(e.target.value)); setRegistrationId(0); setFee(null); }}><option value={0}>Select student</option>{[...new Map(registrations.map((r) => [r.studentId, r])).values()].map((r) => <option key={r.studentId} value={r.studentId}>{r.studentName || payments.find((p) => Number(p.studentId) === r.studentId)?.studentName || 'Student'} {r.lastName} · {r.mobileNumber || 'ID ' + r.studentId}</option>)}</select></div>
      <div className="col-12"><label className="form-label">Course Registration *</label><select required className="form-select" value={registrationId} onChange={(e) => void chooseRegistration(Number(e.target.value))} disabled={!studentId}><option value={0}>Select registration</option>{eligibleRegistrations.map((r) => <option key={r.registrationId} value={r.registrationId}>{r.courseName || 'Course'} · {r.registrationCode || '#' + r.registrationId}</option>)}</select></div>
      {feeLoading && <div className="col-12 small text-muted">Loading course fee and balance...</div>}
      {fee && selectedRegistration && <div className="col-12"><div className="ciit-fee-summary"><span>Final Course Fee <strong>{money(fee.finalFees)}</strong></span><span>Already Paid <strong>{money(payments.filter((p) => Number(p.registrationId) === registrationId).reduce((s, p) => s + (Number(p.paymentAmount) || 0), 0))}</strong></span><span>Balance <strong>{money(Math.max(0, fee.finalFees - payments.filter((p) => Number(p.registrationId) === registrationId).reduce((s, p) => s + (Number(p.paymentAmount) || 0), 0)))}</strong></span></div></div>}
      <div className="col-md-4"><label className="form-label">Amount *</label><input type="number" min="0.01" step="0.01" required className="form-control" value={paymentForm.paymentAmount || ''} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentAmount: Number(e.target.value) }))} /></div>
      <div className="col-md-4"><label className="form-label">Payment Date *</label><input type="date" required className="form-control" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))} /></div>
      <div className="col-md-4"><label className="form-label">Payment Mode *</label><select className="form-select" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}><option>Cash</option><option>UPI</option><option>Online</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></div>
      <div className="col-12"><label className="form-label">Description</label><input className="form-control" value={paymentForm.paymentDescription} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDescription: e.target.value }))} placeholder="Installment / payment note" /></div>
    </div>{error && <div className="alert alert-danger mt-3">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || feeLoading}>{saving ? 'Saving...' : 'Save Payment'}</button></div></form></div></div></div></div></div>, document.body)}

    {modal === 'edit' && createPortal(<div className="ciit-modal-backdrop" onMouseDown={() => !saving && setModal('receipts')}><div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="edit-payment-title" onMouseDown={(e) => e.stopPropagation()}><div className="ciit-modal-dialog" style={{ maxWidth: 650 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">CIIT · ACCOUNTS</span><h2 className="modal-title fs-5" id="edit-payment-title">Edit Payment #{editingPaymentId}</h2><p className="small text-muted mb-0">Update the payment details for the existing course registration.</p></div><button className="btn-close" type="button" onClick={() => !saving && setModal('receipts')} aria-label="Close" /></div><div className="modal-body"><div className="ciit-fee-summary mb-3"><span>Student<strong>{payments.find((p) => p.paymentId === editingPaymentId)?.studentName || 'Student'}</strong></span><span>Registration<strong>#{registrationId || '—'}</strong></span><span>Course Fee<strong>{fee ? money(fee.finalFees) : '—'}</strong></span></div>{feeLoading && <div className="small text-muted mb-3">Verifying course balance...</div>}<form onSubmit={updatePayment}><div className="row g-3"><div className="col-md-6"><label className="form-label">Amount *</label><input type="number" min="0.01" step="0.01" required className="form-control" value={paymentForm.paymentAmount || ''} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentAmount: Number(e.target.value) }))} /></div><div className="col-md-6"><label className="form-label">Payment Date *</label><input type="date" required className="form-control" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))} /></div><div className="col-md-6"><label className="form-label">Payment Mode *</label><select required className="form-select" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}><option>Cash</option><option>UPI</option><option>Online</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></div><div className="col-12"><label className="form-label">Description</label><textarea className="form-control" rows={2} value={paymentForm.paymentDescription} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDescription: e.target.value }))} /></div></div>{error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal('receipts')}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving || feeLoading || !fee}>{saving ? 'Saving...' : 'Save Changes'}</button></div></form></div></div></div></div></div>, document.body)}

    {modal === 'details' && detailPayment && createPortal(<div className="ciit-modal-backdrop" onMouseDown={() => setModal('receipts')}><div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="payment-details-title" onMouseDown={(e) => e.stopPropagation()}><div className="ciit-modal-dialog" style={{ maxWidth: 720 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">PAYMENT INFORMATION</span><h2 className="modal-title fs-5" id="payment-details-title">Payment #{detailPayment.paymentId}</h2><p className="small text-muted mb-0">Read-only transaction details from the payment record.</p></div><button className="btn-close" type="button" onClick={() => setModal('receipts')} aria-label="Close" /></div><div className="modal-body">{detailsLoading && <div className="text-muted small mb-3">Refreshing payment details...</div>}{detailsError && <div className="alert alert-warning py-2" role="status">{detailsError}</div>}<div className="row g-3">{[['Student', [detailPayment.studentName, detailPayment.lastName].filter(Boolean).join(' ')], ['Student ID', detailPayment.studentId], ['Registration', detailPayment.registrationCode || detailPayment.registrationId], ['Course', detailPayment.courseName], ['Payment Date', dateLabel(detailPayment.paymentDate)], ['Amount', money(detailPayment.paymentAmount)], ['Payment Mode', detailPayment.paymentMode], ['Description', detailPayment.paymentDescription], ['Branch', detailPayment.branchName]].map(([label, value]) => <div className="col-sm-6" key={String(label)}><div className="ciit-detail-field"><small>{String(label)}</small><strong>{value == null || value === '' ? '—' : String(value)}</strong></div></div>)}</div><div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-secondary" onClick={() => setModal('receipts')}>Close</button><button type="button" className="btn btn-primary" onClick={() => void openEditPayment(detailPayment)}>Edit Payment</button></div></div></div></div></div></div>, document.body)}

    {modal === 'delete' && paymentToDelete && createPortal(<div className="ciit-modal-backdrop" onMouseDown={() => !saving && setModal('receipts')}><div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="delete-payment-title" onMouseDown={(e) => e.stopPropagation()}><div className="ciit-modal-dialog" style={{ maxWidth: 480 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">CONFIRM ACTION</span><h2 className="modal-title fs-5" id="delete-payment-title">Delete Payment #{paymentToDelete.paymentId}?</h2></div><button className="btn-close" type="button" disabled={saving} onClick={() => setModal('receipts')} aria-label="Close" /></div><div className="modal-body"><p className="mb-0">This will remove the selected payment record. Continue only after verifying the student, registration, and amount.</p><div className="ciit-detail-field mt-3"><small>Payment summary</small><strong>{paymentToDelete.studentName || 'Student'} · {money(paymentToDelete.paymentAmount)} · {dateLabel(paymentToDelete.paymentDate)}</strong></div>{error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}<div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-light" disabled={saving} onClick={() => setModal('receipts')}>Cancel</button><button type="button" className="btn btn-danger" disabled={saving} onClick={() => void confirmDeletePayment()}>{saving ? 'Deleting...' : 'Delete Payment'}</button></div></div></div></div></div></div>, document.body)}

    {modal === 'receipts' && receiptStudent && createPortal(<div className="ciit-modal-backdrop" onMouseDown={() => setModal(null)}><div className="ciit-modal-window" role="dialog" aria-modal="true" aria-labelledby="receipts-title" onMouseDown={(e) => e.stopPropagation()}><div className="ciit-modal-dialog" style={{ maxWidth: 1140 }}><div className="modal-content ciit-glass-modal"><div className="modal-header"><div><span className="ciit-modal-kicker">PAYMENT HISTORY</span><h2 className="modal-title fs-5" id="receipts-title">{receiptStudent.studentName} {receiptStudent.lastName}</h2><p className="small text-muted mb-0">Student ID: {receiptStudent.studentId || 'N/A'} · {receiptRows.length} receipt(s)</p></div><button className="btn-close" onClick={() => setModal(null)} aria-label="Close" /></div><div className="modal-body"><div className="table-responsive"><table className="table table-hover align-middle ciit-professional-table mb-0"><thead><tr><th>Receipt No.</th><th>Date</th><th>Registration</th><th>Course</th><th>Payment Mode</th><th className="text-end">Amount</th><th className="text-end">PDF</th></tr></thead><tbody>{receiptRows.map((p) => <tr key={p.paymentId}><td>#{p.paymentId}</td><td>{dateLabel(p.paymentDate)}</td><td>{p.registrationCode || p.registrationId}</td><td>{p.courseName || '—'}</td><td>{p.paymentMode || '—'}</td><td className="text-end fw-semibold">{money(p.paymentAmount)}</td><td className="text-end"><div className="d-flex flex-wrap justify-content-end gap-1"><button className="btn btn-sm btn-light ciit-icon-button" type="button" onClick={() => void openPaymentDetails(p)} aria-label={`View payment ${p.paymentId}`} title="View details"><i className="bi bi-eye" /></button><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => void openEditPayment(p)}><i className="bi bi-pencil me-1" />Edit</button><button className="btn btn-sm btn-outline-danger" type="button" onClick={() => requestDeletePayment(p)}><i className="bi bi-trash me-1" />Delete</button><button className="btn btn-sm btn-outline-primary" type="button" disabled={receiptLoading} onClick={() => void downloadReceipt(p)}><i className="bi bi-file-earmark-pdf me-1" />Download PDF</button></div></td></tr>)}{!receiptRows.length && <tr><td colSpan={7} className="ciit-table-state">No receipts found.</td></tr>}</tbody></table></div>{error && <div className="alert alert-warning mt-3">{error}</div>}</div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button></div></div></div></div></div>, document.body)}
  </section>;
}
