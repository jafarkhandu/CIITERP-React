import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  trainingError,
  trainingTopicApi,
  trainingTopicContentApi,
  type ContentInput,
  type TopicInput,
  type TrainingTopic,
  type TrainingTopicContent,
} from '@/api/developerTrainingApi';
import './DeveloperTraining.css';

const EMPTY_TOPIC: TopicInput = { topicName: '', publicFolderId: '' };
const EMPTY_CONTENT: ContentInput = { contentName: '', slides: '', videoName: '' };

export default function Topics() {
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [contents, setContents] = useState<TrainingTopicContent[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState(0);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [topicEditor, setTopicEditor] = useState<number | 'new' | null>(null);
  const [contentEditor, setContentEditor] = useState<number | 'new' | null>(null);
  const [topicForm, setTopicForm] = useState<TopicInput>(EMPTY_TOPIC);
  const [contentForm, setContentForm] = useState<ContentInput>(EMPTY_CONTENT);
  const [contentTopicId, setContentTopicId] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function refreshTopics() {
    const next = await trainingTopicApi.getAll();
    setTopics(current => [
      ...next,
      ...current.filter(item => item.isDeleted && !next.some(latest => latest.topicId === item.topicId)),
    ]);
    setSelectedTopicId(current =>
      next.some(item => item.topicId === current && !item.isDeleted)
        ? current
        : (next.find(item => !item.isDeleted)?.topicId ?? 0));
  }

  async function refreshContents(topicId: number) {
    const next = await trainingTopicContentApi.getByTopic(topicId);
    setContents(current => [
      ...next,
      ...current.filter(item => item.isDeleted && !next.some(latest => latest.contentId === item.contentId)),
    ]);
  }

  useEffect(() => {
    let active = true;
    trainingTopicApi.getAll()
      .then(items => {
        if (!active) return;
        setTopics(items);
        setSelectedTopicId(items.find(item => !item.isDeleted)?.topicId ?? 0);
      })
      .catch(requestError => {
        if (active) setError(trainingError(requestError, 'Unable to load topics.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedTopicId) {
      setContents([]);
      return;
    }
    let active = true;
    setContents([]);
    setContentsLoading(true);
    trainingTopicContentApi.getByTopic(selectedTopicId)
      .then(items => {
        if (active) setContents(items);
      })
      .catch(requestError => {
        if (active) setError(trainingError(requestError, 'Unable to load topic content.'));
      })
      .finally(() => {
        if (active) setContentsLoading(false);
      });
    return () => { active = false; };
  }, [selectedTopicId]);

  const visibleTopics = useMemo(() => topics.filter(item =>
    item.topicName.toLowerCase().includes(search.trim().toLowerCase()) &&
    (showDeleted || !item.isDeleted)), [topics, search, showDeleted]);
  const visibleContents = contents.filter(item => showDeleted || !item.isDeleted);
  const selectedTopic = topics.find(item => item.topicId === selectedTopicId);

  function startTopicEditor(item?: TrainingTopic) {
    setError('');
    setSuccess('');
    setContentEditor(null);
    setTopicEditor(item?.topicId ?? 'new');
    setTopicForm(item
      ? { topicName: item.topicName, publicFolderId: item.publicFolderId ?? '' }
      : { ...EMPTY_TOPIC });
  }

  function startContentEditor(item?: TrainingTopicContent) {
    setError('');
    setSuccess('');
    setTopicEditor(null);
    setContentEditor(item?.contentId ?? 'new');
    setContentTopicId(item?.topicId ?? selectedTopicId);
    setContentForm(item
      ? { contentName: item.contentName, slides: item.slides, videoName: item.videoName }
      : { ...EMPTY_CONTENT });
  }

  async function submitTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (topicForm.topicName.trim().length < 2) {
      setError('Enter a topic name with at least 2 characters.');
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    const payload: TopicInput = {
      topicName: topicForm.topicName.trim(),
      publicFolderId: topicForm.publicFolderId.trim(),
    };
    try {
      if (typeof topicEditor === 'number') {
        await trainingTopicApi.update(topicEditor, payload);
      } else {
        await trainingTopicApi.create(payload);
      }
      await refreshTopics();
      setTopicEditor(null);
      setSuccess('Topic saved successfully.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to save topic.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetTopicId = typeof contentEditor === 'number' ? contentTopicId : selectedTopicId;
    if (!targetTopicId ||
        !topics.some(topic => topic.topicId === targetTopicId && !topic.isDeleted) ||
        contentForm.contentName.trim().length < 2) {
      setError('Select an active topic and enter a content name with at least 2 characters.');
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    const payload: ContentInput = {
      contentName: contentForm.contentName.trim(),
      slides: contentForm.slides.trim(),
      videoName: contentForm.videoName.trim(),
    };
    try {
      if (typeof contentEditor === 'number') {
        await trainingTopicContentApi.update(contentEditor, targetTopicId, payload);
      } else {
        await trainingTopicContentApi.create(selectedTopicId, [payload]);
      }
      if (targetTopicId === selectedTopicId) {
        await refreshContents(selectedTopicId);
      } else {
        // Load the destination topic so the moved content is visible immediately.
        setSelectedTopicId(targetTopicId);
      }
      setContentEditor(null);
      setSuccess('Topic content saved successfully.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to save topic content.'));
    } finally {
      setSaving(false);
    }
  }

  async function changeTopicState(item: TrainingTopic) {
    if (!item.isDeleted && !window.confirm(`Delete topic "${item.topicName}"?`)) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (item.isDeleted) {
        await trainingTopicApi.restore(item.topicId);
        setTopics(current => current.map(row =>
          row.topicId === item.topicId ? { ...row, isDeleted: false } : row));
      } else {
        await trainingTopicApi.remove(item.topicId);
        // Keep deleted entries available for Restore even if get-all hides them.
        setTopics(current => current.map(row =>
          row.topicId === item.topicId ? { ...row, isDeleted: true } : row));
        setShowDeleted(true);
      }
      setSuccess(item.isDeleted ? 'Topic restored.' : 'Topic deleted.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to change topic status.'));
    } finally {
      setSaving(false);
    }
  }

  async function changeContentState(item: TrainingTopicContent) {
    if (!item.isDeleted && !window.confirm(`Delete content "${item.contentName}"?`)) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (item.isDeleted) {
        await trainingTopicContentApi.restore(item.contentId);
        setContents(current => current.map(row =>
          row.contentId === item.contentId ? { ...row, isDeleted: false } : row));
      } else {
        await trainingTopicContentApi.remove(item.contentId);
        setContents(current => current.map(row =>
          row.contentId === item.contentId ? { ...row, isDeleted: true } : row));
        setShowDeleted(true);
      }
      setSuccess(item.isDeleted ? 'Content restored.' : 'Content deleted.');
    } catch (requestError) {
      setError(trainingError(requestError, 'Unable to change content status.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dt-page">
      <header className="dt-heading">
        <div>
          <h1>Topics</h1>
          <p>Manage training topics and the slides or videos under each topic.</p>
        </div>
        <button type="button" className="dt-primary" onClick={() => startTopicEditor()} disabled={saving}>
          + Add Topic
        </button>
      </header>

      {error && <div className="dt-notice dt-error" role="alert">{error}</div>}
      {success && <div className="dt-notice dt-success" role="status">{success}</div>}

      {topicEditor !== null && (
        <form className="dt-editor" onSubmit={submitTopic}>
          <div className="dt-editor-title">
            <h2>{topicEditor === 'new' ? 'Add Topic' : 'Edit Topic'}</h2>
            <button type="button" className="dt-plain" onClick={() => setTopicEditor(null)} disabled={saving} aria-label="Close topic editor">×</button>
          </div>
          <div className="dt-fields">
            <label>Topic Name *
              <input required minLength={2} value={topicForm.topicName}
                onChange={event => setTopicForm({ ...topicForm, topicName: event.target.value })} />
            </label>
            <label>Public Folder ID
              <input value={topicForm.publicFolderId}
                onChange={event => setTopicForm({ ...topicForm, publicFolderId: event.target.value })} />
            </label>
          </div>
          <div className="dt-form-actions">
            <button type="button" className="dt-secondary" disabled={saving} onClick={() => setTopicEditor(null)}>Cancel</button>
            <button className="dt-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Topic'}</button>
          </div>
        </form>
      )}

      <div className="dt-toolbar">
        <input aria-label="Search topics" placeholder="Search topics..." value={search}
          onChange={event => setSearch(event.target.value)} />
        <label className="dt-check"><input type="checkbox" checked={showDeleted}
          onChange={event => setShowDeleted(event.target.checked)} /> Show deleted</label>
      </div>

      <div className="dt-split">
        <div className="dt-panel">
          <h2>Topic List <span>({visibleTopics.length})</span></h2>
          {loading ? <p className="dt-muted">Loading topics…</p> : visibleTopics.length === 0
            ? <p className="dt-muted">No topics found.</p>
            : <ul className="dt-topic-list">
              {visibleTopics.map(item => (
                <li key={item.topicId} className={item.topicId === selectedTopicId ? 'dt-selected' : ''}>
                  <button type="button" className="dt-topic-select" disabled={saving}
                    onClick={() => { setSelectedTopicId(item.topicId); setContentEditor(null); setError(''); }}>
                    <strong>{item.topicName}</strong>
                    <small>Topic ID: {item.topicId}{item.isDeleted ? ' · Deleted' : ''}</small>
                  </button>
                  <div className="dt-row-actions">
                    {!item.isDeleted && <button type="button" onClick={() => startTopicEditor(item)} disabled={saving}>Edit</button>}
                    <button type="button" disabled={saving} onClick={() => void changeTopicState(item)}>
                      {item.isDeleted ? 'Restore' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>}
        </div>

        <div className="dt-panel">
          <div className="dt-panel-header">
            <div>
              <h2>Topic Content</h2>
              <p>{selectedTopic ? selectedTopic.topicName : 'Choose a topic to see its content.'}</p>
            </div>
            <button className="dt-primary" type="button"
              disabled={!selectedTopicId || selectedTopic?.isDeleted || saving}
              onClick={() => startContentEditor()}>+ Add Content</button>
          </div>

          {contentEditor !== null && (
            <form className="dt-editor dt-inline-editor" onSubmit={submitContent}>
              <div className="dt-editor-title">
                <h3>{contentEditor === 'new' ? 'Add Content' : 'Edit Content'}</h3>
                <button type="button" className="dt-plain" disabled={saving}
                  onClick={() => setContentEditor(null)} aria-label="Close content editor">×</button>
              </div>
              <div className="dt-fields">
                {typeof contentEditor === 'number' && (
                  <label>Topic *
                    <select required value={contentTopicId || ''}
                      onChange={event => setContentTopicId(Number(event.target.value))}>
                      <option value="" disabled>Select topic</option>
                      {topics.filter(topic => !topic.isDeleted).map(topic => (
                        <option key={topic.topicId} value={topic.topicId}>{topic.topicName}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>Content Name *
                  <input required minLength={2} value={contentForm.contentName}
                    onChange={event => setContentForm({ ...contentForm, contentName: event.target.value })} />
                </label>
                <label>Slides (filename)
                  <input value={contentForm.slides}
                    onChange={event => setContentForm({ ...contentForm, slides: event.target.value })} />
                </label>
                <label>Video Name (filename)
                  <input value={contentForm.videoName}
                    onChange={event => setContentForm({ ...contentForm, videoName: event.target.value })} />
                </label>
              </div>
              <div className="dt-form-actions">
                <button type="button" className="dt-secondary" disabled={saving} onClick={() => setContentEditor(null)}>Cancel</button>
                <button className="dt-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Content'}</button>
              </div>
            </form>
          )}

          {!selectedTopicId ? <p className="dt-muted">Select a topic from the list.</p>
            : contentsLoading ? <p className="dt-muted">Loading topic content…</p>
              : visibleContents.length === 0 ? <p className="dt-muted">No content available for this topic.</p>
                : <div className="dt-table-wrap dt-topic-content-scroll"><table className="dt-table">
                  <thead><tr><th>Content</th><th>Slides</th><th>Video</th><th>Actions</th></tr></thead>
                  <tbody>{visibleContents.map(item => <tr key={item.contentId}>
                    <td><strong>{item.contentName}</strong><small>ID: {item.contentId}{item.isDeleted ? ' · Deleted' : ''}</small></td>
                    <td>{item.slides || '—'}</td>
                    <td>{item.videoName || '—'}</td>
                    <td><div className="dt-row-actions">
                      {!item.isDeleted && <button type="button" disabled={saving} onClick={() => startContentEditor(item)}>Edit</button>}
                      <button type="button" disabled={saving} onClick={() => void changeContentState(item)}>
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
