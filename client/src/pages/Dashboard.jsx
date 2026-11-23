import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, getUser, logout, authHeaders } from '../auth.js';
import apiClient from '../api.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const URGENCY_COLORS = {
  low: 'bg-gray-200 text-gray-800',
  medium: 'bg-yellow-200 text-yellow-800',
  high: 'bg-orange-200 text-orange-800',
  critical: 'bg-red-200 text-red-800',
};

const STATUS_COLORS = {
  received: 'bg-blue-100 text-blue-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  triage: 'bg-orange-100 text-orange-800',
};

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ urgency: '', status: '', area: '' });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.urgency) params.set('urgency', filters.urgency);
      if (filters.status) params.set('status', filters.status);
      if (filters.area) params.set('area', filters.area);

      const res = await fetch(`${API_BASE}/api/departments/complaints?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed');
      setComplaints(data.complaints || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchComplaints();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-white/15 border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Department Dashboard</h1>
          <p className="text-sm text-slate-300">{user?.name} ({user?.department?.nameEn})</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-red-600 hover:text-red-800 font-medium"
        >
          Logout
        </button>
      </header>

      <div className="p-4 max-w-7xl mx-auto space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Urgency</label>
            <select
              value={filters.urgency}
              onChange={(e) => handleFilterChange('urgency', e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="received">Received</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="triage">Triage</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
            <input
              type="text"
              value={filters.area}
              onChange={(e) => handleFilterChange('area', e.target.value)}
              placeholder="Area"
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={applyFilters}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Apply
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-300">{t('loading')}</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-white/15 border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Tracking ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Area</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Urgency</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr key={c._id} className="border-b border-white/15 border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{c.trackingId}</td>
                    <td className="px-4 py-3">{c.category}</td>
                    <td className="px-4 py-3">{c.area}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${URGENCY_COLORS[c.urgency]}`}>
                        {c.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(c)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {complaints.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No complaints found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <ComplaintDetail complaint={selected} onClose={() => setSelected(null)} onRefresh={fetchComplaints} />
      )}
    </div>
  );
}

function ComplaintDetail({ complaint, onClose, onRefresh }) {
  const [status, setStatus] = useState(complaint.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleStatusUpdate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/departments/complaints/${complaint._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw new Error('Update failed');
      onRefresh();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const mapLink = complaint.location?.coordinates
    ? `https://www.openstreetmap.org/?mlat=${complaint.location.coordinates[1]}&mlon=${complaint.location.coordinates[0]}#map=16/${complaint.location.coordinates[1]}/${complaint.location.coordinates[0]}`
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="glass-dark rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{complaint.trackingId}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>

        <div className="space-y-2 text-sm">
          <p><strong>Category:</strong> {complaint.category}</p>
          <p><strong>Area:</strong> {complaint.area}</p>
          <p><strong>Urgency:</strong> {complaint.urgency}</p>
          <p><strong>Status:</strong> {complaint.status}</p>
          <p><strong>Description:</strong> {complaint.description}</p>
          {complaint.descriptionBn && <p><strong>Bangla:</strong> {complaint.descriptionBn}</p>}
          {complaint.landmark && <p><strong>Landmark:</strong> {complaint.landmark}</p>}
          {complaint.contactPhone && <p><strong>Phone:</strong> {complaint.contactPhone}</p>}
        </div>

        {/* Photos */}
        {complaint.attachments?.filter((a) => a.type === 'photo').length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Photos</h3>
            <div className="flex gap-2 flex-wrap">
              {complaint.attachments.filter((a) => a.type === 'photo').map((a, i) => (
                <img key={i} src={a.path} alt="Attachment" className="w-32 h-32 object-cover rounded" />
              ))}
            </div>
          </div>
        )}

        {/* Audio */}
        {complaint.attachments?.filter((a) => a.type === 'audio').length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Audio</h3>
            {complaint.attachments.filter((a) => a.type === 'audio').map((a, i) => (
              <audio key={i} src={a.path} controls className="w-full" />
            ))}
            {complaint.transcript && (
              <p className="text-sm text-gray-600 mt-2">{complaint.transcript}</p>
            )}
          </div>
        )}

        {/* Map */}
        {mapLink && (
          <div>
            <h3 className="font-semibold mb-2">Location</h3>
            <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
              View on Map
            </a>
          </div>
        )}

        {/* Status update */}
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold">Update Status</h3>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-base"
          >
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-base"
          />
          <button
            onClick={handleStatusUpdate}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
