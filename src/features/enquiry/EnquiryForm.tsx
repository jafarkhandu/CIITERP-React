import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { directoryApi, type BranchOption } from '@/api/directoryApi';

type FormState = Omit<EnquiryRecord, 'enquiryId'>;
const initialForm: FormState = {
  enquiryDate: new Date().toISOString().slice(0, 10),
  candidateName: '',
  gender: '',
  localAddress: '',
  emailAddress: '',
  mobileNumber: '',
  birthDate: '',
  qualificationId: 0,
  qualification: '',
  leadSources: '',
  enquiryFors: '',
  interestedTopics: '',
  status: 'New',
  branchId: 0,
  branchName: '',
};

function rows(value: any): any[] {
  let current = value;
  for (let i = 0; i < 4 && current && !Array.isArray(current); i += 1) {
    current = current.data ?? current.result ?? current.items ?? current.records ?? current.$values;
  }
  return Array.isArray(current) ? current : [];
}

export default function EnquiryForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const enquiryId = Number(id ?? 0);
  const editMode = enquiryId > 0;
  const [form, setForm] = useState<FormState>(initialForm);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [qualifications, setQualifications] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(editMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      directoryApi.getBranches(),
      enquiryApi.getQualifications(),
      editMode ? enquiryApi.getById(enquiryId) : Promise.resolve(null),
    ]).then(([branchResult, qualificationResult, enquiryResult]) => {
      if (!active) return;
      if (branchResult.status === 'fulfilled') setBranches(branchResult.value);
      if (qualificationResult.status === 'fulfilled') setQualifications(qualificationResult.value);
      if (editMode && enquiryResult.status === 'fulfilled' && enquiryResult.value) {
        const item = enquiryResult.value as any;
        setForm({
          ...initialForm,
          ...item,
          enquiryDate: String(item.enquiryDate ?? '').slice(0, 10),
          birthDate: String(item.birthDate ?? '').slice(0, 10),
          branchId: Number(item.branchId ?? item.branch_id ?? 0),
          qualificationId: Number(item.qualificationId ?? item.qualification_id ?? 0),
          qualification: String(item.qualification ?? ''),
          leadSources: String(item.leadSources ?? item.lead_sources ?? ''),
          enquiryFors: String(item.enquiryFors ?? item.enquiry_fors ?? ''),
          interestedTopics: String(item.interestedTopics ?? item.interested_topics ?? ''),
        });
      } else if (editMode && enquiryResult.status === 'rejected') {
        setError('Unable to load enquiry details.');
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [editMode, enquiryId]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const branch = branches.find((item) => item.id === Number(form.branchId));
    const qualification = qualifications.find((item) =>
      Number(item.qualificationId ?? item.qualification_id ?? item.id) === Number(form.qualificationId));
    const qualificationName = String(qualification?.qualificationName ?? qualification?.qualification_name ?? qualification?.name ?? form.qualification).trim();
    if (!branch || !qualificationName) {
      setError('Please select a branch and qualification.');
      return;
    }
    if (!/^\\d{10}$/.test(form.mobileNumber)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    const payload: any = {
      ...form,
      branchId: branch.id,
      branchName: branch.name,
      qualificationId: Number(form.qualificationId),
      qualification: qualificationName,
      status: form.status || 'New',
      enquiryFors: form.enquiryFors.trim(),
      leadSources: form.leadSources.trim(),
      interestedTopics: form.interestedTopics.trim(),
    };
    setSaving(true);
    try {
      if (editMode) await enquiryApi.update(enquiryId, { enquiryId, ...payload } as EnquiryRecord);
      else await enquiryApi.create(payload);
      navigate('/main/enquiry');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || (editMode ? 'Unable to update enquiry.' : 'Unable to create enquiry.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="enquiry-page"><p>Loading enquiry...</p></section>;

  return <section className="enquiry-page">
    <header className="enquiry-header"><div><h1>{editMode ? 'Edit Enquiry' : 'Add Enquiry'}</h1><p>Capture candidate enquiry details</p></div>
      <button className="enquiry-secondary-btn" type="button" onClick={() => navigate('/main/enquiry')}>Back to Enquiries</button>
    </header>
    {error && <div className="enquiry-alert" role="alert">{error}</div>}
    <div className="enquiry-table-card" style={{ padding: 24 }}>
      <form onSubmit={submit} className="enquiry-form">
        <div className="enquiry-filters">
          <label>Enquiry Date *<input type="date" required value={form.enquiryDate} onChange={(e) => change('enquiryDate', e.target.value)} /></label>
          <label>Branch *<select required value={form.branchId} onChange={(e) => change('branchId', Number(e.target.value))}><option value={0}>Select Branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Candidate Name *<input required minLength={2} value={form.candidateName} onChange={(e) => change('candidateName', e.target.value)} /></label>
          <label>Gender *<select required value={form.gender} onChange={(e) => change('gender', e.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label>Email *<input type="email" required value={form.emailAddress} onChange={(e) => change('emailAddress', e.target.value)} /></label>
          <label>Mobile *<input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.mobileNumber} onChange={(e) => change('mobileNumber', e.target.value)} /></label>
          <label>Birth Date<input type="date" value={form.birthDate} onChange={(e) => change('birthDate', e.target.value)} /></label>
          <label>Qualification *<select required value={form.qualificationId} onChange={(e) => {
            const selected = qualifications.find((item) => Number(item.qualificationId ?? item.qualification_id ?? item.id) === Number(e.target.value));
            change('qualificationId', Number(e.target.value));
            change('qualification', String(selected?.qualificationName ?? selected?.qualification_name ?? selected?.name ?? ''));
          }}><option value={0}>Select Qualification</option>{qualifications.map((item) => {
            const qid = Number(item.qualificationId ?? item.qualification_id ?? item.id ?? 0);
            const name = String(item.qualificationName ?? item.qualification_name ?? item.name ?? 'Qualification');
            return <option key={qid} value={qid}>{name}</option>;
          })}</select></label>
          <label>Enquiry For (comma-separated)<input value={form.enquiryFors} onChange={(e) => change('enquiryFors', e.target.value)} /></label>
          <label>Lead Sources (comma-separated)<input value={form.leadSources} onChange={(e) => change('leadSources', e.target.value)} /></label>
          <label>Interested Topics (comma-separated)<input value={form.interestedTopics} onChange={(e) => change('interestedTopics', e.target.value)} /></label>
          <label>Status<input value={form.status} onChange={(e) => change('status', e.target.value)} /></label>
        </div>
        <label>Local Address<textarea rows={3} value={form.localAddress} onChange={(e) => change('localAddress', e.target.value)} /></label>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button className="enquiry-secondary-btn" type="button" disabled={saving} onClick={() => navigate('/main/enquiry')}>Cancel</button>
          <button className="enquiry-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : editMode ? 'Update Enquiry' : 'Create Enquiry'}</button>
        </footer>
      </form>
    </div>
  </section>;
}
