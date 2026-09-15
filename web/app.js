import { state, assetById, isVideo, editAsset, persist, escapeHtml as h, formatTime } from './state.js';
import { post, upload } from './api.js';
import { MediaTools } from './media-tools.js';
import { MemeEditor } from './editor.js';
import { JobClient } from './jobs.js';

const mediaPanel = document.querySelector('#mediaPanel');
const editorPanel = document.querySelector('#editorPanel');
const list = document.querySelector('#assetList');
const libraryStatus = document.querySelector('#libraryStatus');
const jobs = new JobClient(job => addResult(job), job => {
  const asset = addResult(job);
  openEditor(asset);
});
const run = (action, fields) => jobs.run(action, fields);
const media = new MediaTools(mediaPanel, run, changed);
const editor = new MemeEditor(editorPanel, run, changed);

function changed(render = true) {
  persist();
  if (render) renderLibrary();
  jobs.syncButtons();
}
function addResult(job) {
  let asset = state.assets.find(item => item.path === job.outputPath);
  if (!asset) {
    asset = { id: crypto.randomUUID(), path: job.outputPath, name: job.outputPath.split('/').pop(), fileUrl: job.fileUrl };
    state.assets.push(asset);
  } else { asset.fileUrl = job.fileUrl; delete asset.info; }
  inspect(asset);
  renderLibrary();
  editor.updateSources();
  persist();
  return asset;
}
function openEditor(asset) {
  if (!isVideo(asset)) return;
  editAsset(asset);
  renderSection();
}
function renderSection() {
  const editing = state.section === 'editor';
  document.body.dataset.section = state.section;
  document.querySelectorAll('[data-section]').forEach(button => {
    if (button.dataset.section === state.section) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#sectionTitle').textContent = editing ? 'Meme Editor' : 'Media Tools';
  document.querySelector('#sectionEyebrow').textContent = editing ? 'MAKE IT YOURS' : 'YOUR MEDIA, READY TO GO';
  document.querySelector('#sectionDescription').textContent = editing ? 'Find the moment. Add your caption. Make it a meme.' : 'Download, convert, or combine. Start with your files or a link.';
  mediaPanel.hidden = editing;
  editorPanel.hidden = !editing;
  if (editing) editor.render();
  else { editor.deactivate(); media.render(); }
  renderLibrary();
  jobs.syncButtons();
  persist();
}
function describeAsset(asset) {
  const info = asset.info;
  return asset.error || (info ? [info.duration ? formatTime(info.duration) : '', info.width ? `${info.width} × ${info.height}` : 'Audio'].filter(Boolean).join(' · ') : /\.html?$/i.test(asset.path) ? 'HTML animation' : 'Inspecting…');
}
function renderLibrary() {
  const combining = state.section === 'media' && state.operation === 'combine';
  const ordered = combining ? [...state.selectedIds.map(assetById).filter(Boolean), ...state.assets.filter(asset => !state.selectedIds.includes(asset.id))] : state.assets;
  list.innerHTML = ordered.map(asset => {
    const selected = state.selectedIds.includes(asset.id);
    const editing = state.section === 'editor' && state.editor.sourceId === asset.id;
    const description = describeAsset(asset);
    return `<li class="asset-card ${selected || editing ? 'selected' : ''}" data-asset="${h(asset.id)}">
      <label class="asset-select"><input type="${combining ? 'checkbox' : 'radio'}" name="selectedAsset" value="${h(asset.id)}" ${selected ? 'checked' : ''}><span><strong title="${h(asset.name)}">${h(asset.name)}</strong><small class="${asset.error ? 'error' : ''}">${h(description)}</small></span></label>
      <div class="asset-actions">${isVideo(asset) ? `<button type="button" data-edit="${h(asset.id)}" class="text-button">Edit →</button>` : ''}${combining && selected ? `<span class="reorder-actions"><button type="button" data-move="-1" aria-label="Move ${h(asset.name)} earlier" ${state.selectedIds.indexOf(asset.id) === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="1" aria-label="Move ${h(asset.name)} later" ${state.selectedIds.indexOf(asset.id) === state.selectedIds.length - 1 ? 'disabled' : ''}>↓</button></span>` : ''}<button type="button" class="text-button remove-asset" data-remove="${h(asset.id)}" aria-label="Remove ${h(asset.name)} from library">×</button></div>
    </li>`;
  }).join('');
  document.querySelector('#assetCount').textContent = state.assets.length;
  document.querySelector('#libraryEmpty').hidden = state.assets.length > 0;
}
async function inspect(asset) {
  if (/\.html?$/i.test(asset.path)) return;
  try {
    const info = await post('/api/source-info', { source: asset.path });
    if (!state.assets.includes(asset)) return;
    asset.info = info;
    if (info.kind === 'remote' && info.title) asset.name = info.title;
    asset.fileUrl = info.fileUrl || asset.fileUrl;
    asset.error = '';
  } catch (err) {
    if (!state.assets.includes(asset)) return;
    asset.error = err.message.split('\n').pop();
  }
  if (jobs.result?.outputPath === asset.path && !jobs.busy) jobs.showResult(jobs.result);
  // Updating this asset never writes values into a draft or another source's fields.
  const card = list.querySelector(`[data-asset="${CSS.escape(asset.id)}"]`);
  if (card) {
    card.querySelector('strong').textContent = asset.name;
    card.querySelector('strong').title = asset.name;
    card.querySelector('small').textContent = describeAsset(asset);
    card.querySelector('small').classList.toggle('error', Boolean(asset.error));
  }
  if (state.section === 'media') media.updateSourceInfo();
  editor.updateSources();
  changed(false);
}
function addSource(path, name, fileUrl) {
  let asset = state.assets.find(item => item.path === path);
  if (!asset) {
    asset = { id: crypto.randomUUID(), path, name: name || path.split('/').pop() || path, fileUrl };
    state.assets.push(asset);
  }
  if (state.operation === 'combine' && state.section === 'media') {
    if (!state.selectedIds.includes(asset.id)) state.selectedIds.push(asset.id);
  } else state.selectedIds = [asset.id];
  renderLibrary();
  if (state.section === 'media') media.render();
  editor.updateSources();
  if (state.section === 'editor' && !state.editor.sourceId && isVideo(asset)) openEditor(asset);
  inspect(asset);
  changed(false);
  return asset;
}
let uploadsInFlight = 0;
async function addFiles(files) {
  for (const file of files) {
    uploadsInFlight += 1;
    libraryStatus.textContent = `Uploading ${file.name}…`;
    try {
      const result = await upload(file);
      addSource(result.path, file.name, result.fileUrl);
      libraryStatus.textContent = `Added ${file.name}`;
    } catch (err) { libraryStatus.textContent = err.message; }
    finally { uploadsInFlight -= 1; }
  }
}

document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
  if (state.section === button.dataset.section) return;
  state.section = button.dataset.section;
  if (state.section === 'editor' && !state.editor.sourceId) {
    const asset = state.selectedIds.map(assetById).find(isVideo) || state.assets.find(isVideo);
    if (asset) editAsset(asset);
  }
  renderSection();
}));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); state.section = 'media'; renderSection(); });
document.querySelector('#addSourceForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#sourceInput');
  const value = input.value.trim();
  if (value) { addSource(value); input.value = ''; }
});
document.querySelector('#mediaUpload').addEventListener('change', event => {
  addFiles(Array.from(event.target.files));
  event.target.value = '';
});
const dropZone = document.querySelector('#dropZone');
for (const type of ['dragenter','dragover']) dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragging'); });
for (const type of ['dragleave','drop']) dropZone.addEventListener(type, event => {
  event.preventDefault(); dropZone.classList.remove('dragging');
  if (type === 'drop') addFiles(Array.from(event.dataTransfer.files));
});
list.addEventListener('change', event => {
  if (!event.target.matches('[name="selectedAsset"]')) return;
  const id = event.target.value;
  if (state.section === 'media' && state.operation === 'combine') {
    if (event.target.checked) state.selectedIds.push(id);
    else state.selectedIds = state.selectedIds.filter(item => item !== id);
  } else {
    state.selectedIds = [id];
    if (state.section === 'editor') openEditor(assetById(id));
  }
  if (state.section === 'media') media.render();
  changed();
});
list.addEventListener('click', event => {
  // Keep selection inputs attached until their change event reaches the list.
  // Rebuilding here interrupts radio/checkbox changes and label activation.
  if (!event.target.closest('[data-edit], [data-move], [data-remove]')) return;
  const edit = event.target.closest('[data-edit]');
  if (edit) openEditor(assetById(edit.dataset.edit));
  const move = event.target.closest('[data-move]');
  if (move) {
    const id = move.closest('[data-asset]').dataset.asset;
    const index = state.selectedIds.indexOf(id);
    const next = index + Number(move.dataset.move);
    if (next >= 0 && next < state.selectedIds.length) [state.selectedIds[index], state.selectedIds[next]] = [state.selectedIds[next], state.selectedIds[index]];
    media.render();
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    const id = remove.dataset.remove;
    state.assets = state.assets.filter(asset => asset.id !== id);
    state.selectedIds = state.selectedIds.filter(value => value !== id);
    if (state.editor.sourceId === id) {
      state.editor.sourceId = '';
      if (state.section === 'editor') editor.render();
    }
    editor.updateSources();
    if (state.section === 'media') media.render();
  }
  changed();
});
window.addEventListener('beforeunload', event => {
  if (uploadsInFlight) { event.preventDefault(); event.returnValue = ''; }
});
async function health() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Unavailable');
    document.querySelector('#serverStatus').textContent = '● Local server ready';
  } catch { document.querySelector('#serverStatus').textContent = 'Server unavailable'; }
}
renderSection();
health();
for (const asset of state.assets) inspect(asset);
