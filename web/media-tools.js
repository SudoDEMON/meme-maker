import { state, draftFor, assetById, escapeHtml as h, validateRange, formatTime } from './state.js';

const operations = {
  convert: { title: 'Convert media', description: 'Choose a format. Links are downloaded automatically.', action: 'download-convert', button: 'Convert' },
  combine: { title: 'Combine clips', description: 'Select clips from Your media and put them in playback order.', action: 'combine-videos', button: 'Combine clips' },
  extract: { title: 'Extract audio', description: 'Save the audio from a video or link as an MP3.', action: 'download-convert', button: 'Extract audio' },
  audio: { title: 'Replace audio', description: 'Give your video a new soundtrack. This replaces its original audio.', action: 'audio-to-video', button: 'Replace audio' },
  html: { title: 'Render HTML animation', description: 'Capture a self-contained HTML file as a video, GIF, or image.', action: 'build-html', button: 'Render animation' }
};
const input = (name, label, value, attrs = '') => `<label class="field">${label}<input name="${name}" value="${h(value)}" ${attrs}></label>`;

export class MediaTools {
  constructor(panel, onRun, onChange) {
    this.panel = panel;
    this.onRun = onRun;
    this.onChange = onChange;
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-operation]');
      if (!button) return;
      state.operation = button.dataset.operation;
      if (state.operation !== 'combine') state.selectedIds = state.selectedIds.slice(0, 1);
      this.render();
      this.onChange();
    });
    panel.addEventListener('input', event => {
      if (!event.target.name) return;
      draftFor(state.operation)[event.target.name] = event.target.value;
      this.panel.querySelector('[data-form-error]').textContent = '';
      this.onChange(false);
    });
    panel.addEventListener('submit', event => {
      event.preventDefault();
      try { this.submit(); }
      catch (err) { panel.querySelector('[data-form-error]').textContent = err.message; }
    });
  }

  render() {
    const op = operations[state.operation] || operations.convert;
    const draft = draftFor(state.operation);
    const source = assetById(state.selectedIds[0]);
    const sources = state.selectedIds.map(assetById).filter(Boolean);
    const isCombine = state.operation === 'combine';
    const isHtml = state.operation === 'html';
    const formats = isHtml ? ['mp4', 'webm', 'gif', 'png'] : state.operation === 'extract' ? ['mp3'] : ['mp4', 'webm', ...(state.operation === 'convert' ? ['gif', 'mp3'] : [])];
    if (!formats.includes(draft.format)) draft.format = formats[0];
    const sourceDescription = isCombine ? `${sources.length} clips selected` : source?.name || 'Choose a file or add a link';
    const endHint = source?.info?.duration ? `Full length · ${formatTime(source.info.duration)}` : 'End of media';
    this.panel.innerHTML = `
      <div class="operation-bar" aria-label="Media operation">${Object.entries(operations).filter(([id]) => id !== 'html').map(([id, item]) => `<button type="button" data-operation="${id}" aria-pressed="${state.operation === id}">${item.button}</button>`).join('')}</div>
      <div class="tool-content">
        <h2>${op.title}</h2><p class="muted">${op.description}</p>
        <div class="source-summary"><span class="eyebrow">${isCombine ? 'PLAYBACK ORDER' : 'SELECTED MEDIA'}</span><strong>${h(sourceDescription)}</strong>${isCombine && sources.length ? `<ol>${sources.map(asset => `<li>${h(asset.name)}</li>`).join('')}</ol>` : ''}</div>
        <form id="mediaForm">
          ${state.operation === 'audio' ? `<label class="field">New audio<select name="audioId" required><option value="">Choose an audio file from Your media</option>${state.assets.filter(asset => /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(asset.path)).map(asset => `<option value="${h(asset.id)}" ${draft.audioId === asset.id ? 'selected' : ''}>${h(asset.name)}</option>`).join('')}</select></label>` : ''}
          <div class="field-grid">${input('output', 'Output name', draft.output, 'placeholder="Choose a name, or leave automatic"')}<label class="field">Format<select name="format">${formats.map(format => `<option ${draft.format === format ? 'selected' : ''}>${format}</option>`).join('')}</select></label></div>
          ${isHtml ? input('seconds', 'Duration in seconds', draft.seconds, 'type="number" min="0.1" step="0.1" required') + `<label class="field">Audio (optional)<select name="audioId"><option value="">No audio</option>${state.assets.filter(asset => /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(asset.path)).map(asset => `<option value="${h(asset.id)}" ${draft.audioId === asset.id ? 'selected' : ''}>${h(asset.name)}</option>`).join('')}</select></label>` : ''}
          ${!isCombine && !isHtml ? `<details class="trim-settings" ${draft.start !== '0:00' || draft.end ? 'open' : ''}><summary>Trim ${draft.end || draft.start !== '0:00' ? '· custom range' : '(optional)'}</summary><div class="field-grid">${input('start', 'Start', draft.start, 'placeholder="0:00"')}${input('end', 'End', draft.end, `placeholder="${h(endHint)}"`)}</div></details>` : ''}
          <p data-form-error class="error" role="alert"></p>
          <button class="primary-button" type="submit" data-run>${op.button}<span aria-hidden="true"> →</span></button>
        </form>
        <details class="advanced-entry" ${isHtml ? 'open' : ''}><summary>Advanced tools</summary><button type="button" class="text-button" data-operation="html">Render HTML animation →</button></details>
      </div>`;
    this.setRunning(Boolean(state.jobId));
  }

  setRunning(running) {
    this.panel.querySelectorAll('[data-run]').forEach(button => { button.disabled = running; });
  }

  updateSourceInfo() {
    const source = assetById(state.selectedIds[0]);
    const end = this.panel.querySelector('[name="end"]');
    if (end) end.placeholder = source?.info?.duration ? `Full length · ${formatTime(source.info.duration)}` : 'End of media';
    const label = this.panel.querySelector('.source-summary strong');
    if (label && state.operation !== 'combine') label.textContent = source?.name || 'Choose a file or add a link';
  }

  submit() {
    const op = operations[state.operation];
    const draft = draftFor(state.operation);
    const source = assetById(state.selectedIds[0]);
    if (!source) throw new Error('Add media, then select a file to use.');
    if (source.uploading) throw new Error('Wait for the file upload to finish.');
    const stem = source.info?.kind === 'remote' ? source.info.defaultStem : source.name.replace(/\.[^.]+$/, '');
    const fields = { ...draft, source: source.path, output: draft.output || `${stem}-${state.operation}` };
    if (state.operation === 'combine') {
      const sources = state.selectedIds.map(assetById).filter(Boolean);
      if (sources.length < 2) throw new Error('Select at least two videos to combine.');
      if (sources.some(asset => !/\.(mp4|mov|webm)$/i.test(asset.path))) throw new Error('Combine uses local MP4, MOV, or WebM files. Download links first.');
      fields.inputs = sources.map(asset => asset.path);
    } else if (state.operation === 'html') {
      if (!/\.html?$/i.test(source.path)) throw new Error('Select an HTML file from Your media.');
      fields.html = source.path;
    } else validateRange(draft.start, draft.end);
    if (state.operation === 'audio' || state.operation === 'html') {
      const audio = assetById(draft.audioId);
      if (state.operation === 'audio' && !audio) throw new Error('Add an audio file and select it as the new soundtrack.');
      if (audio) fields.audio = audio.path;
    }
    this.onRun(op.action, fields);
  }
}
