import { useEffect, useMemo, useState } from 'react';
import { leadApi, type LeadRecord, type LeadFollowupRecord } from '@/api/leadApi';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { enquiryFollowupApi } from '@/api/enquiryFollowupApi';
import './Reports.css';

type ReportTab = 'overview' | 'leads' | 'enquiries' | 'followups';
type FollowupRow = Record<string, unknown>;

const asText = (value: unknown) => value == null ? '' : String(value);
const dateText = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? asText(value) : date.toLocaleDateString();
};
const isDeleted = (row: { deletedAt?: string | null }) => Boolean(row.deletedAt);

export default function Reports() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [leadFollowups, setLeadFollowups] = useState<LeadFollowupRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [enquiryFollowups, setEnquiryFollowups] = useState<FollowupRow[]>([]);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      leadApi.getAll(),
      leadApi.getAllFollowups(),
      enquiryApi.getAll(),
      enquiryFollowupApi.getAll(),
    ]).then(([leadRows, leadFollowupRows, enquiryRows, enquiryFollowupRows]) => {
      if (!active) return;
      setLeads(leadRows.filter((row) => !isDeleted(row)));
      setLeadFollowups(leadFollowupRows.filter((row) => !isDeleted(row)));
      setEnquiries(enquiryRows.filter((row) => !isDeleted(row)));
      setEnquiryFollowups(enquiryFollowupRows.filter((row) => !Boolean(row.deletedAt)));
      setError('');
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Reports data could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const matches = (name: unknown, status: unknown, date: unknown) => {
    const needle = search.trim().toLowerCase();
    const haystack = `${asText(name)} ${asText(status)}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    const parsed = date ? new Date(String(date)) : null;
    if (fromDate && (!parsed || Number.isNaN(parsed.getTime()) || parsed < new Date(fromDate))) return false;
    if (toDate && (!parsed || Number.isNaN(parsed.getTime()) || parsed > new Date(`${toDate}T23:59:59`))) return false;
    return true;
  };

  const filteredLeads = useMemo(() => leads.filter((row) => matches(row.candidateName, row.status, row.leadDate)), [leads, search, fromDate, toDate]);
  const filteredEnquiries = useMemo(() => enquiries.filter((row) => matches(row.candidateName, row.status, row.enquiryDate)), [enquiries, search, fromDate, toDate]);
  const filteredLeadFollowups = useMemo(() => leadFollowups.filter((row) => matches(row.candidateName, row.status, row.followUpDate)), [leadFollowups, search, fromDate, toDate]);
  const filteredEnquiryFollowups = useMemo(() => enquiryFollowups.filter((row) => matches(row.candidateName, row.status, row.followUpDate ?? row.followupDate)), [enquiryFollowups, search, fromDate, toDate]);

  const exportCsv = () => {
    const rows = tab === 'leads' ? filteredLeads : tab === 'enquiries' ? filteredEnquiries : tab === 'followups' ? [...filteredLeadFollowups, ...filteredEnquiryFollowups] : [...filteredLeads, ...filteredEnquiries];
    const columns = tab === 'enquiries' ? ['candidateName', 'mobileNumber', 'emailAddress', 'status', 'enquiryDate'] : ['candidateName', 'mobileNumber', 'emailAddress', 'status', 'leadDate'];
    const csv = [columns.join(','), ...rows.map((row) => columns.map((key) => `"${asText((row as Record<string, unknown>)[key]).replace(/"/g, '""')} "`).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ciiterp-${tab}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tableRows = tab === 'leads' ? filteredLeads : tab === 'enquiries' ? filteredEnquiries : [];
  const isEnquiry = tab === 'enquiries';
  return (
    <main className="reports-page">
      <header className="reports-heading">
        <div><h1>Reports &amp; Analytics</h1><p>Lead and enquiry performance with follow-up activity.</p></div>
        <button type="button" className="reports-export" onClick={exportCsv}>Export CSV</button>
      </header>
      <section className="reports-filters" aria-label="Report filters">
        <input aria-label="Search reports" placeholder="Search candidate or status…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label>From <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label>To <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <button type="button" onClick={() => { setSearch(''); setFromDate(''); setToDate(''); }}>Clear</button>
      </section>
      <nav className="reports-tabs" aria-label="Report sections">
        {(['overview', 'leads', 'enquiries', 'followups'] as ReportTab[]).map((item) => <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>
      {loading ? <div className="reports-state">Loading report data…</div> : error ? <div className="reports-error" role="alert">{error}</div> : tab === 'overview' ? (
        <section className="reports-kpis">
          <article><span>Total Leads</span><strong>{filteredLeads.length}</strong></article>
          <article><span>Total Enquiries</span><strong>{filteredEnquiries.length}</strong></article>
          <article><span>Lead Follow-ups</span><strong>{filteredLeadFollowups.length}</strong></article>
          <article><span>Enquiry Follow-ups</span><strong>{filteredEnquiryFollowups.length}</strong></article>
          <article><span>Lead → Enquiry ratio</span><strong>{filteredLeads.length ? `${Math.round(filteredEnquiries.length / filteredLeads.length * 100)}%` : '—'}</strong></article>
          <p className="reports-note">Counts reflect active records after applying the selected filters.</p>
        </section>
      ) : tab === 'followups' ? (
        <section className="reports-followup-groups">
          <h2>Lead Follow-up History <span>{filteredLeadFollowups.length}</span></h2>
          <ReportTable columns={['Candidate', 'Follow-up date', 'Followed by', 'Status', 'Next follow-up']} rows={filteredLeadFollowups.map((row) => [row.candidateName, dateText(row.followUpDate), row.followUpBy, row.status, dateText(row.nextFollowupDate)])} />
          <h2>Enquiry Follow-up History <span>{filteredEnquiryFollowups.length}</span></h2>
          <ReportTable columns={['Candidate', 'Follow-up date', 'Followed by', 'Status', 'Next follow-up']} rows={filteredEnquiryFollowups.map((row) => [row.candidateName, dateText(row.followUpDate ?? row.followupDate), row.followUpBy, row.status, dateText(row.nextFollowupDate ?? row.nextFollowUpDate)])} />
        </section>
      ) : (
        <section className="reports-table-wrap">
          <div className="reports-table-title"><h2>{isEnquiry ? 'Enquiry Report' : 'Lead Report'}</h2><span>{tableRows.length} records</span></div>
          <ReportTable columns={['Candidate', 'Mobile', 'Email', 'Status', isEnquiry ? 'Enquiry date' : 'Lead date']} rows={tableRows.map((row) => [row.candidateName, row.mobileNumber, row.emailAddress, row.status, dateText(isEnquiry ? (row as EnquiryRecord).enquiryDate : (row as LeadRecord).leadDate)])} />
        </section>
      )}
    </main>
  );
}

function ReportTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return <div className="reports-table-scroll"><table className="reports-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{asText(cell) || '—'}</td>)}</tr>) : <tr><td colSpan={columns.length} className="reports-empty">No records match the current filters.</td></tr>}</tbody></table></div>;
}
