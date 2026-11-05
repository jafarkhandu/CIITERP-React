import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { enquiryFollowupApi, type EnquiryFollowupRecord } from '@/api/enquiryFollowupApi';

function localDateTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function dateValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('en-GB');
}
function idOf(item: Record<string, unknown>): number {
  return Number(item.followupId ?? item.followup_id ?? item.followUpId ?? item.FollowupId ?? item.enquiryFollowupId ?? item.enquiry_followup_id ?? item.id ?? 0);
}

export default function EnquiryFollowup() {
  const navigate = useNavigate();
  const { enquiryId: rawId } = useParams();
  const enquiryId = Number(rawId ?? 0);
  const [enquiry, setEnquiry] = useState<EnquiryRecord | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(0);
  const [newFollowupExpanded, setNewFollowupExpanded] = useState(false);
  const [previousFollowupsExpanded, setPreviousFollowupsExpanded] = useState(false);
  const [form, setForm] = useState({
    candidateName: '', sourceId: 0, sourceName: '', followUpDate: localDateTime(),
    followUpBy: '', description: '', status: 'Hot', nextFollowupDate: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    setLoading(true);
    try {
      const [recordResult, byEnquiryResult, allResult] = await Promise.allSettled([
        enquiryApi.getById(enquiryId),
        enquiryFollowupApi.getByEnquiryId(enquiryId),
        enquiryFollowupApi.getAll(),
      ]);
      if (recordResult.status === 'rejected') throw recordResult.reason;
      const record = recordResult.value;
      const byEnquiry = byEnquiryResult.status === 'fulfilled' ? byEnquiryResult.value : [];
      const allForEnquiry = allResult.status === 'fulfilled'
        ? allResult.value.filter((item) => Number(item.enquiryId ?? (item as any).enquiry_id ?? 0) === enquiryId)
        : [];
      if (byEnquiryResult.status === 'rejected' && allResult.status === 'rejected') throw byEnquiryResult.reason;
      const merged = new Map<number, Record<string, unknown>>();
      [...byEnquiry, ...allForEnquiry].forEach((item) => {
        const id = idOf(item);
        if (id > 0) merged.set(id, { ...item, followupId: id, enquiryId: Number(item.enquiryId ?? (item as any).enquiry_id ?? enquiryId), deletedAt: item.deletedAt ?? (item as any).deleted_at ?? (((item as any).is_deleted ?? (item as any).isDeleted ?? (item as any).deleted) ? 'deleted' : null) });
      });
      setEnquiry(record);
      setItems(Array.from(merged.values()));
      setForm((previous) => ({ ...previous, candidateName: String(record.candidateName ?? ''), sourceName: String(record.leadSources ?? '') }));
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load enquiry follow-ups.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (enquiryId > 0) void load(); else { setLoading(false); setError('Invalid enquiry ID.'); } }, [enquiryId]);

  function resetForm() {
    setEditingId(0);
    setForm({
      candidateName: String(enquiry?.candidateName ?? ''),
      sourceId: Number((enquiry as any)?.sourceId ?? 0),
      sourceName: String(enquiry?.leadSources ?? ''),
      followUpDate: localDateTime(),
      followUpBy: '',
      description: '',
      status: 'Hot',
      nextFollowupDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function edit(item: Record<string, unknown>) {
    const id = idOf(item);
    setSaving(true);
    try {
      const raw = await enquiryFollowupApi.getById(id) as Record<string, unknown>;
      const record = (raw.data ?? raw.result ?? raw) as Record<string, unknown>;
      setEditingId(id);
      setForm({
        candidateName: String(record.candidateName ?? enquiry?.candidateName ?? ''),
        sourceId: Number(record.sourceId ?? 0),
        sourceName: String(record.sourceName ?? enquiry?.leadSources ?? ''),
        followUpDate: String(record.followUpDate ?? localDateTime()).slice(0, 16),
        followUpBy: String(record.followUpBy ?? ''),
        description: String(record.description ?? ''),
        status: String(record.status ?? 'Hot'),
        nextFollowupDate: String(record.nextFollowupDate ?? '').slice(0, 10),
      });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load follow-up for editing.');
    } finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.description.trim() || !form.status) { setError('Status and description are required.'); return; }
    setSaving(true); setError('');
    const payload: EnquiryFollowupRecord = {
      ...form,
      enquiryId,
      candidateName: String(enquiry?.candidateName ?? form.candidateName).trim(),
      followUpDate: new Date(form.followUpDate).toISOString(),
      nextFollowupDate: form.nextFollowupDate ? new Date(`${form.nextFollowupDate}T00:00:00`).toISOString() : form.followUpDate,
    };
    try {
      if (editingId) await enquiryFollowupApi.update(editingId, payload);
      else await enquiryFollowupApi.create(payload);
      resetForm();
      await load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || (editingId ? 'Unable to update follow-up.' : 'Unable to create follow-up.'));
    } finally { setSaving(false); }
  }

  async function remove(item: Record<string, unknown>) {
    const id = idOf(item);
    if (!id || !window.confirm(`Delete follow-up for ${String(item.candidateName ?? enquiry?.candidateName ?? 'candidate')}?`)) return;
    setSaving(true); setError('');
    try { await enquiryFollowupApi.remove(id); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to delete follow-up.'); }
    finally { setSaving(false); }
  }
  async function restore(item: Record<string, unknown>) {
    const id = idOf(item);
    setSaving(true); setError('');
    try { await enquiryFollowupApi.restore(id); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Unable to restore follow-up.'); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="enquiry-page"><p>Loading enquiry details...</p></section>;
  const detail = enquiry as any;
  const detailRows = [
    ['Candidate Name', detail?.candidateName],
    ['Enquiry Date', dateValue(String(detail?.enquiryDate ?? detail?.enquiry_date ?? ''))],
    ['Gender', detail?.gender],
    ['Mobile Number', detail?.mobileNumber ?? detail?.mobile_number],
    ['Email Address', detail?.emailAddress ?? detail?.email_address],
    ['Qualification', detail?.qualificationName ?? detail?.qualification],
    ['Enquiry For', detail?.enquiryFors ?? detail?.enquiryFor ?? detail?.enquiry_fors],
    ['Lead Source', detail?.sourceName ?? detail?.leadSources ?? detail?.lead_sources],
    ['Interested Topics', detail?.interestedTopics ?? detail?.interested_topics],
    ['Branch', detail?.branchName ?? detail?.branch_name],
    ['Status', detail?.status],
    ['Local Address', detail?.localAddress ?? detail?.local_address],
  ];
  return <section className="enquiry-page enquiry-followup-page">
    <header className="enquiry-header">
      <div><h1>Enquiry Followup</h1><p>Manage enquiry followup details</p></div>
      <button className="enquiry-secondary-btn" type="button" onClick={() => navigate('/main/enquiry')}>← Back</button>
    </header>
    {error && <div className="enquiry-alert" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    <section className="enquiry-followup-section enquiry-details-card">
      <div className="enquiry-followup-section-title">
        <div><h2>Enquiry Details</h2><p>Candidate enquiry information</p></div>
        <span className="enquiry-id-pill">Enquiry #{enquiryId}</span>
      </div>
      <div className="enquiry-details-grid">
        {detailRows.map(([label, value]) => <div className="enquiry-detail-item" key={label}>
          <span>{label}</span><strong>{String(value ?? '').trim() || '-'}</strong>
        </div>)}
      </div>
    </section>
    <section className="enquiry-followup-section enquiry-accordion-card">
      <button className="enquiry-accordion-header" type="button" aria-expanded={newFollowupExpanded} onClick={() => setNewFollowupExpanded((value) => !value)}>
        <div className="enquiry-accordion-title"><span className="enquiry-accordion-icon">+</span><div>
          <h3>{editingId ? 'Edit Followup' : 'New Followup'}</h3><p>{editingId ? 'Update followup details' : 'Add a new followup for this enquiry'}</p>
        </div></div><span className="enquiry-accordion-expand">{newFollowupExpanded ? '−' : '+'}</span>
      </button>
      {newFollowupExpanded && <div className="enquiry-accordion-content">
        <form onSubmit={submit}>
          <div className="enquiry-followup-form-grid">
            <label>Candidate Name *<input required value={form.candidateName} readOnly /></label>
            <label>Followup By *<input required value={form.followUpBy} onChange={(e) => setForm({ ...form, followUpBy: e.target.value })} /></label>
            <label>Followup Date *<input type="date" required value={form.followUpDate.slice(0,10)} onChange={(e) => setForm({ ...form, followUpDate: e.target.value + 'T' + (form.followUpDate.slice(11,16) || '09:00') })} /></label>
            <label>Status *<select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['Hot','Warm','Cold'].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Next Followup Date *<input type="date" required value={form.nextFollowupDate} onChange={(e) => setForm({ ...form, nextFollowupDate: e.target.value })} /></label>
            <label className="enquiry-followup-description">Description *<textarea required rows={5} placeholder="Enter followup description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <footer className="enquiry-followup-form-actions">
            {editingId > 0 && <button className="enquiry-secondary-btn" type="button" disabled={saving} onClick={resetForm}>Cancel Edit</button>}
            <button className="enquiry-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Followup' : 'Save Followup'}</button>
          </footer>
        </form>
      </div>}
    </section>
    <section className="enquiry-followup-section enquiry-accordion-card">
      <button className="enquiry-accordion-header" type="button" aria-expanded={previousFollowupsExpanded} onClick={() => setPreviousFollowupsExpanded((value) => !value)}>
        <div className="enquiry-accordion-title"><span className="enquiry-accordion-icon enquiry-history-icon">◷</span><div>
          <h3>Previous Followups</h3><p>Followup history for this enquiry</p>
        </div></div><span className="enquiry-accordion-expand">{previousFollowupsExpanded ? '−' : '+'}</span>
      </button>
      {previousFollowupsExpanded && <div className="enquiry-accordion-content">
        <div className="enquiry-table-scroll"><table className="enquiry-table">
          <thead><tr><th>ID</th><th>Followup Date</th><th>Followup By</th><th>Status</th><th>Next Date</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>{items.map((item, index) => {
            const deleted = Boolean(item.deletedAt ?? item.deleted_at);
            return <tr key={idOf(item) || index}><td>{idOf(item)}</td><td>{dateValue(String(item.followUpDate ?? item.follow_up_date ?? item.followupDate ?? ''))}</td>
              <td>{String(item.followUpBy ?? item.follow_up_by ?? item.followupBy ?? '-')}</td><td>{String(item.status ?? '-')}</td>
              <td>{dateValue(String(item.nextFollowupDate ?? item.next_followup_date ?? ''))}</td><td>{String(item.description ?? '-')}</td>
              <td><div className="enquiry-actions">{deleted ? <button type="button" disabled={saving} onClick={() => void restore(item)}>Restore</button> : <>
                <button type="button" disabled={saving} onClick={() => void edit(item)}>Edit</button><button type="button" disabled={saving} onClick={() => void remove(item)}>Delete</button>
              </>}</div></td></tr>;
          })}{!items.length && <tr><td colSpan={7} className="enquiry-empty">No follow-ups found.</td></tr>}</tbody>
        </table></div>
      </div>}
    </section>
  </section>;
}
