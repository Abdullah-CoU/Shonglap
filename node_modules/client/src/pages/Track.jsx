import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '../api.js';

const STATUS_COLORS = {
  received: 'bg-blue-100 text-blue-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  triage: 'bg-orange-100 text-orange-800',
};

const URGENCY_COLORS = {
  low: 'bg-gray-200 text-gray-800',
  medium: 'bg-yellow-200 text-yellow-800',
  high: 'bg-orange-200 text-orange-800',
  critical: 'bg-red-200 text-red-800',
};

export default function Track() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trackingId: paramId } = useParams();
  const [trackingId, setTrackingId] = useState(paramId || '');
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchComplaint = async (id) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.trackComplaint(id);
      setComplaint(data);
    } catch {
      setError(t('noComplaint'));
      setComplaint(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paramId) {
      fetchComplaint(paramId);
    }
  }, [paramId]);

  const handleTrack = (e) => {
    e.preventDefault();
    if (trackingId.trim()) {
      fetchComplaint(trackingId.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('trackComplaint')}</h1>

        <form onSubmit={handleTrack} className="flex gap-2">
          <input
            type="text"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder={t('enterTrackingId')}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? t('loading') : t('track')}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {complaint && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('trackingId')}</span>
                <code className="font-mono text-sm">{complaint.trackingId}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('status')}</span>
                <span className={`px-2 py-1 rounded text-sm font-medium ${STATUS_COLORS[complaint.status] || 'bg-gray-200'}`}>
                  {t(complaint.status)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('urgency')}</span>
                <span className={`px-2 py-1 rounded text-sm font-medium ${URGENCY_COLORS[complaint.urgency] || 'bg-gray-200'}`}>
                  {t(complaint.urgency)}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500">{t('textDescription')}</span>
                <p className="text-gray-900 mt-1">{complaint.description}</p>
              </div>
              {complaint.area && (
                <div>
                  <span className="text-sm text-gray-500">{t('area')}:</span>
                  <span className="ml-2 text-gray-900">{complaint.area}</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold mb-4">{t('timeline')}</h2>
              <div className="space-y-4">
                {complaint.timeline.map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                      {i < complaint.timeline.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-300 mt-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium text-gray-900">{t(entry.status)}</p>
                      {entry.note && <p className="text-sm text-gray-600">{entry.note}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(entry.at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="w-full bg-white hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors"
        >
          Home
        </button>
      </div>
    </div>
  );
}
