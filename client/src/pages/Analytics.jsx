import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { isAuthenticated, getUser, logout, authHeaders } from '../auth.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Analytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();

  const [areaData, setAreaData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [deptData, setDeptData] = useState([]);
  const [autoRouteData, setAutoRouteData] = useState(null);
  const [avgResolution, setAvgResolution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    const headers = authHeaders();
    try {
      const [areaRes, catRes, deptRes, autoRes, resRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/complaints-per-area`, { headers }),
        fetch(`${API_BASE}/api/analytics/complaints-per-category`, { headers }),
        fetch(`${API_BASE}/api/analytics/department-performance`, { headers }),
        fetch(`${API_BASE}/api/analytics/auto-route-rate`, { headers }),
        fetch(`${API_BASE}/api/analytics/avg-resolution-time`, { headers }),
      ]);

      if (areaRes.ok) setAreaData((await areaRes.json()).data || []);
      if (catRes.ok) setCategoryData((await catRes.json()).data || []);
      if (deptRes.ok) setDeptData((await deptRes.json()).data || []);
      if (autoRes.ok) setAutoRouteData((await autoRes.json()).data);
      if (resRes.ok) setAvgResolution((await resRes.json()).data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-600">{user?.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Dashboard
          </button>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800 font-medium">
            Logout
          </button>
        </div>
      </header>

      <div className="p-4 max-w-7xl mx-auto space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-600">Loading...</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Auto-Route Rate</p>
                <p className="text-2xl font-bold text-blue-600">
                  {autoRouteData ? (autoRouteData.autoRouteRate * 100).toFixed(1) + '%' : '—'}
                </p>
                <p className="text-xs text-gray-400">
                  {autoRouteData ? `${autoRouteData.autoRouted}/${autoRouteData.total} auto-routed` : ''}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Triage Rate</p>
                <p className="text-2xl font-bold text-orange-600">
                  {autoRouteData ? (autoRouteData.triageRate * 100).toFixed(1) + '%' : '—'}
                </p>
                <p className="text-xs text-gray-400">
                  {autoRouteData ? `${autoRouteData.triaged}/${autoRouteData.total} triaged` : ''}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Avg Resolution Time</p>
                <p className="text-2xl font-bold text-green-600">
                  {avgResolution ? avgResolution.avgResolutionHours.toFixed(1) + 'h' : '—'}
                </p>
                <p className="text-xs text-gray-400">
                  {avgResolution ? `${avgResolution.count} resolved` : ''}
                </p>
              </div>
            </div>

            {/* Complaints per area */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold mb-4">Complaints per Area</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="area" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Complaints per category */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold mb-4">Complaints per Category</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={categoryData} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={100} label>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Department performance */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold mb-4">Department Performance</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#3b82f6" name="Total" />
                  <Bar dataKey="resolved" fill="#22c55e" name="Resolved" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
