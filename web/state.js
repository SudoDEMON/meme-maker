const key = 'meme-maker-workspace-v2';
export const editorDefaults = () => ({
  sourceId: '', topText: '', bottomText: '', topX: 0, topY: 0, bottomX: 0, bottomY: 0,
  fontFamily: 'sans-serif', fontSize: 50, bold: true, italic: false, underline: false, strike: false,
  topFontFamily: '', bottomFontFamily: '', topFontSize: '', bottomFontSize: '',
  topFontStyle: '', bottomFontStyle: '', fontPath: '', fontUrl: '',
  format: 'mp4', output: '', width: 720, outputFps: '', outputStart: '', outputEnd: '',
  cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0, time: 0, layout: 'classic', initialized: false
});
const defaults = () => ({ section: 'media', operation: 'convert', assets: [], selectedIds: [],
  drafts: {}, editor: editorDefaults(), jobId: null });
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (!saved || !Array.isArray(saved.assets) || !Array.isArray(saved.selectedIds)) return defaults();
    return { ...defaults(), ...saved, editor: { ...editorDefaults(), ...saved.editor } };
  } catch { return defaults(); }
}
export const state = restore();
export function persist() {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* The current draft remains in memory if storage is full. */ }
}
export const assetById = id => state.assets.find(asset => asset.id === id);
export const isVideo = asset => Boolean(asset && (/\.(gif|mov|mp4|webm)$/i.test(asset.path) || /^https?:\/\//i.test(asset.path) || /^[\w-]{11}$/.test(asset.path)));
export function draftFor(operation) {
  return state.drafts[operation] ||= { start: '0:00', end: '', format: operation === 'extract' ? 'mp3' : 'mp4', output: '', audioId: '', seconds: '5' };
}
export function editAsset(asset) {
  if (state.editor.sourceId !== asset.id) state.editor = { ...editorDefaults(), sourceId: asset.id };
  state.section = 'editor';
  persist();
}
export const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const formatTime = value => {
  const seconds = Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const part = (seconds % 60).toFixed(3).padStart(6, '0').replace(/\.?0+$/, '').replace(/^([0-9])$/, '0$1');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${part}` : `${minutes}:${part}`;
};
export function parseTime(value, fps = 0) {
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+f$/i.test(raw)) {
    if (!fps) throw new Error('Frame times need source FPS. Wait for media inspection.');
    return parseInt(raw, 10) / fps;
  }
  if (!/^\d+(?::\d+){0,2}(?:\.\d+)?$/.test(raw)) throw new Error('Use seconds, MM:SS, HH:MM:SS, or a frame such as 18f.');
  const parts = raw.split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) throw new Error('Minutes and seconds must be below 60 in clock times.');
  return parts.reduce((total, n) => total * 60 + n, 0);
}
export function validateRange(start, end, fps = 0) {
  const from = parseTime(start, fps) ?? 0;
  const to = parseTime(end, fps);
  if (to !== null && from >= to) throw new Error('Start must be before End.');
}
