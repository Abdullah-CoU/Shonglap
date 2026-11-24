import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '../api.js';
import CategoryGrid from '../components/CategoryGrid.jsx';
import { AREAS } from '../constants/areas.js';


export default function Report() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [text, setText] = useState(() => (location.state?.category ? `[${location.state.category.keyword}]` : ''));
  const [transcript, setTranscript] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioMime, setAudioMime] = useState('audio/webm');
  const [audioPath, setAudioPath] = useState('');
  const [area, setArea] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(location.state?.category?.key || null);


  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer a supported MIME type (Safari records mp4)
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const finalMime = recorder.mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: finalMime });
        setAudioBlob(blob);
        setAudioMime(finalMime);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setTranscript('');
      setAudioPath('');
    } catch {
      setError(t('micDenied'));
    }
  }, [t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat.key);
    setText((prev) => {
      const base = prev.replace(/\s*\[.+\]\s*$/, '').trim();
      return (base ? base + ' ' : '') + `[${cat.keyword}]`;
    });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setTranscribing(true);
    setError('');
    const ext = audioMime.includes('mp4') ? 'm4a' : audioMime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([audioBlob], `recording.${ext}`, { type: audioMime });

    const maxAttempts = 2;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await apiClient.transcribe(file, 'bn');
        const textOut = (result.transcript || '').trim();
        if (!textOut) {
          setError(i18n.language === 'bn'
            ? 'কোনো কথা শনাক্ত হয়নি। স্পষ্ট করে আবার বলুন বা টাইপ করুন।'
            : 'No speech detected. Please speak clearly and try again, or type your complaint.');
          return;
        }
        setTranscript(textOut);
        if (result.audioPath) setAudioPath(result.audioPath);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 800));
      } finally {
        if (attempt === maxAttempts || !lastErr) setTranscribing(false);
      }
    }

    setError(lastErr?.response?.data?.error?.message || (i18n.language === 'bn'
      ? 'ভয়েস ট্রান্সক্রিপশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।'
      : 'Voice transcription failed. Please try again.'));
    setTranscribing(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      let photoAnalysis = null;
      if (photo) {
        photoAnalysis = await apiClient.analyzePhoto(photo, [text, transcript, area].filter(Boolean).join(' '), privacyBlur);
        sessionStorage.setItem('photoAnalysis', JSON.stringify(photoAnalysis));
      }

      const draftData = {
        text,
        transcript,
        audioPath,
        photoPath: photoAnalysis?.savedPath || '',
        area,
        contactPhone,
        contactEmail,
        language: 'bn',
      };

      const draft = await apiClient.createDraft(draftData);
      sessionStorage.setItem('draftId', draft.draftId);
      sessionStorage.setItem('draftData', JSON.stringify(draft));
      navigate('/review');
    } catch (err) {
      setError(err.response?.data?.error?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('reportProblem')}</h1>
        <p className="text-gray-600 text-sm">{t('allFieldsOptional')}</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Category picker (icon grid) */}
        <CategoryGrid
          selected={selectedCategory}
          onSelect={handleCategorySelect}
          title={i18n.language === 'bn' ? 'সমস্যা জানান' : 'What is the problem?'}
        />

        {/* Text description */}
        <div>
          <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-1">
            {t('textDescription')}
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('textPlaceholder')}
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('photoUpload')}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-center text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            {t('takePhoto')} / {t('photoUpload')}
          </button>
          {photoPreview && (
            <img src={photoPreview} alt="Preview" className="mt-2 rounded-lg max-h-48 mx-auto" />
          )}
          {photo && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyBlur}
                onChange={(e) => setPrivacyBlur(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-600">Blur faces & number plates (privacy)</span>
            </label>
          )}
        </div>

        {/* Voice recorder */}
        <div className="glass rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t('voiceNote')}
          </label>
          <div className="flex gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {t('record')}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 px-4 rounded-lg transition-colors animate-pulse"
              >
                {t('stop')} ({t('recording')})
              </button>
            )}
          </div>
          {audioUrl && (
            <div className="space-y-2">
              <audio src={audioUrl} controls className="w-full" />
              <button
                type="button"
                onClick={handleTranscribe}
                disabled={transcribing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {transcribing ? t('loading') : t('transcript')}
              </button>
            </div>
          )}
          {transcript && (
            <div>
              <label htmlFor="transcript" className="block text-sm font-medium text-gray-700 mb-1">
                {t('transcript')}
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Area selection (replaces live location/map) */}
        <div>
          <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-1">
            {t('area')}
          </label>
          <select
            id="area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">{t('selectArea')}</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Contact info */}
        <div className="space-y-3">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone (optional)
            </label>
            <input
              id="phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email (optional)
            </label>
            <input
              id="email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Data retention note */}
        <p className="text-xs text-gray-400 text-center">
          Data retention: Complaints are retained for 2 years. Photos may be blurred for privacy. Anonymous reports are allowed.
        </p>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg text-lg transition-colors disabled:opacity-50"
        >
          {loading ? t('loading') : t('submit')}
        </button>
      </div>
    </div>
  );
}
