import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { leadApi, type LeadRecord, type LeadSourceRecord } from '@/api/leadApi';
import { PERMISSIONS, permissionService } from '@/core/services/permissionService';
import { userSession } from '@/core/auth/session';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import './Lead.css';

const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Converted to Enquiry', 'Closed'];

function normalizeLead(raw: any): LeadRecord {
  return {
    ...raw,
    leadId: Number(raw?.leadId ?? raw?.id ?? 0),
    candidateName: String(raw?.candidateName ?? raw?.name ?? ''),
    emailAddress: String(raw?.emailAddress ?? raw?.email ?? ''),
    mobileNumber: String(raw?.mobileNumber ?? raw?.mobile ?? ''),
    trainingType: String(raw?.trainingType ?? ''),
    description: String(raw?.description ?? ''),
    status: String(raw?.status ?? 'New'),
    leadDate: raw?.leadDate ?? raw?.createdAt ?? '',
    sourceId: Number(raw?.sourceId ?? raw?.leadSourceId ?? 0),
    sourceName: String(raw?.sourceName ?? ''),
    deletedAt: raw?.deletedAt ?? raw?.deleted_at ?? null,
  };
}

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-GB');
}

export default function Lead() {
  const navigate = useNavigate();
  useSession();
  usePermissionVersion();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [sources, setSources] = useState<LeadSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [trainingType, setTrainingType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState(0);
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [showExport, setShowExport] = useState(false);
  const [form, setForm] = useState({
    candidateName: '', emailAddress: '', mobileNumber: '', trainingType: 'Online',
    description: '', status: 'New', leadDate: localDateValue(), sourceId: 0, sourceName: '',
  });

  const canCreate = permissionService.hasPermission(PERMISSIONS.LEAD_CREATE);
  const canUpdate = permissionService.hasPermission(PERMISSIONS.LEAD_UPDATE);
  const canDelete = permissionService.hasPermission(PERMISSIONS.LEAD_DELETE);
  const canRestore = permissionService.hasPermission(PERMISSIONS.LEAD_RESTORE);
  const canFollowup = userSession.isSuperUser() || !userSession.isAdmin() ||
    permissionService.isAdminFunctionEnabled(PERMISSIONS.LEAD_FOLLOWUP);
  const canExport = permissionService.hasPermission(PERMISSIONS.LEAD_EXPORT);

  async function loadData() {
    setLoading(true); setError('');
    const [leadResult, sourceResult] = await Promise.allSettled([leadApi.getAll(), leadApi.getSources()]);
    if (leadResult.status === 'fulfilled') setLeads(leadResult.value.map(normalizeLead));
    else { setLeads([]); setError('Unable to load leads. Please retry.'); }
    if (sourceResult.status === 'fulfilled') {
      setSources(sourceResult.value.filter((source) => source.flag === 1 && source.deletedAt == null)
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName)));
    } else setSources([]);
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesText = !term || [lead.candidateName, lead.emailAddress, lead.mobileNumber]
        .some((value) => value.toLowerCase().includes(term));
      const date = new Date(lead.leadDate);
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
      return matchesText && (!status || lead.status === status) &&
        (!trainingType || lead.trainingType === trainingType) &&
        (!from || (date >= from && !Number.isNaN(date.getTime()))) &&
        (!to || (date <= to && !Number.isNaN(date.getTime())));
    });
  }, [leads, search, status, trainingType, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(''); setStatus(''); setTrainingType(''); setDateFrom(''); setDateTo('');
  }

  function openCreate() {
    setEditingLeadId(0);
    setFormError('');
    setForm({
      candidateName: '', emailAddress: '', mobileNumber: '', trainingType: 'Online',
      description: '', status: 'New', leadDate: localDateValue(), sourceId: 0, sourceName: '',
    });
    setShowForm(true);
  }

  async function openEdit(lead: LeadRecord) {
    setFormError(''); setError(''); setSaving(true);
    try {
      const raw = await leadApi.getById(lead.leadId);
      const item = normalizeLead(raw as any);
      setEditingLeadId(item.leadId);
      setForm({ candidateName: item.candidateName, emailAddress: item.emailAddress, mobileNumber: item.mobileNumber,
        trainingType: item.trainingType || 'Online', description: item.description, status: item.status || 'New', leadDate: localDateValue(new Date(item.leadDate)),
        sourceId: item.sourceId, sourceName: item.sourceName || '' });
      setShowForm(true);
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to load lead for editing.'); }
    finally { setSaving(false); }
  }

  async function removeLead(lead: LeadRecord) {
    if (!window.confirm(`Delete lead for ${lead.candidateName}?`)) return;
    setSaving(true); setError('');
    try { await leadApi.remove(lead.leadId); await loadData(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete lead.'); }
    finally { setSaving(false); }
  }
  async function restoreLead(lead: LeadRecord) {
    setSaving(true); setError('');
    try { await leadApi.restore(lead.leadId); await loadData(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore lead.'); }
    finally { setSaving(false); }
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('');
    const source = sources.find((item) => Number(item.sourceId) === Number(form.sourceId));
    if (!source) { setFormError('Select a valid lead source.'); return; }
    if (!/^\\d{10}$/.test(form.mobileNumber)) { setFormError('Enter a valid 10-digit mobile number.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, leadDate: new Date(`${form.leadDate}T00:00:00`),
        status: editingLeadId ? form.status : 'New',
        sourceName: source.sourceName,
      };
      if (editingLeadId) await leadApi.update(editingLeadId, { leadId: editingLeadId, ...payload } as LeadRecord);
      else await leadApi.create(payload);
      setShowForm(false);
      await loadData();
    } catch (requestError: any) {
      setFormError(requestError?.response?.data?.message || 'Unable to save the lead.');
    } finally { setSaving(false); }
  }

  function exportExcel() {
    const rows = filtered.map((lead, index) => ({
      'Sr. No.': index + 1, ID: lead.leadId, 'Candidate Name': lead.candidateName,
      Email: lead.emailAddress, Mobile: lead.mobileNumber, 'Training Type': lead.trainingType,
      Status: lead.status, 'Lead Date': formatDate(lead.leadDate),
      'Lead Source': lead.sourceName || sources.find((source) => source.sourceId === lead.sourceId)?.sourceName || '',
      Description: lead.description,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Leads');
    XLSX.writeFile(workbook, `Leads_${localDateValue()}.xlsx`);
    setShowExport(false);
  }

  function exportPdf() {
    const document = new jsPDF('l', 'mm', 'a4');
    document.setFontSize(16); document.text('Lead Report', 14, 15);
    document.setFontSize(9); document.text(`Total Leads: ${filtered.length}`, 14, 22);
    autoTable(document, {
      startY: 28,
      head: [['#', 'ID', 'Candidate', 'Email', 'Mobile', 'Training', 'Status', 'Lead Date', 'Source']],
      body: filtered.map((lead, index) => [
        index + 1, lead.leadId, lead.candidateName, lead.emailAddress, lead.mobileNumber,
        lead.trainingType, lead.status, formatDate(lead.leadDate), lead.sourceName || '',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
    });
    document.save(`Leads_${localDateValue()}.pdf`);
    setShowExport(false);
  }

  return <section className="lead-page">
    <header className="lead-page-header"><div><h1>Leads</h1><p>Manage and track your leads</p></div>
      <div className="lead-header-actions">
        {canExport && <div className="lead-export-wrap"><button className="lead-secondary-btn" type="button" onClick={() => setShowExport((value) => !value)}>Export ▾</button>
          {showExport && <div className="lead-export-menu"><button type="button" onClick={exportExcel}>Export Excel</button><button type="button" onClick={exportPdf}>Export PDF</button></div>}</div>}
        {canCreate && <button className="lead-primary-btn" type="button" onClick={openCreate}>+ Add Lead</button>}
      </div>
    </header>
    {error && <div className="lead-alert" role="alert">{error}<button type="button" onClick={() => void loadData()}>Retry</button></div>}
    <div className="lead-tabs"><button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Leads</button><button type="button" className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>Deleted Leads</button></div>
    <div className="lead-filters">
      <input aria-label="Search leads" placeholder="Search name, email or mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Filter lead status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Status</option>{STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filter training type" value={trainingType} onChange={(event) => setTrainingType(event.target.value)}><option value="">All Training Types</option><option>Online</option><option>Offline</option></select>
      <button className="lead-secondary-btn" type="button" onClick={clearFilters}>Clear</button>
    </div>
    <div className="lead-date-filters"><label>From <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>To <input type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><span>Total Leads: <strong>{filtered.length}</strong></span></div>
    <div className="lead-table-card"><div className="lead-table-scroll"><table className="lead-table">
      <thead><tr><th>#</th><th>ID</th><th>Candidate Name</th><th>Email</th><th>Mobile</th><th>Training</th><th>Status</th><th>Lead Date</th><th>Action</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={9} className="lead-empty">Loading leads...</td></tr> :
        filtered.filter((lead) => tab === 'deleted' ? Boolean((lead as any).deletedAt) : !(lead as any).deletedAt).map((lead, index) => <tr key={lead.leadId}><td>{index + 1}</td><td>{lead.leadId}</td><td className="lead-candidate">{lead.candidateName}</td><td>{lead.emailAddress}</td><td>{lead.mobileNumber}</td><td>{lead.trainingType}</td><td><span className={`lead-status ${lead.status.toLowerCase().replace(/\\s+/g, '-')}`}>{lead.status}</span></td><td>{formatDate(lead.leadDate)}</td><td><div className="lead-row-actions">{tab === 'deleted' ? (canRestore && <button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void restoreLead(lead)}>Restore</button>) : <>{canFollowup && <button className="lead-followup-btn" type="button" onClick={() => navigate(`/main/lead/followup/${lead.leadId}`)}>Follow-up</button>}{canUpdate && <button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void openEdit(lead)}>Edit</button>}{canDelete && <button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void removeLead(lead)}>Delete</button>}</>}</div></td></tr>)}
        {!loading && filtered.filter((lead) => tab === 'deleted' ? Boolean((lead as any).deletedAt) : !(lead as any).deletedAt).length === 0 && <tr><td colSpan={9} className="lead-empty">No leads found.</td></tr>}
      </tbody>
    </table></div></div>

    {showForm && <div className="lead-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}>
      <section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
        <header><div><h2 id="lead-modal-title">{editingLeadId ? 'Edit Lead' : 'Add Lead'}</h2><p>{editingLeadId ? 'Update lead details' : 'Create a new lead'}</p></div><button type="button" aria-label="Close" disabled={saving} onClick={() => setShowForm(false)}>×</button></header>
        <form onSubmit={createLead}><div className="lead-form-grid">
          <label>Candidate Name *<input required value={form.candidateName} onChange={(event) => setForm({ ...form, candidateName: event.target.value })} /></label>
          <label>Email Address *<input type="email" required value={form.emailAddress} onChange={(event) => setForm({ ...form, emailAddress: event.target.value })} /></label>
          <label>Mobile Number *<input required inputMode="numeric" maxLength={10} value={form.mobileNumber} onChange={(event) => setForm({ ...form, mobileNumber: event.target.value.replace(/\\D/g, '').slice(0, 10) })} /></label>
          <label>Training Type *<select value={form.trainingType} onChange={(event) => setForm({ ...form, trainingType: event.target.value })}><option>Online</option><option>Offline</option></select></label>
          <label>Lead Date<input type="date" value={form.leadDate} disabled /></label>
          <label>Status *<select required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Lead Source *<select required value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: Number(event.target.value) })}><option value={0}>Select Lead Source</option>{sources.map((source) => <option value={source.sourceId} key={source.sourceId}>{source.sourceName}</option>)}</select></label>
          <label className="lead-full-field">Description<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        </div>
        {formError && <div className="lead-alert" role="alert">{formError}</div>}
        <footer><button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button><button className="lead-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : editingLeadId ? 'Update Lead' : 'Save Lead'}</button></footer></form>
      </section>
    </div>}
  </section>;
}
