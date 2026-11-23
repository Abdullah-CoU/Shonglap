import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

/**
 * @typedef {Object} DraftResponse
 * @property {string} draftId
 * @property {Object} extracted
 * @property {Object} routing
 * @property {string[]} missingFields
 * @property {string[]} followUpQuestions
 * @property {Array} conflicts
 */

/**
 * @typedef {Object} SubmitResponse
 * @property {string} trackingId
 */

/**
 * @typedef {Object} TrackResponse
 * @property {string} trackingId
 * @property {string} category
 * @property {string} description
 * @property {string} area
 * @property {string} urgency
 * @property {string} status
 * @property {Array} timeline
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} TranscribeResponse
 * @property {string} transcript
 * @property {string} language
 * @property {number} duration
 * @property {Array} segments
 */

/**
 * @typedef {Object} AnalyzePhotoResponse
 * @property {string} description
 * @property {string} detectedIssue
 * @property {string} suggestedCategory
 * @property {string} severity
 * @property {boolean} isRelevant
 * @property {number|null} exifLat
 * @property {number|null} exifLng
 * @property {string} qualityWarning
 * @property {boolean} conflict
 * @property {string} savedPath
 */

export const apiClient = {
  /** @returns {Promise<{status: string}>} */
  health: () => api.get('/api/health').then((r) => r.data),

  /** @param {Object} data @returns {Promise<DraftResponse>} */
  createDraft: (data) => api.post('/api/complaints/draft', data).then((r) => r.data),

  /** @param {string} id @param {Object} answers @returns {Promise<DraftResponse>} */
  answerDraft: (id, answers) => api.post(`/api/complaints/draft/${id}/answer`, answers).then((r) => r.data),

  /** @param {string} draftId @param {boolean} [force] @returns {Promise<SubmitResponse>} */
  submitComplaint: (draftId, force = false) => api.post('/api/complaints/submit', { draftId, force }).then((r) => r.data),

  /** @param {string} trackingId @returns {Promise<{trackingId: string, supporters: number}>} */
  addSupport: (trackingId) => api.post(`/api/complaints/${trackingId}/support`).then((r) => r.data),

  /** @param {string} trackingId @returns {Promise<TrackResponse>} */
  trackComplaint: (trackingId) => api.get(`/api/complaints/track/${trackingId}`).then((r) => r.data),

  /** @param {string} trackingId @returns {Promise<{ok:boolean, json:Object, formal:string, missing:string[]}>} */
  getReport: (trackingId) => api.get(`/api/complaints/${trackingId}/report`).then((r) => r.data),

  /** @param {File} audioFile @param {string} language @returns {Promise<TranscribeResponse>} */
  transcribe: (audioFile, language = 'bn') => {
    const form = new FormData();
    form.append('audio', audioFile);
    form.append('language', language);
    return api.post('/api/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  /** @param {File} photoFile @param {string} text @param {boolean} blur @returns {Promise<AnalyzePhotoResponse>} */
  analyzePhoto: (photoFile, text = '', blur = false) => {
    const form = new FormData();
    form.append('photo', photoFile);
    if (text) form.append('text', text);
    if (blur) form.append('blur', 'true');
    return api.post('/api/analyze-photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export default apiClient;
