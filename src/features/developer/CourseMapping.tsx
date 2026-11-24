import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  trainingCourseTopicApi,
  trainingError,
  trainingTopicApi,
  type TrainingCourseOption,
  type TrainingCourseTopic,
  type TrainingTopic,
} from '@/api/developerTrainingApi';
import './DeveloperTraining.css';

export default function CourseMapping() {
  const [courses, setCourses] = useState<TrainingCourseOption[]>([]);
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [mappings, setMappings] = useState<TrainingCourseTopic[]>([]);
  const [courseId, setCourseId] = useState(0);
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [coursesError, setCoursesError] = useState('');
  const [topicsError, setTopicsError] = useState('');
  const [mappingLoading, setMappingLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage();
  const [success, setSuccess] = useAutoDismissMessage();

  useEffect(() => {
    let active = true;
    void trainingCourseTopicApi.getCourses()
      .then(courseRows => {
        if (!active) return;
        setCourses(courseRows);
        setCourseId(courseRows[0]?.courseId ?? 0);
      })
      .catch(requestError => {
        if (active) setCoursesError(trainingError(requestError, 'Unable to load courses.'));
      })
      .finally(() => {
        if (active) setCoursesLoading(false);
      });
    void trainingTopicApi.getAll()
      .then(topicRows => {
        if (active) setTopics(topicRows);
      })
      .catch(requestError => {
        if (active) setTopicsError(trainingError(requestError, 'Unable to load topics.'));
      })
      .finally(() => {
        if (active) setTopicsLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function refreshMappings(id: number) {
    const items = await trainingCourseTopicApi.getByCourse(id);
    setMappings(current => [
      ...items,
      ...current.filter(item => item.isDeleted && !items.some(latest => latest.courseTopicId === item.courseTopicId)),
    ]);
    setSelectedTopicIds([...new Set(items.filter(item => !item.isDeleted).map(item => item.topicId))]);
  }

  useEffect(() => {
    if (!courseId) {
      setMappings([]);
      setSelectedTopicIds([]);
      return;
    }
    let active = true;
    setMappingLoading(true);
    setMappings([]);
    setSelectedTopicIds([]);
    trainingCourseTopicApi.getByCourse(courseId)
      .then(items => {
        if (!active) return;
        setMappings(items);
        setSelectedTopicIds([...new Set(items.filter(item => !item.isDeleted).map(item => item.topicId))]);
      })
      .catch(requestError => {
        if (active) setError(trainingError(requestError, 'Unable to load course mappings.'));
      })
      .finally(() => {
        if (active) setMappingLoading(false);
      });
    return () => { active = false; };
  }, [courseId]);

  const activeMappings = mappings.filter(item => !item.isDeleted);
  const visibleMappings = mappings.filter(item => showDeleted || !item.isDeleted);
  const matchingTopics = useMemo(() => topics.filter(item =>
    !item.isDeleted && item.topicName.toLowerCase().includes(search.trim().toLowerCase())),
  [topics, search]);
  const selectedCourse = courses.find(item => item.courseId === courseId);

  function toggleTopic(topicId: number) {
    setSelectedTopicIds(current => current.includes(topicId)
      ? current.filter(id => id !== topicId)
      : [...current, topicId]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseId || selectedTopicIds.length === 0) {
      setError('Select a course and at least one topic.');
      return;
    }
    const knownIds = new Set(topics.filter(item => !item.isDeleted).map(item => item.topicId));
    if (selectedTopicIds.some(id => !knownIds.has(id))) {
      setError('Please select valid, active topics.');
      return;
    }
    const previousIds = new Set(activeMappings.map(item => item.topicId));
    const removed = activeMappings.filter(item => !selectedTopicIds.includes(item.topicId));
    if (removed.length > 0 && !window.confirm(
      `This will remove ${removed.length} topic mapping(s) from "${selectedCourse?.courseName ?? 'this course'}". Continue?`,
    )) return;

    const selected = [...new Set(selectedTopicIds)];
    const unchanged = selected.length === previousIds.size && selected.every(id => previousIds.has(id));
    if (unchanged) {
      setSuccess('No mapping changes to save.');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = { courseId, topicIds: selected };
      if (activeMappings.length > 0) {
        await trainingCourseTopicApi.update(courseId, payload);
      } else {
        await trainingCourseTopicApi.createMultiple(payload);
      }
      await refreshMappings(courseId);
      setSuccess('Course mapping saved successfully.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to save course mapping.'));
    } finally {
      setSaving(false);
    }
  }

  async function changeMappingState(item: TrainingCourseTopic) {
    if (!item.isDeleted && !window.confirm(
      `Remove "${item.topicName}" from this course?`,
    )) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (item.isDeleted) {
        await trainingCourseTopicApi.restore(item.courseTopicId);
      } else {
        await trainingCourseTopicApi.remove(item.courseTopicId);
        setShowDeleted(true);
      }
      // Retain deleted mappings in the current view when the backend hides them.
      setMappings(current => current.map(row =>
        row.courseTopicId === item.courseTopicId ? { ...row, isDeleted: !item.isDeleted } : row));
      setSelectedTopicIds(current => item.isDeleted
        ? [...new Set([...current, item.topicId])]
        : current.filter(id => id !== item.topicId));
      setSuccess(item.isDeleted ? 'Mapping restored.' : 'Mapping removed.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to change mapping status.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dt-page dt-mapping-page">
      <header className="dt-heading">
        <div>
          <h1>Course Mapping</h1>
          <p>Connect training topics to the courses available in the Developer service.</p>
        </div>
      </header>

      {error && <div className="dt-notice dt-error" role="alert">{error}</div>}
      {coursesError && <AutoDismissAlert className="dt-notice dt-error" message={coursesError} />}
      {topicsError && <AutoDismissAlert className="dt-notice dt-error" message={topicsError} />}
      {success && <div className="dt-notice dt-success" role="status">{success}</div>}

      <div className="dt-panel dt-course-selector">
        <label>Choose Course
          <select aria-label="Choose course" value={courseId || ''}
            disabled={coursesLoading || Boolean(coursesError) || saving}
            onChange={event => {
              setError('');
              setSuccess('');
              setCourseId(Number(event.target.value));
            }}>
            {courses.length === 0 && <option value="">{coursesLoading ? 'Loading courses…' : 'No courses available'}</option>}
            {courses.map(course => <option key={course.courseId} value={course.courseId}>
              {course.courseName} (ID: {course.courseId})
            </option>)}
          </select>
        </label>
      </div>

      <div className="dt-split dt-mapping-layout">
        <div className="dt-panel">
          <h2>Choose Topics</h2>
          <p className="dt-muted">Select the topics that should belong to this course.</p>
          <form onSubmit={submit}>
            <input className="dt-search" aria-label="Search available topics"
              placeholder="Search topics..." value={search}
              onChange={event => setSearch(event.target.value)} />
            <div className="dt-check-list dt-mapping-topic-grid">
              {topicsLoading ? <p className="dt-muted" role="status">Loading topics…</p>
                : matchingTopics.length === 0 && !topicsError ? <p className="dt-muted">No active topics found.</p>
                  : matchingTopics.map(topic => <label key={topic.topicId} className={`dt-topic-checkbox dt-mapping-topic-card${selectedTopicIds.includes(topic.topicId) ? ' is-selected' : ''}`}>
                    <input type="checkbox" checked={selectedTopicIds.includes(topic.topicId)}
                      disabled={!courseId || mappingLoading || saving}
                      onChange={() => toggleTopic(topic.topicId)} />
                    <span><strong>{topic.topicName}</strong></span>
                  </label>)}
            </div>
            <div className="dt-form-actions">
              <button type="submit" className="dt-primary"
                disabled={!courseId || topicsLoading || mappingLoading || saving || topics.length === 0}>
                {saving ? 'Saving…' : 'Save Mapping'}
              </button>
            </div>
          </form>
        </div>

        <div className="dt-panel">
          <div className="dt-panel-header">
            <div>
              <h2>Mapped Topics ({activeMappings.length})</h2>
              <p>{selectedCourse ? selectedCourse.courseName : 'Select a course.'}</p>
            </div>
            <label className="dt-check"><input type="checkbox" checked={showDeleted}
              onChange={event => setShowDeleted(event.target.checked)} /> Show deleted</label>
          </div>
          {mappingLoading ? <p className="dt-muted">Loading mappings…</p>
            : visibleMappings.length === 0 ? <p className="dt-muted">No topics mapped to this course.</p>
              : <div className="dt-table-wrap"><table className="dt-table">
                <thead><tr><th>Mapping ID</th><th>Topic</th><th>Actions</th></tr></thead>
                <tbody>{visibleMappings.map(item => <tr key={item.courseTopicId}>
                  <td>{item.courseTopicId}</td>
                  <td>
                    <strong>{item.topicName || topics.find(topic => topic.topicId === item.topicId)?.topicName || 'Unknown topic'}</strong>
                    <small>Topic ID: {item.topicId}{item.isDeleted ? ' · Deleted' : ''}</small>
                  </td>
                  <td><div className="dt-row-actions">
                    <button type="button" disabled={saving}
                      onClick={() => void changeMappingState(item)}>
                      {item.isDeleted ? 'Restore' : 'Delete'}
                    </button>
                  </div></td>
                </tr>)}</tbody>
              </table></div>}
        </div>
      </div>
    </section>
  );
}
