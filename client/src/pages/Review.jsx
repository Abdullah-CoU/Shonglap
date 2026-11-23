import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '../api.js';

const URGENCY_COLORS = {
  low: 'bg-gray-200 text-gray-800',
  medium: 'bg-yellow-200 text-yellow-800',
  high: 'bg-orange-200 text-orange-800',
  critical: 'bg-red-200 text-red-800',
};

export default function Review() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const storedDraft = typeof window !== 'undefined' ? sessionStorage.getItem('draftData') : null;
  const initialDraft = storedDraft ? JSON.parse(storedDraft) : null;
  const [draft, setDraft] = useState(initialDraft);
  const [answers, setAnswers] = useState({});
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(initialDraft?.extracted?.description || '');
  const [duplicate, setDuplicate] = useState([]);

  useEffect(() => {
    if (!draft) navigate('/report');
  }, [draft, navigate]);

  const handleAnswerSubmit = async () => {
    if (!draft) return;
    setLoading(true);
    setError('');
    try {
      // Map follow-up answers to the fields they correspond to.
      // Questions are generated in order from missingFields (area first, then contactPhone).
      const missing = draft.extracted?.missingFields || [];
      const structured = {};
      if (missing.includes('area') && answers.q0) structured.area = answers.q0;
      if (missing.includes('contactPhone') && answers.q1) structured.contactPhone = answers.q1;
      // Fallback: forward any remaining answers as generic text
      for (const [k, v] of Object.entries(answers)) {
        if (!['q0', 'q1'].includes(k)) structured[k] = v;
      }

      const updated = await apiClient.answerDraft(draft.draftId, { answers: structured });
      setDraft(updated);
      sessionStorage.setItem('draftData', JSON.stringify(updated));
      setAnswers({});
    } catch (err) {
      setError(err.response?.data?.error?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!consent) {
      setError(t('consentRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.submitComplaint(draft.draftId);

      // Duplicate detected: let the user choose support-existing or submit anyway
      if (result.duplicate) {
        setDuplicate(result.duplicates || []);
        setLoading(false);
        return;
      }

      sessionStorage.setItem('trackingId', result.trackingId);

      // Log total time-to-complete
      const times = JSON.parse(sessionStorage.getItem('completionTimes') || '[]');
      if (times.length > 0) {
        const total = Date.now() - (times[0] - (times[times.length - 1] - times[0]));
        console.log(`Total time-to-complete: ${total}ms`);
      }
      sessionStorage.removeItem('draftData');
      sessionStorage.removeItem('draftId');
      navigate('/success');
    } catch (err) {
      setError(err.response?.data?.error?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSupport = async (trackingId) => {
    try {
      await apiClient.addSupport(trackingId);
      sessionStorage.setItem('trackingId', trackingId);
      navigate('/track/' + trackingId);
    } catch (err) {
      setError(err.response?.data?.error?.message || t('error'));
    }
  };

  const handleSubmitAnyway = async () => {
    setDuplicate([]);
    setLoading(true);
    try {
      const result = await apiClient.submitComplaint(draft.draftId, true);
      sessionStorage.setItem('trackingId', result.trackingId);
      sessionStorage.removeItem('draftData');
      sessionStorage.removeItem('draftId');
      navigate('/success');
    } catch (err) {
      setError(err.response?.data?.error?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">{t('loading')}</p>
      </div>
    );
  }

  const extracted = draft.extracted;
  const routing = draft.routing;

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('reviewTitle')}</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {duplicate.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 space-y-3">
            <p className="font-semibold text-yellow-900">{t('similarComplaints')}</p>
            <p className="text-sm text-yellow-800">Someone may have already reported this. You can add your support to an existing report or submit a new one.</p>
            {duplicate.slice(0, 3).map((d) => (
              <div key={d.trackingId} className="glass rounded-lg p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-gray-700">{d.trackingId}</p>
                  <p className="text-xs text-gray-500 truncate">{d.description}</p>
                  <p className="text-xs text-gray-400">{d.supporters} supporters</p>
                </div>
                <button
                  onClick={() => handleSupport(d.trackingId)}
                  className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2 px-3 rounded-lg"
                >
                  '+' + t('supportThis')
                </button>
              </div>
            ))}
            <button
              onClick={handleSubmitAnyway}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium py-2 px-3 rounded-lg"
            >
              {t('submitAsNew')}
            </button>
          </div>
        )}

        {draft.conflicts && draft.conflicts.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
            {t('conflictWarning')}
            {draft.conflicts.map((c, i) => (
              <p key={i} className="text-sm mt-1">{c.message}</p>
            ))}
          </div>
        )}

        {/* Extracted summary */}
        <div className="glass rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold">{t('extractedSummary')}</h2>
          <div>
            <p className="text-sm text-gray-500">{t('textDescription')}</p>
            {editing ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base mt-1"
              />
            ) : (
              <p className="text-gray-900">{extracted.description}</p>
            )}
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="text-blue-600 text-sm mt-1 hover:underline"
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>

          {extracted.descriptionBn && (
            <div>
              <p className="text-sm text-gray-500">বাংলা</p>
              <p className="text-gray-900">{extracted.descriptionBn}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{t('urgency')}:</span>
            <span className={`px-2 py-1 rounded text-sm font-medium ${URGENCY_COLORS[extracted.urgency] || 'bg-gray-200'}`}>
              {t(extracted.urgency)}
            </span>
          </div>

          {extracted.area && (
            <div>
              <span className="text-sm text-gray-500">{t('area')}:</span>
              <span className="ml-2 text-gray-900">{extracted.area}</span>
            </div>
          )}

          {extracted.missingFields && extracted.missingFields.length > 0 && (
            <div className="text-sm text-orange-600">
              Missing: {extracted.missingFields.join(', ')}
            </div>
          )}
        </div>

        {/* Department */}
        <div className="glass rounded-lg p-4 space-y-2">
          <h2 className="text-lg font-semibold">{t('department')}</h2>
          {routing.primary ? (
            <>
              <p className="text-gray-900 font-medium">
                {routing.primary.nameBn} / {routing.primary.nameEn}
              </p>
              <p className="text-sm text-gray-600">
                {t('goesTo', {
                  dept: routing.primary.nameBn,
                  reason: extracted.detectedIssue || extracted.category,
                })}
              </p>
              {routing.secondary && routing.secondary.length > 0 && (
                <div className="text-sm text-gray-500">
                  Also: {routing.secondary.map((d) => d.nameBn).join(', ')}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600">{t('triage')}</p>
          )}
        </div>

        {/* Follow-up questions */}
        {draft.followUpQuestions && draft.followUpQuestions.length > 0 && (
          <div className="glass rounded-lg p-4 space-y-3">
            <h2 className="text-lg font-semibold">{t('followUp')}</h2>
            {draft.followUpQuestions.map((q, i) => (
              <div key={i}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{q}</label>
                <input
                  type="text"
                  value={answers[`q${i}`] || ''}
                  onChange={(e) => setAnswers({ ...answers, [`q${i}`]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={handleAnswerSubmit}
              disabled={loading}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? t('loading') : 'Update'}
            </button>
          </div>
        )}

        {/* Consent */}
        <div className="glass rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{t('consent')}</span>
          </label>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !consent}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg text-lg transition-colors disabled:opacity-50"
        >
          {loading ? t('loading') : t('submit')}
        </button>
      </div>
    </div>
  );
}
