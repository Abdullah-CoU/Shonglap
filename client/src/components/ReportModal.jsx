import { useState, useEffect } from 'react';
import apiClient from '../api.js';

/** Minimal report viewer: structured JSON + formal letter. */
export default function ReportModal({ trackingId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('formal');

  useEffect(() => {
    apiClient.getReport(trackingId)
      .then(setData)
      .catch(() => setData({ ok: false, missing: ['area'] }))
      .finally(() => setLoading(false));
  }, [trackingId]);

  const download = (filename, content, type = 'text/plain') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="glass-dark rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-white">Formal Report · {trackingId}</h2>
          <button onClick={onClose} className="text-slate-300 text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-slate-300">Loading...</p>
          ) : !data?.ok ? (
            <div className="bg-amber-500/15 border border-amber-400/40 rounded-lg p-4">
              <p className="font-semibold text-amber-100">Missing mandatory information</p>
              <p className="text-sm text-amber-200 mt-1">Please provide: {data?.missing?.join(', ')}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setTab('formal')} className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'formal' ? 'bg-blue-600 text-white' : 'bg-white/15 text-slate-100'}`}>Formal</button>
                <button onClick={() => setTab('json')} className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'json' ? 'bg-blue-600 text-white' : 'bg-white/15 text-slate-100'}`}>JSON</button>
              </div>
              {tab === 'formal' ? (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-100 bg-black/25 p-4 rounded-lg">{data.formal}</pre>
              ) : (
                <pre className="text-xs text-slate-100 bg-black/25 p-4 rounded-lg overflow-x-auto">{JSON.stringify(data.json, null, 2)}</pre>
              )}
            </>
          )}
        </div>

        {data?.ok && (
          <div className="p-4 border-t flex gap-2">
            <button
              onClick={() => download(`report-${trackingId}.txt`, data.formal)}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg"
            >
              Download report
            </button>
            <button
              onClick={() => download(`report-${trackingId}.json`, JSON.stringify(data.json, null, 2), 'application/json')}
              className="flex-1 bg-white/20 text-white text-sm font-medium py-2 rounded-lg"
            >
              Download JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
