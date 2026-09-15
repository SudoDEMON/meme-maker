import { state, assetById, editorDefaults, persist, formatTime, validateRange } from './state.js';
import { post, upload } from './api.js';
import { editorView, sourceOptions } from './editor-view.js';
import { EditorGeometry } from './editor-geometry.js';
import { ensureCaptionFonts } from './caption-fonts.js';

export class MemeEditor {
  constructor(panel, onRun, onChange) {
    this.panel = panel;
    this.onRun = onRun;
    this.onChange = onChange;
    this.generation = 0;
    this.geometry = new EditorGeometry(panel, () => persist());
    panel.addEventListener('input', event => this.input(event));
    panel.addEventListener('change', event => this.change(event));
    panel.addEventListener('click', event => this.action(event));
    panel.addEventListener('submit', event => { event.preventDefault(); this.submit(); });
  }
  deactivate() {
    this.generation += 1;
    this.controller?.abort();
    clearTimeout(this.scrubTimer);
    this.panel.querySelector('video')?.pause();
  }
  render() {
    this.deactivate();
    this.panel.innerHTML = editorView();
    this.setRunning(Boolean(state.jobId));
    this.loadPreview();
    if (state.editor.fontUrl) this.loadFont(state.editor.fontUrl);
  }
  updateSources() {
    const select = this.panel.querySelector('#editorSource');
    if (select) select.innerHTML = sourceOptions();
  }
  status(message, error = false) {
    const el = this.panel.querySelector('#previewStatus');
    if (el) { el.textContent = message; el.classList.toggle('error', error); }
  }
  setRunning(running) {
    this.panel.querySelectorAll('[data-run]').forEach(button => { button.disabled = running; });
  }
  syncTime() {
    const e = state.editor;
    const info = assetById(e.sourceId)?.info;
    const fps = info?.fps || 10;
    const max = Math.max(0, (info?.duration || 0) - 1 / fps);
    e.time = Math.max(0, Math.min(max, Number(e.time) || 0));
    const slider = this.panel.querySelector('#previewTime');
    if (slider) {
      slider.disabled = !info?.duration; slider.max = String(max); slider.step = String(1 / fps); slider.value = String(e.time);
    }
    const label = this.panel.querySelector('#previewTimeLabel');
    if (label) label.textContent = `${formatTime(e.time)} / ${formatTime(info?.duration)}`;
    const frame = this.panel.querySelector('#previewFrame');
    if (frame) { frame.value = String(Math.round(e.time * fps)); frame.max = String(Math.floor(max * fps)); }
    persist();
  }
  async loadPreview() {
    this.controller?.abort();
    const video = this.panel.querySelector('#editorVideo');
    if (video) { video.pause(); video.hidden = true; }
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    const asset = assetById(state.editor.sourceId);
    if (!asset || state.section !== 'editor') return;
    const current = () => !controller.signal.aborted && generation === this.generation && state.editor.sourceId === asset.id && state.section === 'editor';
    try {
      this.status('Inspecting media…');
      // Re-inspect through the server cache to restore registered file links too.
      const info = await post('/api/source-info', { source: asset.path }, controller.signal);
      if (!current()) return;
      if (!info.width || !info.height) throw new Error('Choose a video or GIF for the meme editor.');
      asset.info = info;
      asset.fileUrl = info.fileUrl || asset.fileUrl;
      this.syncTime();
      const time = state.editor.time;
      this.status(info.kind === 'remote' ? 'Fetching a preview frame from the link…' : 'Loading preview…');
      const body = await post('/api/preview-frame', { input: asset.path, time: String(time) }, controller.signal);
      if (!current()) return;
      // Decode separately so an older image load can never change the live image.
      const image = new Image();
      image.src = body.fileUrl;
      await image.decode();
      if (!current()) return;
      const preview = this.panel.querySelector('#editorPreview');
      preview.src = body.fileUrl;
      preview.hidden = false;
      this.panel.querySelector('#editorPlaceholder').hidden = true;
      asset.info.width = image.naturalWidth;
      asset.info.height = image.naturalHeight;
      await this.refreshFonts();
      if (!current()) return;
      this.geometry.initialize();
      this.panel.querySelector('#mediaProperties').textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${info.fps ? `${info.fps.toFixed(2)} FPS` : 'FPS unavailable'} · ${info.frameCount || 'Unknown'} frames`;
      this.preparePlayback(asset);
      this.syncTime();
      this.status(info.kind === 'remote' ? 'Frame preview ready. Export to MP4 for local playback.' : 'Preview ready.');
      this.onChange(false);
    } catch (err) {
      if (current()) this.status(err.message, true);
    }
  }
  preparePlayback(asset) {
    const video = this.panel.querySelector('#editorVideo');
    const play = this.panel.querySelector('[data-editor-action="play"]');
    if (!asset.fileUrl || /\.gif$/i.test(asset.path)) return;
    if (video.getAttribute('src') === asset.fileUrl) return;
    const sourceId = asset.id;
    video.src = asset.fileUrl;
    video.onloadedmetadata = () => {
      if (state.editor.sourceId !== sourceId) return;
      play.disabled = false;
      video.currentTime = state.editor.time;
    };
    video.ontimeupdate = () => {
      if (state.editor.sourceId !== sourceId || video.paused) return;
      state.editor.time = video.currentTime;
      this.syncTime();
    };
    video.onended = () => { play.textContent = 'Play'; };
    video.onerror = () => { play.disabled = true; this.status('Frame preview ready. This browser cannot play the source codec.'); };
  }
  seek(time) {
    state.editor.time = time;
    this.syncTime();
    const video = this.panel.querySelector('#editorVideo');
    if (video?.readyState >= 1) {
      video.pause();
      video.currentTime = state.editor.time;
      video.hidden = false;
      this.panel.querySelector('#editorPreview').hidden = true;
      this.panel.querySelector('[data-editor-action="play"]').textContent = 'Play';
    } else {
      this.controller?.abort();
      this.generation += 1;
      clearTimeout(this.scrubTimer);
      this.scrubTimer = setTimeout(() => this.loadPreview(), 200);
    }
  }
  input(event) {
    const el = event.target;
    if (el.id === 'previewTime') { this.seek(Number(el.value)); return; }
    if (el.id === 'previewFrame') {
      this.seek(Number(el.value) / (assetById(state.editor.sourceId)?.info?.fps || 10));
      return;
    }
    if (!el.name || el.name === 'sourceId') return;
    state.editor[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    this.panel.querySelector('#editorError').textContent = '';
    this.geometry.paint();
    if (/Font|font|bold|italic/.test(el.name)) this.refreshFonts();
    persist();
  }
  async change(event) {
    if (event.target.id === 'editorSource') {
      state.editor = { ...editorDefaults(), sourceId: event.target.value };
      persist();
      this.render();
    }
    if (event.target.id === 'fontUpload' && event.target.files[0]) {
      const file = event.target.files[0];
      const draft = state.editor;
      const status = this.panel.querySelector('#fontStatus');
      status.textContent = `Uploading ${file.name}…`;
      try {
        const result = await upload(file);
        if (state.editor !== draft) return;
        draft.fontPath = result.path;
        draft.fontUrl = result.fileUrl;
        await this.loadFont(result.fileUrl);
        status.textContent = file.name;
        persist();
      } catch (err) { status.textContent = err.message; }
    }
  }
  async refreshFonts() {
    try { await ensureCaptionFonts(state.editor); this.geometry.paint(); }
    catch { this.status('Using a browser font preview. The system font will be used for export.'); }
  }
  async loadFont(url) {
    try {
      const font = new FontFace('MemeCustomFont', `url(${JSON.stringify(url)})`);
      await font.load();
      if (state.editor.fontUrl !== url) return;
      for (const existing of document.fonts) if (existing.family === 'MemeCustomFont') document.fonts.delete(existing);
      document.fonts.add(font);
      this.geometry.paint();
    } catch (err) { this.status(`Could not preview the custom font: ${err.message}`, true); }
  }
  action(event) {
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (!action) return;
    const e = state.editor;
    if (action === 'reset') { state.editor = { ...editorDefaults(), sourceId: e.sourceId }; this.render(); }
    if (action === 'classic') { e.layout = 'classic'; this.geometry.paint(); }
    if (action === 'crop-reset') {
      const { width, height } = this.geometry.dimensions;
      Object.assign(e, { cropX: 0, cropY: 0, cropWidth: width, cropHeight: height });
      this.geometry.paint();
    }
    if (action === 'retry') this.loadPreview();
    if (action === 'set-start' || action === 'set-end') {
      const key = action === 'set-start' ? 'outputStart' : 'outputEnd';
      e[key] = formatTime(e.time);
      this.panel.querySelector(`[name="${key}"]`).value = e[key];
    }
    if (action === 'play') {
      const video = this.panel.querySelector('#editorVideo');
      const button = this.panel.querySelector('[data-editor-action="play"]');
      if (video.paused) {
        video.hidden = false;
        this.panel.querySelector('#editorPreview').hidden = true;
        video.play().then(() => { button.textContent = 'Pause'; }).catch(err => this.status(err.message, true));
      } else { video.pause(); button.textContent = 'Play'; }
    }
    persist();
  }
  async submit() {
    try {
      const e = state.editor;
      const asset = assetById(e.sourceId);
      if (!asset || !e.initialized) throw new Error('Choose media and wait for its preview before exporting.');
      validateRange(e.outputStart, e.outputEnd, asset.info?.fps);
      await this.refreshFonts();
      if (state.editor !== e) return;
      this.geometry.paint();
      const stem = asset.info?.kind === 'remote' ? asset.info.defaultStem : asset.name.replace(/\.[^.]+$/, '');
      const fields = { ...e, input: asset.path, output: e.output || `${stem}-meme` };
      for (const [key, value] of Object.entries(fields)) if (typeof value === 'number') fields[key] = String(value);
      this.onRun('meme-editor', fields);
    } catch (err) { this.panel.querySelector('#editorError').textContent = err.message; }
  }
}
