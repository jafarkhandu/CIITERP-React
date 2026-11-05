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
  const enquiryForOptions = ['Job Placement', 'College Project', 'Upgrade Skill', 'Other', 'Real Time Project', 'AI', 'Certification'];
  const leadSourceOptions = ['Website', 'Facebook', 'Instagram', 'Google Ads', 'Walk-in', 'Phone Call', 'Online', 'String', 'CIIT Student', 'Banar'];
  const topicOptions = ['@$','1','2','Advanced Java','AI','AI ML','Ak','ALML','angular','asdf','C#','Data Analytics','DataScience','devops','Dot Net + AI with Azure','Dot Net with AI','Dotnet','DS','Excel','Excel & power bi','FrontEnd Developer','Full stack developer','Full Stack Java + DevOps + AI','full stack Python'];
  function toggleSelection(key: 'enquiryFors' | 'leadSources' | 'interestedTopics', option: string) {
    const selected = form[key].split(',').map((value) => value.trim()).filter(Boolean);
    change(key, selected.includes(option) ? selected.filter((value) => value !== option).join(', ') : [...selected, option].join(', '));
  }
  function isSelected(key: 'enquiryFors' | 'leadSources' | 'interestedTopics', option: string) {
    return form[key].split(',').map((value) => value.trim()).includes(option);
  }

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
          enquiryDate: String(item.enquiryDate ?? item.enquiry_date ?? '').slice(0, 10),
          candidateName: String(item.candidateName ?? item.candidate_name ?? ''),
          gender: String(item.gender ?? ''),
          localAddress: String(item.localAddress ?? item.local_address ?? ''),
          emailAddress: String(item.emailAddress ?? item.email_address ?? item.email ?? ''),
          mobileNumber: String(item.mobileNumber ?? item.mobile_number ?? item.mobile ?? ''),
          birthDate: String(item.birthDate ?? item.birth_date ?? '').slice(0, 10),
          branchId: Number(item.branchId ?? item.branch_id ?? 0),
          branchName: String(item.branchName ?? item.branch_name ?? ''),
          qualificationId: Number(item.qualificationId ?? item.qualification_id ?? 0),
          qualification: String(item.qualification ?? ''),
          leadSources: String(item.leadSources ?? item.lead_sources ?? ''),
          enquiryFors: String(item.enquiryFors ?? item.enquiry_fors ?? ''),
          interestedTopics: String(item.interestedTopics ?? item.interested_topics ?? ''),
          status: String(item.status ?? 'New'),
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
        <div className="enquiry-original-layout">
          <div className="enquiry-original-fields">
            <label>Enquiry Date:<input type="date" required value={form.enquiryDate} onChange={(e) => change('enquiryDate', e.target.value)} /></label>
            <label>Branch Name:<select required value={form.branchId} onChange={(e) => change('branchId', Number(e.target.value))}><option value={0}>Select Branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Candidate Name:<input required minLength={2} placeholder="Enter candidate name" value={form.candidateName} onChange={(e) => change('candidateName', e.target.value)} /></label>
            <fieldset className="enquiry-gender"><legend>Gender:</legend>{['Male','Female','Other'].map((gender) => <label key={gender}><input type="radio" name="gender" required checked={form.gender === gender} onChange={() => change('gender', gender)} />{gender}</label>)}</fieldset>
            <label>Local Address:<textarea rows={2} value={form.localAddress} onChange={(e) => change('localAddress', e.target.value)} /></label>
            <label>Email Address:<input type="email" required value={form.emailAddress} onChange={(e) => change('emailAddress', e.target.value)} /></label>
            <label>Mobile Number:<input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.mobileNumber} onChange={(e) => change('mobileNumber', e.target.value)} /></label>
            <label>Birth Date:<input type="date" value={form.birthDate} onChange={(e) => change('birthDate', e.target.value)} /></label>
            <label>Qualification:<select required value={form.qualificationId} onChange={(e) => {
              const selected = qualifications.find((item) => Number(item.qualificationId ?? item.qualification_id ?? item.id) === Number(e.target.value));
              change('qualificationId', Number(e.target.value));
              change('qualification', String(selected?.qualificationName ?? selected?.qualification_name ?? selected?.name ?? ''));
            }}><option value={0}>Select Qualification</option>{qualifications.map((item) => {
              const qid = Number(item.qualificationId ?? item.qualification_id ?? item.id ?? 0);
              const name = String(item.qualificationName ?? item.qualification_name ?? item.name ?? 'Qualification');
              return <option key={qid} value={qid}>{name}</option>;
            })}</select></label>
            <label>Status:<select value={form.status} onChange={(e) => change('status', e.target.value)}><option>New</option><option>In Progress</option><option>Converted</option><option>Closed</option></select></label>
          </div>
          <div className="enquiry-original-groups">
            <section className="enquiry-choice-panel"><h2>Enquiry For</h2><div className="enquiry-choice-grid">{enquiryForOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('enquiryFors', option)} onChange={() => toggleSelection('enquiryFors', option)} />{option}</label>)}</div></section>
            <section className="enquiry-choice-panel"><h2>How did you come to know about us?</h2><div className="enquiry-choice-grid">{leadSourceOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('leadSources', option)} onChange={() => toggleSelection('leadSources', option)} />{option}</label>)}</div></section>
            <section className="enquiry-choice-panel"><h2>Tick your Interesting Training</h2><div className="enquiry-choice-grid enquiry-topic-grid">{topicOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('interestedTopics', option)} onChange={() => toggleSelection('interestedTopics', option)} />{option}</label>)}</div></section>
          </div>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button className="enquiry-secondary-btn" type="button" disabled={saving} onClick={() => navigate('/main/enquiry')}>Cancel</button>
          <button className="enquiry-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : editMode ? 'Update Enquiry' : 'Create Enquiry'}</button>
        </footer>
      </form>
    </div>
  </section>;
}