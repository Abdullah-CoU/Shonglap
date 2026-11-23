import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, getUser, logout, authHeaders } from '../auth.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const URGENCY_COLORS = {
  low: 'bg-gray-200 text-gray-800',
  medium: 'bg-yellow-200 text-yellow-800',
  high: 'bg-orange-200 text-orange-800',
  critical: 'bg-red-200 text-red-800',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = getUser();

  const [triageQueue, setTriageQueue] = useState([]);
  const [allComplaints, setAllComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [assignDept, setAssignDept] = useState('');
  const [rerouteDept, setRerouteDept] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('triage');

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'admin') {
      navigate('/login');
      return;
    }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [triageRes, complaintsRes, deptsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/triage`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/admin/complaints`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/departments`, { headers: authHeaders() }),
      ]);

      if (triageRes.ok) {
        const data = await triageRes.json();
        setTriageQueue(data.complaints || []);
      }
      if (complaintsRes.ok) {
        const data = await complaintsRes.json();
        setAllComplaints(data.complaints || []);
      }
      if (deptsRes && deptsRes.ok) {
        const data = await deptsRes.json();
        setDepartments([{ _id: '', nameEn: 'Select department...', nameBn: '' }, ...(data.departments || [])]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (complaintId) => {
    if (!assignDept) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/complaints/${complaintId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ departmentId: assignDept, note }),
      });
      if (!res.ok) throw new Error('Assign failed');
      await fetchAll();
      setSelected(null);
      setAssignDept('');
      setNote('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReroute = async (complaintId) => {
    if (!rerouteDept) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/complaints/${complaintId}/reroute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ newDepartmentId: rerouteDept, note }),
      });
      if (!res.ok) throw new Error('Reroute failed');
      await fetchAll();
      setSelected(null);
      setRerouteDept('');
      setNote('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated() || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-white/15 border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-600">{user?.name}</p>
        </div>
        <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800 font-medium">
          Logout
        </button>
      </header>

      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('triage')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'triage' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
          >
            Triage Queue ({triageQueue.length})
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
          >
            All Complaints ({allComplaints.length})
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600">Loading...</p>
        ) : (
          <div className="glass rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-white/15 border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tracking ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Area</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Urgency</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(tab === 'triage' ? triageQueue : allComplaints).map((c) => {
                  const primaryDept = c.routing?.find((r) => r.isPrimary)?.department;
                  const deptName = primaryDept?.nameEn || primaryDept?.nameBn || '—';
                  return (
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
                        <span className={`px-2 py-1 rounded text-xs font-medium ${c.status === 'triage' ? 'bg-orange-100 text-orange-800' : 'bg-gray-200 text-gray-800'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{deptName}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(c)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {(tab === 'triage' ? triageQueue : allComplaints).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {t('noComplaints')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="glass rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{selected.trackingId}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>

            <div className="text-sm space-y-1">
              <p><strong>Category:</strong> {selected.category}</p>
              <p><strong>Area:</strong> {selected.area}</p>
              <p><strong>Description:</strong> {selected.description}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Department</label>
                <select
                  value={assignDept}
                  onChange={(e) => setAssignDept(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.nameEn} ({d.nameBn})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Re-route Department</label>
                <select
                  value={rerouteDept}
                  onChange={(e) => setRerouteDept(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.nameEn} ({d.nameBn})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAssign(selected._id)}
                  disabled={saving || !assignDept}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Assign'}
                </button>
                <button
                  onClick={() => handleReroute(selected._id)}
                  disabled={saving || !rerouteDept}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Re-route'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
