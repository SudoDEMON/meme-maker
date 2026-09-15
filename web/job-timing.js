import { escapeHtml as h } from './state.js';

export function durationText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const part = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${part}` : `${minutes}:${part}`;
}

const statuses = { complete: '✓ Done', running: 'In progress', waiting: 'Waiting', cancelled: 'Cancelled', failed: 'Failed', 'not-run': 'Not run' };

export class JobTiming {
  constructor() {
    this.panel = document.querySelector('#jobTiming');
    this.elapsed = document.querySelector('#jobElapsed');
    this.estimate = document.querySelector('#jobEstimate');
    this.steps = document.querySelector('#jobSteps');
    this.bar = document.querySelector('#jobProgress');
    this.startedAt = null;
    this.finishedAt = null;
    this.progress = null;
    this.running = false;
  }

  start(startedAt) {
    clearInterval(this.timer);
    this.startedAt = Date.parse(startedAt) || null;
    this.finishedAt = null;
    this.progress = null;
    this.disconnected = false;
    this.running = true;
    this.steps.replaceChildren();
    this.update();
    this.timer = setInterval(() => this.update(), 1000);
  }

  sync(job) {
    if (Number.isFinite(Date.parse(job.startedAt))) this.startedAt = Date.parse(job.startedAt);
    if (job.progress) this.setProgress(job.progress);
    this.disconnected = false;
    this.update();
  }

  setProgress(progress) {
    if (Date.parse(progress.updatedAt) < Date.parse(this.progress?.updatedAt)) return;
    this.progress = progress;
    this.disconnected = false;
    this.steps.innerHTML = (progress.steps || []).map(step => `<li class="job-step" data-status="${h(step.status)}"><span>${h(step.label)}</span><strong>${h(statuses[step.status] || step.status)}</strong></li>`).join('');
    this.steps.hidden = !progress.steps?.length;
    this.update();
  }

  disconnect() {
    this.disconnected = true;
    this.update();
  }

  finish(job = {}) {
    clearInterval(this.timer);
    this.running = false;
    this.finishedAt = Date.parse(job.finishedAt) || Date.now();
    if (!job.progress && this.progress?.steps) {
      this.setProgress({ ...this.progress, steps: this.progress.steps.map(step => ({ ...step,
        status: job.status === 'complete' ? 'complete' : step.status === 'running' ? job.status || 'failed' : step.status === 'waiting' ? 'not-run' : step.status
      })) });
    }
    this.sync(job);
  }

  update() {
    this.panel.hidden = !this.startedAt && !this.running;
    this.elapsed.textContent = this.startedAt ? durationText(((this.finishedAt || Date.now()) - this.startedAt) / 1000) : 'Restoring…';
    document.querySelector('#jobEstimateRow').hidden = !this.running;
    document.querySelector('#jobEstimateHint').hidden = !this.running;
    const progress = this.progress;
    const fresh = progress && Date.now() - Date.parse(progress.updatedAt) < 10000;
    const remaining = fresh && !this.disconnected ? progress.remainingSeconds : null;
    this.estimate.textContent = this.disconnected ? 'Reconnecting…' : remaining === null || !Number.isFinite(remaining)
      ? 'Estimating…' : remaining <= 0 ? 'Finishing step…' : `About ${durationText(Math.ceil(remaining))}`;
    if (fresh && !this.disconnected && Number.isFinite(progress.percent)) this.bar.value = progress.percent;
    else this.bar.removeAttribute('value');
    this.bar.setAttribute('aria-label', progress?.steps?.find(step => step.status === 'running')?.label || 'Processing media');
  }
}
