import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  received: 'bg-sky-100 text-sky-700',
  assigned: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  triage: 'bg-orange-100 text-orange-700',
};

const URGENCY_COLORS = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const FILTER_DEFS = {
  pending: { statuses: ['received', 'assigned', 'triage'], label: 'Pending', labelBn: 'অপেক্ষমাণ' },
  in_progress: { statuses: ['in_progress'], label: 'In Progress', labelBn: 'চলমান' },
  resolved: { statuses: ['resolved'], label: 'Solved', labelBn: 'সমাধান' },
};

export default function Issues() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('status') || 'all';
  const initialUrgency = searchParams.get('urgency') || '';

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [urgencyFilter, setUrgencyFilter] = useState(initialUrgency);
  const [category, setCategory] = useState('');
  const [area, setArea] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setFilter(initialFilter);
    setUrgencyFilter(initialUrgency);
  }, [initialFilter, initialUrgency]);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/complaints/map`);
      const data = await res.json();
      if (res.ok) setComplaints(data.markers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const filtered = complaints.filter((c) => {
    if (filter !== 'all' && FILTER_DEFS[filter] && !FILTER_DEFS[filter].statuses.includes(c.status)) return false;
    if (urgencyFilter && c.urgency !== urgencyFilter) return false;
    if (category && c.category !== category) return false;
    if (area && c.area !== area) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!c.trackingId.toLowerCase().includes(q) && !c.description?.toLowerCase().includes(q) && !c.area?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const categories = [...new Set(complaints.map((c) => c.category))].sort();
  const areas = [...new Set(complaints.map((c) => c.area))].sort();

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {i18n.language === 'bn' ? 'অভিযোগের তালিকা' : 'Issue List'}
          </h1>
          <p className="text-sm text-gray-500">
            {filtered.length} {i18n.language === 'bn' ? 'টি অভিযোগ' : 'complaints'}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {t('home')}
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: i18n.language === 'bn' ? 'সব' : 'All' },
          { key: 'pending', label: i18n.language === 'bn' ? FILTER_DEFS.pending.labelBn : FILTER_DEFS.pending.label },
          { key: 'in_progress', label: i18n.language === 'bn' ? FILTER_DEFS.in_progress.labelBn : FILTER_DEFS.in_progress.label },
          { key: 'resolved', label: i18n.language === 'bn' ? FILTER_DEFS.resolved.labelBn : FILTER_DEFS.resolved.label },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setUrgencyFilter(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key && !urgencyFilter ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => { setUrgencyFilter('critical'); setFilter('all'); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            urgencyFilter === 'critical' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
          }`}
        >
          ⚠️ {t('critical')}
        </button>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('search')}</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{i18n.language === 'bn' ? 'বিভাগ' : 'Category'}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">{t('all')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{i18n.language === 'bn' ? 'এলাকা' : 'Area'}</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">{t('all')}</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Issue list */}
      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('id')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('category')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('areaCol')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('urgencyCol')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('statusCol')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('date')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.trackingId}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/track/${c.trackingId}`)}
              >
                <td className="px-4 py-3 font-mono text-xs text-blue-700">{c.trackingId}</td>
                <td className="px-4 py-3 capitalize">{c.category}</td>
                <td className="px-4 py-3">{c.area}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${URGENCY_COLORS[c.urgency] || 'bg-gray-100'}`}>{c.urgency}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                {loading ? t('loading') : t('noComplaints')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
