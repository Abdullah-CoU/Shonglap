import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReportModal from '../components/ReportModal.jsx';

export default function Success() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('trackingId');
    if (id) {
      setTrackingId(id);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = trackingId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold text-gray-900">{t('successTitle')}</h1>

        <div className="glass rounded-xl p-6 space-y-4">
          <p className="text-sm text-gray-600">{t('trackingId')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 rounded-lg px-4 py-3 text-lg font-mono text-center">
              {trackingId}
            </code>
            <button
              onClick={handleCopy}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate(`/track/${trackingId}`)}
          className="w-full bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {t('viewStatus')}
        </button>

        <button
          onClick={() => setShowReport(true)}
          className="w-full bg-white hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors"
        >
          📄 {i18n.language === 'bn' ? 'ফরমাল রিপোর্ট দেখুন' : 'View formal report'}
        </button>
        {showReport && <ReportModal trackingId={trackingId} onClose={() => setShowReport(false)} />}

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
