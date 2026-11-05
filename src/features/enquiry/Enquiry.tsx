import RowActionsMenu from '@/components/RowActionsMenu';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { directoryApi } from '@/api/directoryApi';
import './Enquiry.css';

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-GB');
}

function normalizeEnquiry(raw: any): EnquiryRecord {
  return {
    ...raw,
    enquiryId: Number(raw?.enquiryId ?? raw?.enquiry_id ?? raw?.id ?? 0),
    enquiryDate: String(raw?.enquiryDate ?? raw?.enquiry_date ?? ''),
    candidateName: String(raw?.candidateName ?? raw?.candidate_name ?? ''),
    gender: String(raw?.gender ?? ''),
    localAddress: String(raw?.localAddress ?? raw?.local_address ?? ''),
    emailAddress: String(raw?.emailAddress ?? raw?.email_address ?? raw?.email ?? ''),
    mobileNumber: String(raw?.mobileNumber ?? raw?.mobile_number ?? raw?.mobile ?? ''),
    birthDate: String(raw?.birthDate ?? raw?.birth_date ?? ''),
    qualificationId: Number(raw?.qualificationId ?? raw?.qualification_id ?? 0),
    qualification: String(raw?.qualification ?? ''),
    leadSources: String(raw?.leadSources ?? raw?.lead_sources ?? ''),
    enquiryFors: String(raw?.enquiryFors ?? raw?.enquiry_fors ?? ''),
    interestedTopics: String(raw?.interestedTopics ?? raw?.interested_topics ?? ''),
    status: String(raw?.status ?? 'New'),
    branchId: Number(raw?.branchId ?? raw?.branch_id ?? 0),
    branchName: String(raw?.branchName ?? raw?.branch_name ?? ''),
    deletedAt: raw?.deletedAt ?? raw?.deleted_at ?? ((raw?.is_deleted ?? raw?.isDeleted ?? raw?.deleted) ? 'deleted' : null),
  };
}

export default function Enquiry() {
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [savingId, setSavingId] = useState(0);

  async function load() {
    setLoading(true); setError('');
    const [enquiryResult, branchResult] = await Promise.allSettled([
      enquiryApi.getAll(), directoryApi.getBranches(),
    ]);
    if (enquiryResult.status === 'fulfilled') setEnquiries(enquiryResult.value.map(normalizeEnquiry));
    else { setEnquiries([]); setError('Unable to load enquiries. Please retry.'); }
    if (branchResult.status === 'fulfilled') setBranches(branchResult.value.map((item) => item.name));
    else setBranches([]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => enquiries.filter((item) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || JSON.stringify(item).toLowerCase().includes(term);
    const date = item.enquiryDate ? new Date(item.enquiryDate) : null;
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return matchesSearch && (!branch || item.branchName === branch) &&
      (!from || Boolean(date && date >= from)) && (!to || Boolean(date && date <= to));
  }), [enquiries, search, branch, fromDate, toDate]);

  async function removeEnquiry(item: EnquiryRecord) {
    if (!window.confirm(`Delete enquiry for ${item.candidateName}?`)) return;
    setSavingId(item.enquiryId); setError('');
    try { await enquiryApi.remove(item.enquiryId); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete enquiry.'); }
    finally { setSavingId(0); }
  }

  async function restoreEnquiry(item: EnquiryRecord) {
    setSavingId(item.enquiryId); setError('');
    try { await enquiryApi.restore(item.enquiryId); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore enquiry.'); }
    finally { setSavingId(0); }
  }

  function exportExcel() {
    const rows = filtered.map((item) => ({
      'Enquiry ID': item.enquiryId, 'Enquiry Date': formatDate(item.enquiryDate),
      'Candidate Name': item.candidateName, Gender: item.gender, Email: item.emailAddress,
      Mobile: item.mobileNumber, Branch: item.branchName, Qualification: item.qualification,
      'Lead Sources': item.leadSources, 'Enquiry For': item.enquiryFors,
      'Interested Topics': item.interestedTopics, Status: item.status,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Enquiries');
    XLSX.writeFile(workbook, 'Enquiries.xlsx');
  }

  return <section className="enquiry-page">
    <header className="enquiry-header"><div><h1>Enquiries</h1><p>Manage candidate enquiries and follow-ups</p></div>
      <div><button className="enquiry-secondary-btn" type="button" onClick={exportExcel}>Export Excel</button>
        <button className="enquiry-primary-btn" type="button" onClick={() => navigate('/main/enquiry/add')}>+ Add Enquiry</button></div>
    </header>
    {error && <div className="enquiry-alert" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    <div className="enquiry-tabs"><button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Enquiries</button><button type="button" className={tab === 'deleted' ? 'active' : ''} onClick={() => setTab('deleted')}>Deleted Enquiries</button></div>
    <div className="enquiry-filters">
      <input aria-label="Search enquiries" placeholder="Search candidate, email, mobile..." value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Filter branch" value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">All Branches</option>{branches.map((name) => <option key={name}>{name}</option>)}</select>
      <label>From <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
      <label>To <input type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      <button className="enquiry-secondary-btn" type="button" onClick={() => { setSearch(''); setBranch(''); setFromDate(''); setToDate(''); }}>Clear</button>
    </div>
    <div className="enquiry-table-card"><div className="enquiry-table-scroll"><table className="enquiry-table">
      <thead><tr><th>ID</th><th>Date</th><th>Candidate</th><th>Email</th><th>Mobile</th><th>Branch</th><th>Qualification</th><th>Enquiry For</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={10} className="enquiry-empty">Loading enquiries...</td></tr> :
        filtered.filter((item) => tab === 'deleted' ? Boolean(item.deletedAt) : !item.deletedAt).map((item) => <tr key={item.enquiryId}>
          <td>{item.enquiryId}</td><td>{formatDate(item.enquiryDate)}</td><td className="enquiry-candidate">{item.candidateName}</td>
          <td>{item.emailAddress}</td><td>{item.mobileNumber}</td><td>{item.branchName || '-'}</td><td>{item.qualification || '-'}</td>
          <td>{item.enquiryFors || '-'}</td><td><span className="enquiry-status">{item.status || 'New'}</span></td>
          <td><RowActionsMenu label={`Actions for enquiry ${item.enquiryId}`} disabled={savingId === item.enquiryId} actions={tab === 'deleted' ? [
              { label: 'Restore', onSelect: () => void restoreEnquiry(item) },
            ] : [
              { label: 'Follow-up', onSelect: () => navigate(`/main/enquiry/followup/${item.enquiryId}`) },
              { label: 'Edit', onSelect: () => navigate(`/main/enquiry/edit/${item.enquiryId}`) },
              { label: 'Delete', danger: true, onSelect: () => void removeEnquiry(item) },
            ]} /></td>
        </tr>)}
        {!loading && filtered.filter((item) => tab === 'deleted' ? Boolean(item.deletedAt) : !item.deletedAt).length === 0 && <tr><td colSpan={10} className="enquiry-empty">No enquiries found.</td></tr>}
      </tbody>
    </table></div></div>
    <p className="enquiry-count">Showing {filtered.filter((item) => tab === 'deleted' ? Boolean(item.deletedAt) : !item.deletedAt).length} enquiries</p>
  </section>;
}
