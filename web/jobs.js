import { state, persist, escapeHtml as h } from './state.js';
import { post } from './api.js';

export class JobClient {
  constructor(onResult, onEdit) {
    this.onResult = onResult;
    this.onEdit = onEdit;
    this.busy = false;
    this.log = document.querySelector('#jobLog');
    document.querySelector('#cancelButton').addEventListener('click', () => this.cancel());
    document.querySelector('#editOutputButton').addEventListener('click', () => { if (this.result) this.onEdit(this.result); });
    if (state.jobId) { this.setBusy(true); this.connect(state.jobId); this.poll(state.jobId); }
    else if (state.lastResult) this.showResult(state.lastResult);
  }
  setBusy(busy) {
    this.busy = busy;
    this.syncButtons();
    document.querySelector('#jobProgress').hidden = !busy;
    document.querySelector('#cancelButton').hidden = !busy || !state.jobId;
  }
  syncButtons() {
    document.querySelectorAll('[data-run]').forEach(button => { button.disabled = this.busy; });
  }
  message(title, message) {
    document.querySelector('#resultTitle').textContent = title;
    document.querySelector('#jobMessage').textContent = message;
  }
  append(text) {
    this.log.textContent = (this.log.textContent + text).slice(-80000);
    this.log.scrollTop = this.log.scrollHeight;
  }
  async run(action, fields) {
    if (this.busy) return;
    this.close();
    this.setBusy(true);
    this.log.textContent = '';
    this.result = null;
    document.querySelector('#resultPreview').replaceChildren();
    document.querySelector('#outputActions').hidden = true;
    document.querySelector('#jobDetails').open = false;
    this.message('Getting started…', 'Preparing your media.');
    try {
      const job = await post('/api/jobs', { action, fields });
      state.jobId = job.id;
      state.lastResult = null;
      persist();
      this.setBusy(true);
      this.connect(job.id);
    } catch (err) {
      this.message('Could not start', err.message);
      this.append(`${err.message}\n`);
      this.setBusy(false);
    }
  }
  connect(id) {
    this.close();
    this.message('Processing…', 'You can keep editing while this finishes.');
    const events = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
    this.events = events;
    const current = () => state.jobId === id;
    events.addEventListener('status', event => {
      if (!current()) return;
      const data = JSON.parse(event.data);
      this.message('Processing…', 'You can keep editing while this finishes.');
      if (data.command) this.append(`$ ${data.command}\n`);
    });
    events.addEventListener('log', event => { if (current()) this.append(JSON.parse(event.data).text || ''); });
    events.addEventListener('done', event => { if (current()) this.finish(JSON.parse(event.data)); });
    events.onerror = () => {
      if (!current()) return;
      // A broken connection is not a finished job. Keep Run disabled and Cancel available.
      this.message('Reconnecting…', 'The job may still be running. Checking its status.');
      this.schedulePoll(id);
    };
  }
  schedulePoll(id) {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.poll(id), 1200);
  }
  async poll(id) {
    if (state.jobId !== id) return;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
      if (state.jobId !== id) return;
      if (response.status === 404) { this.finish({ status: 'failed', error: 'This job is no longer available. The server may have restarted.' }); return; }
      if (!response.ok) throw new Error('Status unavailable');
      const job = await response.json();
      if (state.jobId !== id) return;
      if (job.status !== 'running') { this.finish(job); return; }
    } catch { /* Keep the running job accessible while the connection recovers. */ }
    this.schedulePoll(id);
  }
  finish(job) {
    this.close();
    state.jobId = null;
    this.setBusy(false);
    this.append(`\n[${job.status}]\n`);
    if (job.status === 'complete') {
      state.lastResult = job;
      this.showResult(job);
      this.onResult(job);
    } else {
      this.message(job.status === 'cancelled' ? 'Cancelled' : 'Processing failed', job.error || (job.status === 'cancelled' ? 'Your draft is still here.' : 'Open the processing log for details, adjust your settings, and try again.'));
      if (job.status !== 'cancelled') document.querySelector('#jobDetails').open = true;
    }
    persist();
  }
  showResult(job) {
    this.result = job;
    const name = job.outputPath?.split('/').pop() || 'output';
    this.message('Ready to save', name);
    const fileUrl = job.fileUrl;
    const ext = name.split('.').pop().toLowerCase();
    const preview = document.querySelector('#resultPreview');
    preview.innerHTML = ['mp4','webm','mov'].includes(ext) ? `<video controls playsinline preload="metadata" src="${h(fileUrl)}"></video>` : ['gif','png'].includes(ext) ? `<img src="${h(fileUrl)}" alt="Finished media">` : ext === 'mp3' ? `<audio controls preload="metadata" src="${h(fileUrl)}"></audio>` : '';
    const open = document.querySelector('#outputLink');
    open.href = fileUrl;
    const download = document.querySelector('#downloadLink');
    download.href = job.downloadUrl;
    download.download = name;
    document.querySelector('#editOutputButton').hidden = !['mp4','webm','mov','gif'].includes(ext);
    document.querySelector('#outputActions').hidden = false;
  }
  async cancel() {
    const id = state.jobId;
    if (!id) return;
    try {
      await post(`/api/jobs/${encodeURIComponent(id)}/cancel`, {});
      if (state.jobId !== id) return;
      this.message('Cancelling…', 'Stopping the active media process.');
      this.schedulePoll(id);
    } catch (err) { this.message('Could not cancel yet', err.message); }
  }
  close() {
    this.events?.close();
    this.events = null;
    clearTimeout(this.pollTimer);
  }
}
