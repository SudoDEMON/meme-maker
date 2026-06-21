'use strict';

const tools = [
  {
    id: 'download-video',
    title: 'Download Video',
    icon: 'V',
    fields: [
      { name: 'videoId', label: 'YouTube ID or URL', required: true, span: 'third', placeholder: 'https://youtu.be/O0Dgtar0zB4', youtube: true },
      { name: 'start', label: 'Start', required: true, span: 'quarter', value: '0:00' },
      { name: 'end', label: 'End', span: 'quarter', placeholder: 'blank = full video' },
      { name: 'format', label: 'Format', type: 'select', span: 'quarter', options: [['mp4', 'MP4'], ['webm', 'WebM']] },
      { name: 'output', label: 'Output', span: 'full', placeholder: 'test-clips' }
    ]
  },
  {
    id: 'download-gif',
    title: 'Download GIF',
    icon: 'G',
    fields: [
      { name: 'videoId', label: 'YouTube ID or URL', required: true, span: 'third', placeholder: 'https://www.youtube.com/watch?v=O0Dgtar0zB4', youtube: true },
      { name: 'start', label: 'Start', required: true, span: 'quarter', value: '0:00' },
      { name: 'end', label: 'End', span: 'quarter', placeholder: 'blank = full video' },
      { name: 'outputName', label: 'Output', span: 'full', placeholder: 'boom_headshot' }
    ]
  },
  {
    id: 'download-audio',
    title: 'Download Audio',
    icon: 'A',
    fields: [
      { name: 'videoId', label: 'YouTube ID or URL', required: true, span: 'third', placeholder: 'https://youtu.be/vXZu0wT1kUg', youtube: true },
      { name: 'start', label: 'Start', required: true, span: 'quarter', value: '0:00' },
      { name: 'end', label: 'End', span: 'quarter', placeholder: 'blank = full video' },
      { name: 'output', label: 'Output', span: 'full', placeholder: 'sting' }
    ]
  },
  {
    id: 'caption-youtube',
    title: 'Caption YouTube Clip',
    icon: 'T',
    fields: [
      { name: 'videoId', label: 'YouTube ID or URL', required: true, span: 'third', placeholder: 'https://youtu.be/O0Dgtar0zB4', youtube: true },
      { name: 'start', label: 'Start', required: true, span: 'quarter', value: '0:00' },
      { name: 'end', label: 'End', span: 'quarter', placeholder: 'blank = full video' },
      { name: 'format', label: 'Format', type: 'select', span: 'quarter', options: [['gif', 'GIF'], ['mp4', 'MP4'], ['webm', 'WebM']] },
      { name: 'topText', label: 'Top text', type: 'textarea', span: 'field', placeholder: 'BOOM' },
      { name: 'bottomText', label: 'Bottom text', type: 'textarea', span: 'field', placeholder: 'HEADSHOT' },
      { name: 'outputName', label: 'Output', span: 'full', placeholder: 'captioned_clip' },
      { name: 'topY', label: 'Top y', type: 'number', span: 'quarter', value: '15', min: '0' },
      { name: 'bottomY', label: 'Bottom offset', type: 'number', span: 'quarter', value: '75', min: '0' },
      { name: 'fontSize', label: 'Font size', type: 'number', span: 'quarter', value: '50', min: '1' },
      { name: 'width', label: 'Width', type: 'number', span: 'quarter', value: '720', min: '1' },
      { name: 'fontPath', label: 'Font path', span: 'full', placeholder: 'Auto-detect if blank', accept: '.ttf,.otf,.ttc,font/*' }
    ]
  },
  {
    id: 'caption-local',
    title: 'Add Text To Media',
    icon: 'L',
    fields: [
      { name: 'input', label: 'Input media', required: true, span: 'full', placeholder: 'gifs/input.gif', accept: '.gif,.mp4,.webm,image/gif,video/mp4,video/webm' },
      { name: 'format', label: 'Format', type: 'select', span: 'quarter', options: [['gif', 'GIF'], ['mp4', 'MP4'], ['webm', 'WebM']] },
      { name: 'output', label: 'Output media', span: 'full', placeholder: 'input-captioned' },
      { name: 'topText', label: 'Top text', type: 'textarea', span: 'field', placeholder: 'TOP' },
      { name: 'bottomText', label: 'Bottom text', type: 'textarea', span: 'field', placeholder: 'BOTTOM' },
      { name: 'topY', label: 'Top y', type: 'number', span: 'quarter', value: '15', min: '0' },
      { name: 'bottomY', label: 'Bottom offset', type: 'number', span: 'quarter', value: '75', min: '0' },
      { name: 'fontSize', label: 'Font size', type: 'number', span: 'quarter', value: '50', min: '1' },
      { name: 'width', label: 'Width', type: 'number', span: 'quarter', value: '720', min: '1' },
      { name: 'fontPath', label: 'Font path', span: 'full', placeholder: 'Auto-detect if blank', accept: '.ttf,.otf,.ttc,font/*' }
    ]
  },
  {
    id: 'experimental-gif-editor',
    title: 'Experimental',
    experimental: true
  },
  {
    id: 'add-audio',
    title: 'Add Audio To Video',
    icon: 'M',
    fields: [
      { name: 'media', label: 'Input media', required: true, span: 'full', placeholder: 'videos/clip.mp4', accept: '.gif,.mp4,.webm,image/gif,video/mp4,video/webm' },
      { name: 'audio', label: 'Input audio', required: true, span: 'full', placeholder: 'Audio/sting.mp3', accept: '.mp3,.wav,.m4a,.aac,.ogg,audio/*' },
      { name: 'output', label: 'Output', span: 'full', placeholder: 'clip-with-audio' }
    ]
  },
  {
    id: 'build-html',
    title: 'Build HTML Animation',
    icon: 'B',
    fields: [
      { name: 'html', label: 'HTML file', required: true, span: 'full', placeholder: 'index.html', accept: '.html,.htm,text/html' },
      { name: 'format', label: 'Format', type: 'select', span: 'quarter', options: [['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF'], ['png', 'PNG']] },
      { name: 'output', label: 'Output', span: 'full', placeholder: 'render' },
      { name: 'seconds', label: 'Seconds', type: 'number', required: true, span: 'quarter', value: '5', min: '0.1', step: '0.1' },
      { name: 'audio', label: 'Audio file', span: 'full', placeholder: 'Audio/sting.mp3', accept: '.mp3,.wav,.m4a,.aac,.ogg,audio/*' }
    ]
  }
];

const toolTabs = document.querySelector('#toolTabs');
const toolTitle = document.querySelector('#toolTitle');
const toolKicker = document.querySelector('#toolKicker');
const toolForm = document.querySelector('#toolForm');
const runButton = document.querySelector('#runButton');
const cancelButton = document.querySelector('#cancelButton');
const jobStatus = document.querySelector('#jobStatus');
const jobLog = document.querySelector('#jobLog');
const outputLink = document.querySelector('#outputLink');
const downloadLink = document.querySelector('#downloadLink');
const serverStatus = document.querySelector('#serverStatus');
const statusDot = document.querySelector('#statusDot');

let activeTool = tools[0];
let activeJobId = null;
let eventSource = null;
const editorState = {
  naturalWidth: 0,
  naturalHeight: 0,
  dragging: null
};
const maxLogChars = 80000;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fieldClass(field) {
  if (field.span === 'full') return 'field full';
  if (field.span === 'third') return 'field third';
  if (field.span === 'quarter') return 'field quarter';
  return 'field';
}

function normalizeYouTubeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || raw;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery) return fromQuery;
      const parts = url.pathname.split('/').filter(Boolean);
      const marker = parts.findIndex(part => ['shorts', 'embed', 'v'].includes(part));
      if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
    }
  } catch {
    return raw.split(/[?&#/]/)[0];
  }

  return raw;
}

function renderField(field) {
  const required = field.required ? ' required' : '';
  const value = field.value ? ` value="${escapeHtml(field.value)}"` : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const min = field.min ? ` min="${escapeHtml(field.min)}"` : '';
  const step = field.step ? ` step="${escapeHtml(field.step)}"` : '';
  const youtube = field.youtube ? ' data-youtube="true"' : '';
  const accept = field.accept ? ` accept="${escapeHtml(field.accept)}"` : '';

  if (field.type === 'select') {
    const options = field.options
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join('');
    return `
      <div class="${fieldClass(field)}">
        <label for="${field.name}">${escapeHtml(field.label)}</label>
        <select id="${field.name}" name="${field.name}"${required}>${options}</select>
      </div>`;
  }

  if (field.type === 'textarea') {
    return `
      <div class="${fieldClass(field)}">
        <label for="${field.name}">${escapeHtml(field.label)}</label>
        <textarea id="${field.name}" name="${field.name}"${placeholder}${required}></textarea>
      </div>`;
  }

  return `
    <div class="${fieldClass(field)}">
      <label for="${field.name}">${escapeHtml(field.label)}</label>
      <div class="${field.accept ? 'file-field' : ''}">
        <input id="${field.name}" name="${field.name}" type="${field.type || 'text'}"${value}${placeholder}${min}${step}${youtube}${required}>
        ${field.accept ? `
          <label class="file-button">
            Browse
            <input type="file" data-upload-for="${field.name}"${accept}>
          </label>` : ''}
      </div>
      ${field.accept ? `<div class="field-status" data-upload-status-for="${field.name}"></div>` : ''}
    </div>`;
}

function renderTabs() {
  toolTabs.innerHTML = tools.map(tool => `
    <button class="tab-button" type="button" data-tool="${tool.id}" aria-selected="${tool.id === activeTool.id}">
      <span>${escapeHtml(tool.title)}</span>
    </button>
  `).join('');
}

function renderExperimentalEditor() {
  return `
    <div class="experimental-editor">
      <div class="field-grid">
        <div class="field full">
          <label for="input">Input GIF</label>
          <div class="file-field">
            <input id="input" name="input" type="text" placeholder="gifs/input.gif" required>
            <label class="file-button">
              Browse
              <input type="file" data-upload-for="input" accept=".gif,image/gif">
            </label>
          </div>
          <div class="field-status" data-upload-status-for="input"></div>
        </div>
        <div class="field full">
          <label for="output">Output GIF</label>
          <input id="output" name="output" type="text" placeholder="input-visual">
        </div>
        <div class="field">
          <label for="topText">Text 1</label>
          <textarea id="topText" name="topText" data-editor-bind="topText">TOP</textarea>
        </div>
        <div class="field">
          <label for="bottomText">Text 2</label>
          <textarea id="bottomText" name="bottomText" data-editor-bind="bottomText">BOTTOM</textarea>
        </div>
        <div class="field quarter">
          <label for="fontFamily">Font face</label>
          <select id="fontFamily" name="fontFamily" data-editor-style>
            <option value="sans-serif">Sans</option>
            <option value="serif">Serif</option>
            <option value="monospace">Mono</option>
            <option value="Impact">Impact</option>
            <option value="DejaVu Sans">DejaVu Sans</option>
          </select>
        </div>
        <div class="field quarter">
          <label for="fontSize">Size</label>
          <input id="fontSize" name="fontSize" type="number" min="1" value="50" data-editor-style>
        </div>
        <div class="field quarter">
          <label>Style</label>
          <div class="toggle-row">
            <label class="toggle-pill"><input type="checkbox" name="bold" value="1" checked data-editor-style> Bold</label>
            <label class="toggle-pill"><input type="checkbox" name="italic" value="1" data-editor-style> Italic</label>
          </div>
        </div>
        <div class="field quarter">
          <label for="previewButton">Preview</label>
          <button class="secondary-button" type="button" id="previewButton">Load Frame</button>
        </div>
        <div class="field full">
          <label for="fontPath">Font path</label>
          <div class="file-field">
            <input id="fontPath" name="fontPath" type="text" placeholder="Auto-resolve if blank">
            <label class="file-button">
              Browse
              <input type="file" data-upload-for="fontPath" accept=".ttf,.otf,.ttc,font/*">
            </label>
          </div>
          <div class="field-status" data-upload-status-for="fontPath"></div>
        </div>
      </div>

      <input type="hidden" name="topX" value="0">
      <input type="hidden" name="topY" value="0">
      <input type="hidden" name="bottomX" value="0">
      <input type="hidden" name="bottomY" value="0">
      <input type="hidden" name="width" value="720">

      <div class="editor-stage">
        <div class="editor-canvas" id="editorCanvas">
          <div class="editor-placeholder" id="editorPlaceholder">No Preview</div>
          <img id="editorPreview" alt="" hidden>
          <div class="editor-text editor-text-one" data-editor-text="topText" tabindex="0">TOP</div>
          <div class="editor-text editor-text-two" data-editor-text="bottomText" tabindex="0">BOTTOM</div>
        </div>
      </div>
    </div>`;
}

function renderTool(tool) {
  activeTool = tool;
  toolTitle.textContent = tool.title;
  toolKicker.textContent = 'Current Page Name';
  if (tool.experimental) {
    editorState.naturalWidth = 0;
    editorState.naturalHeight = 0;
    editorState.dragging = null;
    toolForm.innerHTML = renderExperimentalEditor();
    syncExperimentalEditor();
  } else {
    toolForm.innerHTML = `<div class="field-grid">${tool.fields.map(renderField).join('')}</div>`;
  }
  renderTabs();
}

function setJobState(status) {
  jobStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  jobStatus.className = status === 'complete' ? 'status-complete' : (status === 'failed' || status === 'cancelled' ? `status-${status}` : '');
}

function appendLog(text) {
  jobLog.textContent += text;
  if (jobLog.textContent.length > maxLogChars) {
    jobLog.textContent = `... trimmed earlier output ...\n${jobLog.textContent.slice(-maxLogChars)}`;
  }
  jobLog.scrollTop = jobLog.scrollHeight;
}

function setRunning(isRunning) {
  runButton.disabled = isRunning;
  cancelButton.disabled = !isRunning || !activeJobId;
}

function showOutput(fileUrl, outputPath, downloadUrl) {
  if (fileUrl) {
    outputLink.href = fileUrl;
    outputLink.textContent = outputPath ? `Open ${outputPath}` : 'Open output';
    outputLink.hidden = false;
  } else {
    outputLink.hidden = true;
    outputLink.removeAttribute('href');
  }

  if (downloadUrl) {
    downloadLink.href = downloadUrl;
    const filename = outputPath ? outputPath.split('/').pop() : '';
    downloadLink.textContent = filename ? `Download ${filename}` : 'Download output';
    if (filename) downloadLink.setAttribute('download', filename);
    downloadLink.hidden = false;
  } else {
    downloadLink.hidden = true;
    downloadLink.removeAttribute('href');
    downloadLink.removeAttribute('download');
  }
}

function cssFontFamily(value) {
  switch (value) {
    case 'serif':
      return 'Georgia, "Times New Roman", serif';
    case 'monospace':
      return '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
    case 'Impact':
      return 'Impact, Haettenschweiler, "Arial Black", sans-serif';
    case 'DejaVu Sans':
      return '"DejaVu Sans", Arial, sans-serif';
    case 'sans-serif':
    default:
      return 'Inter, Arial, sans-serif';
  }
}

function editorElements() {
  return {
    canvas: toolForm.querySelector('#editorCanvas'),
    preview: toolForm.querySelector('#editorPreview'),
    placeholder: toolForm.querySelector('#editorPlaceholder'),
    top: toolForm.querySelector('[data-editor-text="topText"]'),
    bottom: toolForm.querySelector('[data-editor-text="bottomText"]')
  };
}

function editorScale() {
  const { preview } = editorElements();
  if (!preview || !editorState.naturalWidth || !editorState.naturalHeight) {
    return { x: 1, y: 1 };
  }
  return {
    x: preview.clientWidth / editorState.naturalWidth,
    y: preview.clientHeight / editorState.naturalHeight
  };
}

function experimentalField(name) {
  return toolForm.querySelector(`[name="${CSS.escape(name)}"]`);
}

function setExperimentalPosition(textName, x, y) {
  const overlay = toolForm.querySelector(`[data-editor-text="${CSS.escape(textName)}"]`);
  const xInput = experimentalField(textName === 'topText' ? 'topX' : 'bottomX');
  const yInput = experimentalField(textName === 'topText' ? 'topY' : 'bottomY');
  if (!overlay || !xInput || !yInput) return;

  const scale = editorScale();
  const naturalX = Math.max(0, Math.round(x));
  const naturalY = Math.max(0, Math.round(y));
  xInput.value = String(naturalX);
  yInput.value = String(naturalY);
  overlay.style.left = `${naturalX * scale.x}px`;
  overlay.style.top = `${naturalY * scale.y}px`;
}

function refreshExperimentalPositions() {
  setExperimentalPosition('topText', Number(experimentalField('topX')?.value || 0), Number(experimentalField('topY')?.value || 0));
  setExperimentalPosition('bottomText', Number(experimentalField('bottomX')?.value || 0), Number(experimentalField('bottomY')?.value || 0));
}

function applyExperimentalStyles() {
  if (activeTool.id !== 'experimental-gif-editor') return;
  const family = experimentalField('fontFamily')?.value || 'sans-serif';
  const size = Math.max(1, Number(experimentalField('fontSize')?.value || 50));
  const scale = editorScale();
  const displaySize = Math.max(8, Math.round(size * scale.x));
  const isBold = Boolean(experimentalField('bold')?.checked);
  const isItalic = Boolean(experimentalField('italic')?.checked);

  for (const overlay of toolForm.querySelectorAll('.editor-text')) {
    overlay.style.fontFamily = cssFontFamily(family);
    overlay.style.fontSize = `${displaySize}px`;
    overlay.style.fontWeight = isBold ? '900' : '500';
    overlay.style.fontStyle = isItalic ? 'italic' : 'normal';
  }
}

function syncExperimentalEditor() {
  if (activeTool.id !== 'experimental-gif-editor') return;
  const { top, bottom } = editorElements();
  const topText = experimentalField('topText')?.value || '';
  const bottomText = experimentalField('bottomText')?.value || '';
  if (top) {
    top.textContent = topText;
    top.hidden = !topText;
  }
  if (bottom) {
    bottom.textContent = bottomText;
    bottom.hidden = !bottomText;
  }
  applyExperimentalStyles();
  refreshExperimentalPositions();
}

function initializeExperimentalPositions() {
  const sizeInput = experimentalField('fontSize');
  if (sizeInput && sizeInput.value === '50') {
    const autoSize = Math.min(64, Math.max(18, Math.round((editorState.naturalWidth || 720) / 14)));
    sizeInput.value = String(autoSize);
  }
  const size = Math.max(1, Number(sizeInput?.value || 50));
  const inset = Math.max(12, Math.round(editorState.naturalWidth * 0.05));
  const topY = Math.max(0, Math.round(editorState.naturalHeight * 0.08));
  const bottomY = Math.max(0, editorState.naturalHeight - size - Math.round(editorState.naturalHeight * 0.12));
  experimentalField('width').value = String(editorState.naturalWidth || 720);
  setExperimentalPosition('topText', inset, topY);
  setExperimentalPosition('bottomText', inset, bottomY);
  applyExperimentalStyles();
}

async function loadExperimentalPreview() {
  if (activeTool.id !== 'experimental-gif-editor') return;
  const input = experimentalField('input')?.value.trim();
  if (!input) return;

  setUploadStatus('input', 'Loading preview...', 'busy');
  const response = await fetch('/api/preview-frame', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Could not load preview.');
  }

  const { canvas, preview, placeholder } = editorElements();
  if (!canvas || !preview) return;
  await new Promise((resolve, reject) => {
    preview.onload = resolve;
    preview.onerror = () => reject(new Error('Could not render preview frame.'));
    preview.src = `${body.fileUrl}?t=${Date.now()}`;
  });

  editorState.naturalWidth = preview.naturalWidth;
  editorState.naturalHeight = preview.naturalHeight;
  preview.hidden = false;
  if (placeholder) placeholder.hidden = true;
  canvas.classList.add('has-preview');
  canvas.style.aspectRatio = `${editorState.naturalWidth} / ${editorState.naturalHeight}`;
  initializeExperimentalPositions();
  setUploadStatus('input', `Preview ${editorState.naturalWidth}x${editorState.naturalHeight}`, 'ready');
}

function beginExperimentalDrag(event) {
  const overlay = event.target.closest('.editor-text');
  if (activeTool.id !== 'experimental-gif-editor' || !overlay || overlay.hidden) return;
  const { canvas } = editorElements();
  if (!canvas || !editorState.naturalWidth || !editorState.naturalHeight) return;

  const overlayRect = overlay.getBoundingClientRect();
  editorState.dragging = {
    name: overlay.dataset.editorText,
    offsetX: event.clientX - overlayRect.left,
    offsetY: event.clientY - overlayRect.top
  };
  overlay.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveExperimentalDrag(event) {
  if (!editorState.dragging || activeTool.id !== 'experimental-gif-editor') return;
  const { canvas } = editorElements();
  const overlay = toolForm.querySelector(`[data-editor-text="${CSS.escape(editorState.dragging.name)}"]`);
  if (!canvas || !overlay) return;

  const rect = canvas.getBoundingClientRect();
  const scale = editorScale();
  const maxX = Math.max(0, rect.width - overlay.offsetWidth);
  const maxY = Math.max(0, rect.height - overlay.offsetHeight);
  const cssX = Math.min(maxX, Math.max(0, event.clientX - rect.left - editorState.dragging.offsetX));
  const cssY = Math.min(maxY, Math.max(0, event.clientY - rect.top - editorState.dragging.offsetY));
  setExperimentalPosition(editorState.dragging.name, cssX / scale.x, cssY / scale.y);
}

function endExperimentalDrag() {
  editorState.dragging = null;
}

function formFields() {
  for (const input of toolForm.querySelectorAll('[data-youtube="true"]')) {
    input.value = normalizeYouTubeInput(input.value);
  }

  const data = new FormData(toolForm);
  const fields = {};
  for (const [key, value] of data.entries()) {
    fields[key] = value;
  }
  return fields;
}

function setUploadStatus(fieldName, message, state = '') {
  const status = toolForm.querySelector(`[data-upload-status-for="${CSS.escape(fieldName)}"]`);
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function uploadFile(file, targetName) {
  const input = toolForm.querySelector(`[name="${CSS.escape(targetName)}"]`);
  if (!input) return;

  setUploadStatus(targetName, `Uploading ${file.name}...`, 'busy');
  const response = await fetch(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || `Upload failed for ${file.name}`);
  }

  input.value = body.path;
  setUploadStatus(targetName, `Selected ${body.path}`, 'ready');
  return body;
}

async function createJob() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  activeJobId = null;
  jobLog.textContent = '';
  showOutput(null, null, null);
  setJobState('running');
  setRunning(true);

  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: activeTool.id, fields: formFields() })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Could not start job.');
  }

  activeJobId = body.id;
  showOutput(body.fileUrl, body.outputPath, body.downloadUrl);
  setRunning(true);
  connectEvents(body.id);
}

function connectEvents(jobId) {
  eventSource = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);

  eventSource.addEventListener('status', event => {
    const data = JSON.parse(event.data);
    setJobState(data.status || 'running');
    showOutput(data.fileUrl, data.outputPath, data.downloadUrl);
    if (data.command) appendLog(`$ ${data.command}\n`);
  });

  eventSource.addEventListener('log', event => {
    const data = JSON.parse(event.data);
    appendLog(data.text || '');
  });

  eventSource.addEventListener('done', event => {
    const data = JSON.parse(event.data);
    setJobState(data.status || 'complete');
    showOutput(data.fileUrl, data.outputPath, data.downloadUrl);
    appendLog(`\n[${data.status}] exit=${data.exitCode ?? ''} signal=${data.signal || ''}\n`);
    setRunning(false);
    eventSource.close();
    eventSource = null;
  });

  eventSource.onerror = () => {
    appendLog('\n[event stream disconnected]\n');
    setRunning(false);
  };
}

async function cancelJob() {
  if (!activeJobId) return;
  await fetch(`/api/jobs/${encodeURIComponent(activeJobId)}/cancel`, { method: 'POST' });
  cancelButton.disabled = true;
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('bad status');
    const data = await response.json();
    statusDot.classList.add('ready');
    serverStatus.textContent = data.localOnly ? 'Local server ready' : 'Server ready';
  } catch {
    statusDot.classList.remove('ready');
    serverStatus.textContent = 'Server unavailable';
  }
}

toolTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-tool]');
  if (!button) return;
  const tool = tools.find(item => item.id === button.dataset.tool);
  if (tool) renderTool(tool);
});

toolForm.addEventListener('blur', event => {
  if (event.target.matches('[data-youtube="true"]')) {
    event.target.value = normalizeYouTubeInput(event.target.value);
  }
  if (activeTool.id === 'experimental-gif-editor' && event.target.matches('[name="input"]')) {
    loadExperimentalPreview().catch(err => {
      setUploadStatus('input', err.message, 'error');
      appendLog(`${err.message}\n`);
    });
  }
}, true);

toolForm.addEventListener('change', event => {
  const picker = event.target.closest('[data-upload-for]');
  if (!picker || !picker.files || picker.files.length === 0) {
    if (activeTool.id === 'experimental-gif-editor' && event.target.matches('[data-editor-style]')) {
      applyExperimentalStyles();
    }
    return;
  }

  const file = picker.files[0];
  const targetName = picker.dataset.uploadFor;
  uploadFile(file, targetName).then(() => {
    if (activeTool.id === 'experimental-gif-editor' && targetName === 'input') {
      return loadExperimentalPreview();
    }
    return null;
  }).catch(err => {
    setUploadStatus(targetName, err.message, 'error');
    appendLog(`${err.message}\n`);
  });
});

toolForm.addEventListener('input', event => {
  if (activeTool.id !== 'experimental-gif-editor') return;
  if (event.target.matches('[data-editor-bind]')) {
    syncExperimentalEditor();
  }
  if (event.target.matches('[data-editor-style]')) {
    applyExperimentalStyles();
    refreshExperimentalPositions();
  }
});

toolForm.addEventListener('click', event => {
  if (activeTool.id === 'experimental-gif-editor' && event.target.closest('#previewButton')) {
    loadExperimentalPreview().catch(err => {
      setUploadStatus('input', err.message, 'error');
      appendLog(`${err.message}\n`);
    });
  }
});

toolForm.addEventListener('pointerdown', beginExperimentalDrag);
toolForm.addEventListener('pointermove', moveExperimentalDrag);
toolForm.addEventListener('pointerup', endExperimentalDrag);
toolForm.addEventListener('pointercancel', endExperimentalDrag);

toolForm.addEventListener('submit', event => {
  event.preventDefault();
  createJob().catch(err => {
    setJobState('failed');
    appendLog(`${err.message}\n`);
    setRunning(false);
  });
});

cancelButton.addEventListener('click', () => {
  cancelJob().catch(err => appendLog(`${err.message}\n`));
});

renderTool(activeTool);
checkHealth();
