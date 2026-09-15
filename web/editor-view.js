import { state, assetById, isVideo, escapeHtml as h, formatTime } from './state.js';
const families = ['', 'sans-serif', 'serif', 'monospace', 'Impact', 'DejaVu Sans', 'Arial'];
const field = (name, label, attrs = '') => `<label class="field">${label}<input name="${name}" value="${h(state.editor[name])}" ${attrs}></label>`;
const select = (name, label, options) => `<label class="field">${label}<select name="${name}">${options.map(([value, title]) => `<option value="${h(value)}" ${state.editor[name] === value ? 'selected' : ''}>${h(title)}</option>`).join('')}</select></label>`;
const fonts = (name, label) => select(name, label, families.map(f => [f, f || 'Inherit']));

export function sourceOptions() {
  return `<option value="">Choose media from your library</option>${state.assets.filter(isVideo).map(asset => `<option value="${h(asset.id)}" ${state.editor.sourceId === asset.id ? 'selected' : ''}>${h(asset.name)}</option>`).join('')}`;
}

export function editorView() {
  const e = state.editor;
  const source = assetById(e.sourceId);
  return `<form id="editorForm">
    <div class="editor-head"><label class="field">Editing<select id="editorSource" name="sourceId">${sourceOptions()}</select></label><button type="button" class="text-button" data-editor-action="reset">Reset edits</button></div>
    <div class="editor-workspace">
      <div class="preview-column">
        <div class="preview-stage"><div id="editorCanvas" class="editor-canvas">
          <div id="editorPlaceholder" class="editor-placeholder"><span aria-hidden="true">▧</span><strong>${source ? 'Loading your preview…' : 'Your next meme starts here'}</strong><p>${source ? 'Inspecting the source and finding a frame.' : 'Add a file or a link, then choose it above.'}</p></div>
          <img id="editorPreview" alt="Source frame for editing" hidden>
          <video id="editorVideo" playsinline preload="metadata" hidden></video>
          ${['top', 'bottom'].map(line => `<div class="editor-text" data-caption="${line}" role="button" tabindex="0" aria-label="Move ${line} caption with arrow keys" hidden></div>`).join('')}
          <div id="cropBox" class="crop-box" hidden>${['n','e','s','w','nw','ne','sw','se'].map(handle => `<button type="button" class="crop-handle crop-${handle}" data-crop="${handle}" aria-label="Resize crop ${handle}; use arrow keys"></button>`).join('')}</div>
        </div></div>
        <p id="previewStatus" class="status-message" role="status"></p>
        <div class="preview-toolbar"><button type="button" data-editor-action="play" class="secondary-button" disabled>Play</button><span id="previewTimeLabel">0:00 / ${formatTime(source?.info?.duration)}</span><button type="button" class="text-button" data-editor-action="retry">Reload preview</button></div>
        <label class="scrub-label"><span class="sr-only">Preview time</span><input id="previewTime" type="range" min="0" max="0" value="0" step="0.01" disabled></label>
        <div class="trim-row"><div>${field('outputStart', 'Start', 'placeholder="0:00 or 0f"')}<button type="button" data-editor-action="set-start" class="text-button">Use current frame</button></div><div>${field('outputEnd', 'End', `placeholder="${source?.info?.duration ? h(formatTime(source.info.duration)) : 'End of media'}"`)}<button type="button" data-editor-action="set-end" class="text-button">Use current frame</button></div></div>
        <p class="muted compact-copy">Drag captions to position them. Drag the blue edges to crop.</p>
      </div>
      <div class="editor-controls">
        <div class="control-heading"><h2>Captions</h2><button type="button" class="text-button" data-editor-action="classic">Classic layout</button></div>
        <label class="field">Top text<textarea name="topText" placeholder="Add a top caption">${h(e.topText)}</textarea></label>
        <label class="field">Bottom text<textarea name="bottomText" placeholder="Add a bottom caption">${h(e.bottomText)}</textarea></label>
        <div class="field-grid">${fonts('fontFamily','Font')}${field('fontSize','Size','type="number" min="1" max="1000"')}</div>
        <div class="style-toggles">${[['bold','B','Bold'],['italic','I','Italic'],['underline','U','Underline'],['strike','S','Strikethrough']].map(([name,label,title]) => `<label title="${title}" class="style-toggle"><input type="checkbox" name="${name}" ${e[name] ? 'checked' : ''}><span aria-hidden="true">${label}</span><span class="sr-only">${title}</span></label>`).join('')}</div>
        <div class="control-heading"><h3>Crop</h3><button type="button" class="text-button" data-editor-action="crop-reset">Full frame</button></div><p class="muted" id="cropSummary">Full frame</p>
        <details id="editorAdvanced"><summary>Advanced settings</summary>
          <div class="field-grid">${field('outputFps','Output FPS','type="number" min="0.1" step="0.1" placeholder="Auto"')}<label class="field">Preview frame<input id="previewFrame" type="number" min="0" step="1" value="0"></label></div>
          <p id="mediaProperties" class="muted"></p>
          ${['top','bottom'].map(line => `<h3>${line === 'top' ? 'Top' : 'Bottom'} caption overrides</h3>${fonts(`${line}FontFamily`, 'Font face')}${field(`${line}FontSize`,'Size','type="number" min="1" placeholder="Inherit"')}${select(`${line}FontStyle`,'Extra style',[['','Inherit'],['bold','Bold'],['italic','Italic'],['bold-italic','Bold italic']])}`).join('')}
          <label class="field">Custom font<input id="fontUpload" type="file" accept=".ttf,.otf,.ttc"><span id="fontStatus" class="muted">${e.fontPath ? h(e.fontPath.split('/').pop()) : 'Optional font file'}</span></label>
        </details>
      </div>
    </div>
    <div class="export-bar"><div class="field-grid">${field('output','Output name','placeholder="Automatic"')}${select('format','Format',[['mp4','MP4'],['gif','GIF'],['webm','WebM']])}${field('width','Width','type="number" min="2" step="2" required')}</div><button class="primary-button" type="submit" data-run>Export meme →</button></div>
    <p id="editorError" class="error" role="alert"></p>
  </form>`;
}
