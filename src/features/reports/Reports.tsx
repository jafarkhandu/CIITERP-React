import { useCallback, useEffect, useMemo, useState } from 'react';
import { leadApi, type LeadRecord, type LeadFollowupRecord } from '@/api/leadApi';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { enquiryFollowupApi, type EnquiryFollowupRecord } from '@/api/enquiryFollowupApi';
import { getAllUsers } from '@/api/userApi';
import type { User } from '@/types/user';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Reports.css';

type FollowupRow = EnquiryFollowupRecord & { deletedAt?: string | null; followupDate?: string; nextFollowUpDate?: string };
type FilterOption = 'All' | string;

const text = (value: unknown): string => value == null ? '' : String(value);
const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value: unknown): string => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
const active = (row: { deletedAt?: string | null }) => !row.deletedAt;
const completedStatus = /completed|complete|done|closed/i;
const lostStatus = /lost|not interested/i;

export default function Reports() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [leadFollowups, setLeadFollowups] = useState<LeadFollowupRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [enquiryFollowups, setEnquiryFollowups] = useState<FollowupRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [branchFilter, setBranchFilter] = useState<FilterOption>('All');
  const [courseFilter, setCourseFilter] = useState<FilterOption>('All');
  const [counsellorFilter, setCounsellorFilter] = useState<FilterOption>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [leadRows, leadFollowupRows, enquiryRows, enquiryFollowupRows, userRows] = await Promise.all([
        leadApi.getAll(),
        leadApi.getAllFollowups(),
        enquiryApi.getAll(),
        enquiryFollowupApi.getAll(),
        getAllUsers(),
      ]);
      setLeads(leadRows.filter(active));
      setLeadFollowups(leadFollowupRows.filter(active));
      setEnquiries(enquiryRows.filter(active));
      setEnquiryFollowups((enquiryFollowupRows as FollowupRow[]).filter(active));
      setUsers(userRows);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Some report data could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const branches = useMemo(() => ['All', ...new Set(enquiries.map((row) => row.branchName || '').filter(Boolean))], [enquiries]);
  const courses = useMemo(() => ['All', ...new Set(enquiries.map((row) => row.enquiryFors || '').filter(Boolean))], [enquiries]);

  const allowedCounsellors = useMemo(() => {
    const names = new Map<string, string>();
    users.forEach((user) => {
      const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.roleName || '', user.role || '']
        .filter((role): role is string => typeof role === 'string')
        .map((role) => role.trim().toLowerCase());
      if (!roles.includes('counsellor') && !roles.includes('super user')) return;
      const employeeName = text(user.employeeName).trim();
      const userName = text(user.userName).trim();
      if (employeeName) names.set(employeeName.toLowerCase(), employeeName);
      if (userName) names.set(userName.toLowerCase(), employeeName || userName);
    });
    return names;
  }, [users]);

  const counsellors = useMemo(() => {
    const names = new Set<string>();
    [...leadFollowups, ...enquiryFollowups].forEach((row) => {
      const mapped = allowedCounsellors.get(text(row.followUpBy).trim().toLowerCase());
      if (mapped) names.add(mapped);
    });
    return ['All', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [leadFollowups, enquiryFollowups, allowedCounsellors]);

  const inRange = useCallback((value: unknown) => {
    if (!value) return true;
    const date = parseDate(value);
    if (!date) return true;
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (day < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (date > to) return false;
    }
    return true;
  }, [dateFrom, dateTo]);

  const filteredLeads = useMemo(() => leads.filter((row) => inRange(row.leadDate)), [leads, inRange]);
  const filteredEnquiries = useMemo(() => enquiries.filter((row) => inRange(row.enquiryDate)
    && (branchFilter === 'All' || row.branchName === branchFilter)
    && (courseFilter === 'All' || row.enquiryFors === courseFilter)), [enquiries, inRange, branchFilter, courseFilter]);
  const counsellorMatches = useCallback((name: unknown) => counsellorFilter === 'All'
    || text(name).trim().toLowerCase() === counsellorFilter.trim().toLowerCase(), [counsellorFilter]);
  const filteredLeadFollowups = useMemo(() => leadFollowups.filter((row) => inRange(row.followUpDate) && counsellorMatches(row.followUpBy)), [leadFollowups, inRange, counsellorMatches]);
  const filteredEnquiryFollowups = useMemo(() => enquiryFollowups.filter((row) => inRange(row.followUpDate ?? row.followupDate) && counsellorMatches(row.followUpBy)), [enquiryFollowups, inRange, counsellorMatches]);

  const latestLeadFollowups = useMemo(() => {
    const latest = new Map<number, LeadFollowupRecord>();
    filteredLeadFollowups.forEach((row) => {
      const old = latest.get(row.leadId);
      if (!old || (parseDate(row.followUpDate)?.getTime() ?? 0) > (parseDate(old.followUpDate)?.getTime() ?? 0)) latest.set(row.leadId, row);
    });
    return [...latest.values()].sort((a, b) => (parseDate(b.followUpDate)?.getTime() ?? 0) - (parseDate(a.followUpDate)?.getTime() ?? 0));
  }, [filteredLeadFollowups]);

  const latestEnquiryFollowups = useMemo(() => {
    const latest = new Map<string, FollowupRow>();
    filteredEnquiryFollowups.forEach((row) => {
      const key = text(row.candidateName || 'Unknown').trim().toLowerCase();
      const old = latest.get(key);
      if (!old || (parseDate(row.followUpDate ?? row.followupDate)?.getTime() ?? 0) > (parseDate(old.followUpDate ?? old.followupDate)?.getTime() ?? 0)) latest.set(key, row);
    });
    return [...latest.values()].sort((a, b) => (parseDate(b.followUpDate ?? b.followupDate)?.getTime() ?? 0) - (parseDate(a.followUpDate ?? a.followupDate)?.getTime() ?? 0));
  }, [filteredEnquiryFollowups]);

  const leadConverted = filteredLeads.filter((row) => /convert/i.test(row.status || '')).length;
  const leadLost = filteredLeads.filter((row) => /lost|closed/i.test(row.status || '')).length;
  const leadConversionRate = filteredLeads.length ? Math.round(leadConverted * 1000 / filteredLeads.length) / 10 : 0;
  const enquiryConverted = filteredEnquiries.filter((row) => /convert/i.test(row.status || '')).length;
  const enquiryLost = filteredEnquiries.filter((row) => /lost|closed/i.test(row.status || '')).length;
  const enquiryConversionRate = filteredEnquiries.length ? Math.round(enquiryConverted * 1000 / filteredEnquiries.length) / 10 : 0;
  const leadFollowupCompleted = filteredLeadFollowups.filter((row) => completedStatus.test(row.status || '')).length;
  const leadFollowupLost = filteredLeadFollowups.filter((row) => lostStatus.test(row.status || '')).length;
  const leadFollowupPending = Math.max(filteredLeadFollowups.length - leadFollowupCompleted - leadFollowupLost, 0);
  const leadFollowupOverdue = filteredLeadFollowups.filter((row) => {
    const nextDate = parseDate(row.nextFollowupDate);
    return Boolean(nextDate && nextDate < new Date() && !/completed|complete|done|closed|lost|not interested/i.test(row.status || ''));
  }).length;
  const enquiryFollowupUpcoming = filteredEnquiryFollowups.filter((row) => {
    const date = parseDate(row.followUpDate ?? row.followupDate);
    return Boolean(date && date >= new Date());
  }).length;
  const enquiryFollowupPast = filteredEnquiryFollowups.length - enquiryFollowupUpcoming;

  const leadSourceRows = useMemo(() => {
    const stats = new Map<string, { name: string; total: number; converted: number; lost: number }>();
    filteredLeads.forEach((row) => {
      const name = row.sourceName || 'Unknown';
      const current = stats.get(name) ?? { name, total: 0, converted: 0, lost: 0 };
      current.total += 1;
      if (/convert/i.test(row.status || '')) current.converted += 1;
      if (/lost|closed/i.test(row.status || '')) current.lost += 1;
      stats.set(name, current);
    });
    return [...stats.values()].sort((a, b) => b.total - a.total);
  }, [filteredLeads]);

  const counsellorRows = useMemo(() => {
    const stats = new Map<string, { name: string; total: number; completed: number; lost: number }>();
    const add = (row: { followUpBy?: string; status?: string }, includeStatus: boolean) => {
      const name = allowedCounsellors.get(text(row.followUpBy).trim().toLowerCase());
      if (!name) return;
      const current = stats.get(name) ?? { name, total: 0, completed: 0, lost: 0 };
      current.total += 1;
      if (includeStatus && completedStatus.test(row.status || '')) current.completed += 1;
      if (includeStatus && lostStatus.test(row.status || '')) current.lost += 1;
      stats.set(name, current);
    };
    filteredLeadFollowups.forEach((row) => add(row, true));
    filteredEnquiryFollowups.forEach((row) => add(row, false));
    return [...stats.values()].sort((a, b) => b.total - a.total);
  }, [filteredLeadFollowups, filteredEnquiryFollowups, allowedCounsellors]);

  const exportExcel = (kind: 'lead' | 'enquiry') => {
    const rows = kind === 'lead' ? latestLeadFollowups.map((row, index) => ({
      SR: index + 1, 'Lead ID': row.leadId, Candidate: row.candidateName, Counsellor: row.followUpBy,
      'Last Follow-up': formatDate(row.followUpDate), Status: row.status || '', 'Last Follow-up Comment': row.description || '',
      'Next Follow-up': formatDate(row.nextFollowupDate),
    })) : latestEnquiryFollowups.map((row, index) => ({
      SR: index + 1, Candidate: row.candidateName, Counsellor: row.followUpBy,
      'Last Follow-up': formatDate(row.followUpDate ?? row.followupDate), 'Last Follow-up Comment': row.description || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, kind === 'lead' ? 'Lead Follow-up' : 'Enquiry Follow-up');
    XLSX.writeFile(book, kind === 'lead' ? 'Lead-Followup-Report.xlsx' : 'Enquiry-Followup-Report.xlsx');
  };

  const exportPdf = (kind: 'lead' | 'enquiry') => {
    const doc = new jsPDF('landscape');
    const lead = kind === 'lead';
    doc.setFontSize(16);
    doc.text(lead ? 'Lead Follow-up Report' : 'Enquiry Follow-up Report', 14, 15);
    doc.setFontSize(9);
    doc.text(`Period: ${dateFrom || 'All'} to ${dateTo || 'All'}`, 14, 22);
    const rows = lead ? latestLeadFollowups.map((row, index) => [
      index + 1, row.leadId, row.candidateName, row.followUpBy, formatDate(row.followUpDate), row.status || '',
      row.description || '', formatDate(row.nextFollowupDate),
    ]) : latestEnquiryFollowups.map((row, index) => [
      index + 1, row.candidateName, row.followUpBy, formatDate(row.followUpDate ?? row.followupDate), row.description || '',
    ]);
    autoTable(doc, {
      head: [lead ? ['SR', 'Lead ID', 'Candidate', 'Counsellor', 'Last Follow-up', 'Status', 'Last Comment', 'Next Follow-up']
        : ['SR', 'Candidate', 'Counsellor', 'Last Follow-up', 'Last Comment']],
      body: rows, startY: 28, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fontSize: 7 },
    });
    doc.save(lead ? 'Lead-Followup-Report.pdf' : 'Enquiry-Followup-Report.pdf');
  };

  const clearFilters = () => { setDateFrom(''); setDateTo(''); setBranchFilter('All'); setCourseFilter('All'); setCounsellorFilter('All'); };
  const setCurrentMonth = () => {
    const today = new Date();
    setDateFrom(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`);
    setDateTo(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    setBranchFilter('All'); setCourseFilter('All'); setCounsellorFilter('All');
  };

  const chartRows = [
    { label: 'Completed', value: leadFollowupCompleted }, { label: 'Pending', value: leadFollowupPending },
    { label: 'Overdue', value: leadFollowupOverdue }, { label: 'Lost / Not Interested', value: leadFollowupLost },
  ];
  const maxChartValue = Math.max(...chartRows.map((row) => row.value), 1);
  const totalFollowups = filteredLeadFollowups.length || 1;
  const completedPct = leadFollowupCompleted / totalFollowups * 100;
  const pendingPct = leadFollowupPending / totalFollowups * 100;
  const overduePct = leadFollowupOverdue / totalFollowups * 100;
  const overdueEnd = completedPct + pendingPct + overduePct;
  const pieBackground = `conic-gradient(#2563eb 0 ${completedPct}%,#f59e0b ${completedPct}% ${completedPct + pendingPct}%,#ef4444 ${completedPct + pendingPct}% ${overdueEnd}%,#64748b ${overdueEnd}% 100%)`;

  return (
    <main className="reports-page">
      <header className="report-header">
        <div><span className="eyebrow">BUSINESS INTELLIGENCE</span><h1>Reports</h1><p>Management view of leads, enquiries and follow-up activity.</p></div>
        <button className="refresh-btn" type="button" onClick={() => void loadReports()}>↻ Refresh</button>
      </header>
      <section className="filters" aria-label="Report filters">
        <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label>Branch<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Course<select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>{courses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Counsellor<select value={counsellorFilter} onChange={(event) => setCounsellorFilter(event.target.value)}>{counsellors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="button" className="clear-btn" onClick={clearFilters}>Clear Filters</button>
        <button type="button" className="clear-btn" onClick={setCurrentMonth}>Current Month</button>
      </section>
      {loading ? <div className="state">Loading business reports…</div> : error ? <div className="error" role="alert">{error}<button type="button" onClick={() => void loadReports()}>Retry</button></div> : (
        <>
          <section className="section">
            <div className="section-title"><div><h2>1. Lead Follow-up Report</h2><p>Latest follow-up for each lead within the selected period.</p></div><div className="section-actions"><button className="export-btn" onClick={() => exportExcel('lead')}>Excel</button><button className="export-btn" onClick={() => exportPdf('lead')}>PDF</button></div></div>
            <div className="kpi-grid follow-kpis">
              <Kpi label="Total Follow-ups" value={filteredLeadFollowups.length} /><Kpi label="Completed" value={leadFollowupCompleted} /><Kpi label="Pending" value={leadFollowupPending} /><Kpi label="Overdue" value={leadFollowupOverdue} /><Kpi label="Lost / Not Interested" value={leadFollowupLost} />
            </div>
            <div className="follow-report-grid">
              <div className="chart-panel"><h3>Lead Follow-up Status</h3><div className="chart-flex"><div className="donut" style={{ background: pieBackground }} /><div className="legend">{chartRows.map((row) => <div key={row.label}><i className={`dot ${row.label.toLowerCase().replace(/[^a-z]+/g, '-')}`} />{row.label}<b>{row.value}</b></div>)}</div></div></div>
              <div className="chart-panel"><h3>Lead Follow-up Graph</h3><div className="bar-chart">{chartRows.map((row) => <div className="chart-row" key={row.label}><span>{row.label}</span><div className="chart-track"><b style={{ width: `${row.value * 100 / maxChartValue}%` }} /></div><strong>{row.value}</strong></div>)}</div></div>
            </div>
            <ReportTable columns={['SR', 'Lead ID', 'Candidate', 'Counsellor', 'Last Follow-up', 'Status', 'Last Follow-up Comment', 'Next Follow-up']} rows={latestLeadFollowups.map((row, index) => [index + 1, row.leadId, row.candidateName, row.followUpBy, formatDate(row.followUpDate), row.status || '—', row.description || '—', formatDate(row.nextFollowupDate)])} />
          </section>
          <section className="section">
            <div className="section-title"><div><h2>2. Enquiry Follow-up Report</h2><p>Separate enquiry follow-up activity using fields exposed by the API.</p></div><div className="section-actions"><button className="export-btn" onClick={() => exportExcel('enquiry')}>Excel</button><button className="export-btn" onClick={() => exportPdf('enquiry')}>PDF</button></div></div>
            <div className="kpi-grid follow-kpis"><Kpi label="Total Recorded" value={filteredEnquiryFollowups.length} /><Kpi label="Upcoming" value={enquiryFollowupUpcoming} /><Kpi label="Past / Recorded" value={enquiryFollowupPast} /></div>
            <ReportTable columns={['SR', 'Candidate', 'Counsellor', 'Last Follow-up', 'Last Follow-up Comment']} rows={latestEnquiryFollowups.map((row, index) => [index + 1, row.candidateName || '—', row.followUpBy || '—', formatDate(row.followUpDate ?? row.followupDate), row.description || '—'])} />
          </section>
          <section className="section">
            <div className="section-title"><div><h2>3. Executive Overview</h2><p>Current business pipeline and activity.</p></div></div>
            <div className="kpi-grid">
              <Kpi label="Leads" value={filteredLeads.length} detail={`${leadConversionRate}% conversion`} /><Kpi label="Enquiries" value={filteredEnquiries.length} detail={`${enquiryConversionRate}% conversion`} />
              <Kpi label="Lead Converted" value={leadConverted} /><Kpi label="Lead Lost / Closed" value={leadLost} /><Kpi label="Enquiry Converted" value={enquiryConverted} /><Kpi label="Enquiry Lost / Closed" value={enquiryLost} />
            </div>
          </section>
          <section className="section">
            <div className="section-title"><div><h2>4. Lead Source Performance</h2><p>Lead count, conversion and loss by source.</p></div></div>
            <div className="source-list">{leadSourceRows.length ? leadSourceRows.map((row) => <div className="source-row" key={row.name}><div className="source-label"><b>{row.name}</b><span>{row.total} leads · {row.converted} converted · {row.lost} lost</span></div><div className="bar"><span style={{ width: `${row.total * 100 / Math.max(...leadSourceRows.map((item) => item.total), 1)}%` }} /></div></div>) : <div className="empty">No lead source data for selected filters.</div>}</div>
          </section>
          <section className="section">
            <div className="section-title"><div><h2>5. Counsellor Performance</h2><p>Follow-up activity by authorized counsellor / super user.</p></div></div>
            <ReportTable columns={['Counsellor', 'Total Follow-ups', 'Completed (Lead)', 'Lost (Lead)']} rows={counsellorRows.map((row) => [row.name, row.total, row.completed, row.lost])} />
          </section>
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="kpi"><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</article>;
}

function ReportTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return <div className="table-wrap report-table"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 6 || cellIndex === 4 ? 'comment-cell' : undefined}>{text(cell) || '—'}</td>)}</tr>) : <tr><td colSpan={columns.length} className="empty">No records match the selected filters.</td></tr>}</tbody></table></div>;
}
