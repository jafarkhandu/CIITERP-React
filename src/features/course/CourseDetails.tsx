import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { courseApi, type TrainingCourseRecord } from '@/api/courseApi';
import { trainingCourseTopicApi, trainingTopicContentApi, type TrainingCourseTopic, type TrainingTopicContent } from '@/api/developerTrainingApi';
import { batchApi, batchStudentApi } from '@/api/batchApi';
import { apiErrorMessage } from '@/core/http/errors';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import { userSession } from '@/core/auth/session';
import { PERMISSIONS, permissionService } from '@/core/services/permissionService';
import { positiveId, mappedTopics, topicContents, relatedBatches, countAssignments, type RelatedBatch } from './courseDetailsData';
import './Course.css';
import './CourseDetails.css';

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };
type Tab = 'overview' | 'topics' | 'batches';

function failure(error: unknown, fallback: string): { status: 'error'; message: string } {
  return { status: 'error', message: apiErrorMessage(error, fallback) };
}

function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB');
}

function numericLabel(value: number | null | undefined, suffix = ''): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-IN') + suffix;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <AutoDismissAlert className="course-alert error" message={message}>
    <button type="button" className="course-secondary-btn cd-retry" onClick={retry}>Retry</button>
  </AutoDismissAlert>;
}

function CourseDetailView({ courseId, canTopics, canBatches }: { courseId: number; canTopics: boolean; canBatches: boolean }) {
  const [course, setCourse] = useState<Load<TrainingCourseRecord>>({ status: 'loading' });
  const [topics, setTopics] = useState<Load<TrainingCourseTopic[]>>({ status: 'loading' });
  const [contents, setContents] = useState<Record<number, Load<TrainingTopicContent[]>>>({});
  const [batches, setBatches] = useState<Load<RelatedBatch[]>>({ status: 'loading' });
  const [counts, setCounts] = useState<Record<number, Load<number>>>({});
  const [tab, setTab] = useState<Tab>('overview');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [countAttempt, setCountAttempt] = useState(0);
  const retry = () => setAttempt(value => value + 1);

  useEffect(() => {
    let active = true;
    setCourse({ status: 'loading' });
    setTopics({ status: 'loading' });
    setBatches({ status: 'loading' });
    setContents({});
    setCounts({});
    setExpanded(null);

    async function load() {
      let selected: TrainingCourseRecord;
      try {
        const records = await courseApi.getAll();
        if (!active) return;
        const found = records.find(item => item.courseId === courseId);
        if (!found) {
          setCourse({ status: 'error', message: 'Course not found in the available course list.' });
          return;
        }
        selected = found;
        setCourse({ status: 'ready', data: selected });
      } catch (error) {
        if (active) setCourse(failure(error, 'Unable to load course details.'));
        return;
      }

      if (!canTopics) return;
      let mapped: TrainingCourseTopic[];
      try {
        const catalog = await trainingCourseTopicApi.getCourses();
        if (!active) return;
        const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
        const verified = catalog.some(item => item.courseId === courseId &&
          normalized(item.courseName) === normalized(selected.courseName));
        if (!verified) {
          setTopics({ status: 'error', message: 'Course identity could not be matched in the Developer service.' });
          return;
        }
        const rows = await trainingCourseTopicApi.getByCourse(courseId);
        if (!active) return;
        mapped = mappedTopics(rows, courseId);
        setTopics({ status: 'ready', data: mapped });
      } catch (error) {
        if (active) setTopics(failure(error, 'Unable to load course topics.'));
        return;
      }

      // Limit content requests to four concurrent calls. Each topic has its
      // own result so one failed request cannot hide successful content.
      setContents(Object.fromEntries(mapped.map(topic => [topic.topicId, { status: 'loading' } as const])));
      async function loadContents() {
        for (let index = 0; active && index < mapped.length; index += 4) {
          await Promise.all(mapped.slice(index, index + 4).map(async topic => {
            let result: Load<TrainingTopicContent[]>;
            try {
              result = { status: 'ready', data: topicContents(await trainingTopicContentApi.getByTopic(topic.topicId), topic.topicId) };
            } catch (error) {
              result = failure(error, 'Unable to load topic content.');
            }
            if (active) setContents(previous => ({ ...previous, [topic.topicId]: result }));
          }));
        }
      }

      async function loadBatches() {
        if (!canBatches) return;
        if (!mapped.length) {
          if (active) setBatches({ status: 'ready', data: [] });
          return;
        }
        try {
          const rows = await batchApi.getAll();
          if (active) setBatches({ status: 'ready', data: relatedBatches(rows, mapped) });
        } catch (error) {
          if (active) setBatches(failure(error, 'Unable to load related batches.'));
        }
      }

      await Promise.all([loadContents(), loadBatches()]);
    }

    void load();
    return () => { active = false; };
  }, [courseId, canTopics, canBatches, attempt]);

  // Only request student counts when the Batches tab is open. Never retrieve
  // a global student list or display student personal details on this page.
  useEffect(() => {
    if (!canBatches || tab !== 'batches' || batches.status !== 'ready') return;
    let active = true;
    const batchRows = batches.data.filter(batch => !batch.deleted);
    setCounts(Object.fromEntries(batchRows.map(batch => [batch.id, { status: 'loading' } as const])));
    async function loadCounts() {
      for (let index = 0; active && index < batchRows.length; index += 4) {
        await Promise.all(batchRows.slice(index, index + 4).map(async batch => {
          let result: Load<number>;
          try {
            result = { status: 'ready', data: countAssignments(await batchStudentApi.getByBatch(batch.id), batch.id) };
          } catch (error) {
            result = failure(error, 'Unable to load student count.');
          }
          if (active) setCounts(previous => ({ ...previous, [batch.id]: result }));
        }));
      }
    }
    void loadCounts();
    return () => { active = false; };
  }, [batches, canBatches, tab, countAttempt]);

  const topicRows = topics.status === 'ready' ? topics.data : [];
  const allContentsLoaded = topics.status === 'ready' && topicRows.every(topic => contents[topic.topicId]?.status === 'ready');
  const contentCount = allContentsLoaded ? topicRows.reduce((sum, topic) => {
    const result = contents[topic.topicId];
    return sum + (result?.status === 'ready' ? result.data.length : 0);
  }, 0) : null;
  const batchRows = batches.status === 'ready' ? batches.data : [];
  const countErrors = [...new Set(Object.values(counts).flatMap(result => result.status === 'error' ? [result.message] : []))];

  return (
    <section className="course-page cd-page">
      <Link className="cd-back" to="/main/course"><i className="bi bi-arrow-left" aria-hidden="true" /> Back to Courses</Link>
      {course.status === 'loading' ? <p role="status" className="cd-muted">Loading course details…</p>
        : course.status === 'error' ? <LoadError message={course.message} retry={retry} />
        : <>
          <header className="course-header cd-header">
            <div><p className="cd-eyebrow">COURSE MANAGEMENT / COURSE DETAILS</p><h1>{course.data.courseName}</h1><p>Course overview, curriculum and related batches.</p></div>
            <span className={'cd-status' + (course.data.deletedAt ? ' is-inactive' : '')}>{course.data.deletedAt ? 'Deleted' : 'Active'}</span>
          </header>
          <div className="cd-stats">
            <div><span>Total Topics</span><strong>{canTopics && topics.status === 'ready' ? topicRows.length : '—'}</strong></div>
            <div><span>Total Contents</span><strong>{canTopics ? contentCount ?? '—' : '—'}</strong></div>
            <div><span>Related Batches</span><strong>{canTopics && canBatches && batches.status === 'ready' ? batchRows.length : '—'}</strong></div>
          </div>
          <div className="cd-panel">
            <nav className="cd-tabs" aria-label="Course details sections">
              {([['overview', 'Overview'], ['topics', 'Topics & Content'], ['batches', 'Batches']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'is-active' : ''}
                  onClick={() => setTab(value)}>{label}</button>
              ))}
            </nav>
            {tab === 'overview' && <div className="cd-section">
              <h2>Course information</h2>
              <dl className="cd-overview">
                <div><dt>Course Name</dt><dd>{course.data.courseName}</dd></div>
                <div><dt>Course ID</dt><dd>{course.data.courseId}</dd></div>
                <div><dt>Fees Amount</dt><dd>{course.data.feesAmount == null ? '—' : '₹' + numericLabel(course.data.feesAmount)}</dd></div>
                <div><dt>Fees Change Date</dt><dd>{dateLabel(course.data.feesChangeDate)}</dd></div>
                <div><dt>Installment Percentage</dt><dd>{numericLabel(course.data.installmentPercentage, '%')}</dd></div>
                <div><dt>Status</dt><dd>{course.data.deletedAt ? 'Deleted' : 'Active'}</dd></div>
              </dl>
              {canTopics && topics.status === 'error' && <LoadError message={topics.message} retry={retry} />}
              {canTopics && canBatches && batches.status === 'error' && <LoadError message={batches.message} retry={retry} />}
            </div>}
            {tab === 'topics' && <div className="cd-section">
              <h2>Mapped topics & content</h2>
              {!canTopics ? <p className="cd-muted">Topic details are restricted to authorized Developer and Super User accounts.</p>
                : topics.status === 'loading' ? <p role="status" className="cd-muted">Loading topics…</p>
                : topics.status === 'error' ? <LoadError message={topics.message} retry={retry} />
                : !topicRows.length ? <p className="cd-muted">No active topics are mapped to this course.</p>
                : <div className="cd-topics">{topicRows.map(topic => {
                  const open = expanded === topic.topicId;
                  const result = contents[topic.topicId];
                  return <article key={topic.topicId} className="cd-topic">
                    <button type="button" className="cd-topic-toggle" aria-expanded={open}
                      onClick={() => setExpanded(previous => previous === topic.topicId ? null : topic.topicId)}>
                      <i className="bi bi-book" aria-hidden="true" />
                      <strong>{topic.topicName || 'Topic #' + topic.topicId}</strong>
                      <span>{result?.status === 'ready' ? result.data.length + ' contents' : result?.status === 'error' ? 'Unavailable' : 'Loading…'}</span>
                      <i className={open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} aria-hidden="true" />
                    </button>
                    {open && <div className="cd-topic-content">
                      {!result || result.status === 'loading' ? <p role="status" className="cd-muted">Loading content…</p>
                        : result.status === 'error' ? <LoadError message={result.message} retry={retry} />
                        : !result.data.length ? <p className="cd-muted">No active content for this topic.</p>
                        : <div className="cd-table-scroll"><table className="course-table cd-content-table">
                          <thead><tr><th>#</th><th>Content</th><th>Slides</th><th>Video</th></tr></thead>
                          <tbody>{result.data.map((item, index) => <tr key={item.contentId}>
                            <td>{index + 1}</td><td>{item.contentName || '—'}</td><td>{item.slides || '—'}</td><td>{item.videoName || '—'}</td>
                          </tr>)}</tbody>
                        </table></div>}
                    </div>}
                  </article>;
                })}</div>}
            </div>}
            {tab === 'batches' && <div className="cd-section">
              <h2>Related batches</h2>
              <p className="cd-muted">Batches are matched by mapped Topic ID. A topic may be shared by multiple courses; these are not exclusive course enrollments.</p>
              {!canBatches || !canTopics ? <p className="cd-muted">Access to both course topics and batch management is required.</p>
                : topics.status === 'error' ? <LoadError message={topics.message} retry={retry} />
                : batches.status === 'loading' ? <p role="status" className="cd-muted">Loading related batches…</p>
                : batches.status === 'error' ? <LoadError message={batches.message} retry={retry} />
                : !batchRows.length ? <p className="cd-muted">No related batches found.</p>
                : <>
                  <p className="cd-muted">{batchRows.filter(batch => !batch.deleted).length} active · {batchRows.filter(batch => batch.deleted).length} deleted/inactive</p>
                  {countErrors.length > 0 && <LoadError message={countErrors.join(' ')} retry={() => setCountAttempt(value => value + 1)} />}
                  <div className="cd-table-scroll"><table className="course-table cd-batch-table">
                    <thead><tr><th>Batch</th><th>Topic</th><th>Trainer</th><th>Branch</th><th>Start Date</th><th>End Date</th><th>Timing</th><th>Students</th><th>Status</th></tr></thead>
                    <tbody>{batchRows.map(batch => {
                      const count = counts[batch.id];
                      return <tr key={batch.id}>
                        <td><strong>{batch.name}</strong></td><td>{batch.topic}</td><td>{batch.trainer}</td><td>{batch.branch}</td>
                        <td>{dateLabel(batch.startDate)}</td><td>{dateLabel(batch.endDate)}</td><td>{batch.timing}</td>
                        <td>{batch.deleted ? '—' : count?.status === 'ready' ? count.data : count?.status === 'error' ? '—' : '…'}</td>
                        <td><span className={'cd-status ' + (batch.deleted ? 'is-inactive' : '')}>{batch.deleted ? 'Deleted / inactive' : 'Active'}</span></td>
                      </tr>;
                    })}</tbody>
                  </table></div>
                </>}
            </div>}
          </div>
        </>}
    </section>
  );
}

export default function CourseDetails() {
  const { courseId: param } = useParams();
  const session = useSession();
  usePermissionVersion();
  const courseId = positiveId(param);
  const canTopics = userSession.hasAnyRole(['Developer', 'Super User']) &&
    permissionService.hasPermission(PERMISSIONS.COURSE_VIEW);
  const canBatches = userSession.hasAnyRole(['Admin', 'Super User', 'Group Leader']) &&
    permissionService.hasPermission(PERMISSIONS.GROUP_LEADER_BATCH_VIEW);

  if (!courseId || !param || !/^\d+$/.test(param)) {
    return <section className="course-page"><p>Invalid course ID.</p><Link to="/main/course">Back to Courses</Link></section>;
  }

  return <CourseDetailView key={courseId + '-' + session.generation + '-' + canTopics + '-' + canBatches}
    courseId={courseId} canTopics={canTopics} canBatches={canBatches} />;
}
