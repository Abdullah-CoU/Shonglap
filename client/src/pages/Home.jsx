import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import apiClient from '../api.js';
import CategoryGrid from '../components/CategoryGrid.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  received: 'bg-sky-100 text-sky-700',
  assigned: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  triage: 'bg-orange-100 text-orange-700',
};

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [trackingId, setTrackingId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/complaints/map`);
      const data = await res.json();
      if (res.ok) setMarkers(data.markers || []);
    } catch {
      // silently fail
    }
  };

  // Filter definitions for the stat cards
  const FILTERS = {
    pending: (m) => ['received', 'assigned', 'triage'].includes(m.status),
    in_progress: (m) => m.status === 'in_progress',
    resolved: (m) => m.status === 'resolved',
  };

  const toggleFilter = (key) => {
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  const filteredMarkers = statusFilter ? markers.filter(FILTERS[statusFilter]) : markers;

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.trackComplaint(trackingId.trim());
      navigate(`/track/${trackingId.trim()}`);
    } catch {
      setError(t('noComplaint'));
    } finally {
      setLoading(false);
    }
  };

  // Stats derived from public data
  const total = markers.length;
  const resolved = markers.filter((m) => m.status === 'resolved').length;
  const pending = markers.filter((m) => m.status !== 'resolved' && m.status !== 'rejected').length;
  const inProgress = markers.filter((m) => m.status === 'in_progress').length;
  const critical = markers.filter((m) => m.urgency === 'critical').length;
  const serviceLevel = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Daily series for line chart
  const seriesMap = {};
  for (const m of markers) {
    const day = new Date(m.createdAt);
    const key = `${String(day.getMonth() + 1).padStart(2, '0')}/${String(day.getDate()).padStart(2, '0')}`;
    if (!seriesMap[key]) seriesMap[key] = { date: key, Pending: 0, 'In Progress': 0 };
    if (m.status === 'resolved' || m.status === 'rejected') continue;
    if (m.status === 'in_progress') seriesMap[key]['In Progress']++;
    else seriesMap[key].Pending++;
  }
  const chartData = Object.values(seriesMap).slice(-13);

  // Category counts
  const categoryCounts = {};
  for (const m of markers) {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  }
  const maxCat = Math.max(1, ...Object.values(categoryCounts));
  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / maxCat) * 100) }));

  return (
    <div className="p-4 md:p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon="⏳" iconColor="text-green-600" label="Pending" sub="All time" value={pending}
              onClick={() => toggleFilter('pending')} active={statusFilter === 'pending'} />
            <StatCard icon="⚙️" iconColor="text-blue-600" label="In Progress" sub="All time" value={inProgress}
              onClick={() => toggleFilter('in_progress')} active={statusFilter === 'in_progress'} />
            <StatCard icon="✓" iconColor="text-orange-600" label="Solved" sub="All time" value={resolved}
              onClick={() => toggleFilter('resolved')} active={statusFilter === 'resolved'} />
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4 col-span-2 md:col-span-1">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray={`${serviceLevel}, 100`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-800">{serviceLevel}%</div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Service Level</p>
                <p className="text-xs text-gray-400">Target 75%</p>
              </div>
            </div>
          </div>

          {/* Category picker */}
          <CategoryGrid
            selected={null}
            onSelect={(cat) => navigate('/report', { state: { category: cat } })}
            title={t('reportProblem')}
          />

          {/* Report button + Track */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate('/report')}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl shadow text-lg transition-colors"
            >
              📝 {t('reportProblem')}
            </button>
            <div id="track" className="flex-1 bg-white rounded-xl border border-gray-200 p-3">
              <form onSubmit={handleTrack} className="flex gap-2 h-full">
                <input
                  type="text"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder={t('enterTrackingId')}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" disabled={loading} className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium py-2 px-4 rounded-lg">
                  {loading ? '...' : t('track')}
                </button>
              </form>
              {error && <p className="text-red-600 text-xs mt-1 px-1">{error}</p>}
            </div>
          </div>

          {/* Total Complaints Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Total Complaints</h2>
              <span className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1">
                {total} records
              </span>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Pending" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="In Progress" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                No complaint data yet — be the first to report!
              </div>
            )}
          </div>

          {/* Bottom grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Complaints */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Recent Complaints</h2>
                {statusFilter && (
                  <button
                    onClick={() => setStatusFilter(null)}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-200"
                  >
                    {statusFilter === 'pending' ? 'Pending' : statusFilter === 'in_progress' ? 'In Progress' : 'Solved'} ✕
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs border-b">
                      <th className="py-2">ID</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Area</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkers.slice(0, 6).map((m) => (
                      <tr
                        key={m.trackingId}
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                        onClick={() => navigate(`/track/${m.trackingId}`)}
                      >
                        <td className="py-2 font-mono text-xs">{m.trackingId}</td>
                        <td className="py-2 capitalize">{m.category}</td>
                        <td className="py-2">{m.area}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredMarkers.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-400">
                        {statusFilter ? 'No complaints with this status' : 'No complaints yet'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Complaints in Category */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Complaints in Category</h2>
              <div className="space-y-4">
                {categories.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize text-gray-700">{c.name.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-gray-500">{c.pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-6">No category data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Critical alert */}
          {critical > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-red-800">{critical} critical complaint{critical > 1 ? 's' : ''} need immediate attention</p>
                <p className="text-sm text-red-600">Gas leaks, live wires, and open manholes are escalated to the highest priority.</p>
              </div>
            </div>
          )}
    </div>
  );
}

function StatCard({ icon, iconColor, label, sub, value, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border-2 p-4 text-left w-full transition-all ${
        active ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
      }`}
      aria-label={`Filter by ${label}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
        <span className={`text-2xl ${iconColor}`}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </button>
  );
}
