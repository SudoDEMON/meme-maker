import { state, assetById, persist } from './state.js';
import { captionStyle, previewFamily } from './caption-fonts.js';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export class EditorGeometry {
  constructor(panel, onChange) {
    this.panel = panel;
    this.onChange = onChange;
    this.drag = null;
    panel.addEventListener('pointerdown', event => this.start(event));
    panel.addEventListener('pointermove', event => this.move(event));
    const end = () => { this.drag = null; };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
    panel.addEventListener('lostpointercapture', end);
    panel.addEventListener('keydown', event => this.keyboard(event));
    this.observer = new ResizeObserver(() => this.paint());
    this.observer.observe(panel);
  }
  get dimensions() {
    const info = assetById(state.editor.sourceId)?.info;
    return { width: info?.width || 0, height: info?.height || 0 };
  }
  get scale() {
    const width = this.panel.querySelector('#editorCanvas')?.clientWidth || 0;
    return this.dimensions.width ? width / this.dimensions.width : 1;
  }
  initialize() {
    const e = state.editor;
    const { width, height } = this.dimensions;
    if (!width || !height) return;
    if (!e.initialized) {
      e.fontSize = Math.max(18, Math.min(80, Math.round(width / 14)));
      e.cropX = 0; e.cropY = 0; e.cropWidth = width; e.cropHeight = height;
      e.initialized = true;
      const size = this.panel.querySelector('[name="fontSize"]');
      if (size) size.value = e.fontSize;
    }
    this.paint();
  }
  paint() {
    const { width, height } = this.dimensions;
    const canvas = this.panel.querySelector('#editorCanvas');
    if (!canvas || !width || !height) return;
    const e = state.editor;
    canvas.style.aspectRatio = `${width} / ${height}`;
    const scale = this.scale;
    if (!scale) return;
    for (const line of ['top', 'bottom']) {
      const overlay = this.panel.querySelector(`[data-caption="${line}"]`);
      if (!overlay) continue;
      overlay.textContent = e[`${line}Text`];
      overlay.hidden = !overlay.textContent;
      const {size, bold, italic} = captionStyle(e, line);
      overlay.style.fontFamily = `"${previewFamily(e,line)}", sans-serif`;
      overlay.style.fontSize = `${size * scale}px`;
      overlay.style.fontWeight = bold ? '700' : '400';
      overlay.style.fontStyle = italic ? 'italic' : 'normal';
      overlay.style.textDecoration = [e.underline ? 'underline' : '', e.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
      overlay.style.webkitTextStroke = `${2 * scale}px black`;
      if (e.layout === 'classic') {
        e[`${line}X`] = Math.max(0, Math.round((width - overlay.offsetWidth / scale) / 2));
        e[`${line}Y`] = Math.round(line === 'top' ? height * .06 : Math.max(0, height * .94 - overlay.offsetHeight / scale));
      }
      overlay.style.left = `${e[`${line}X`] * scale}px`;
      overlay.style.top = `${e[`${line}Y`] * scale}px`;
    }
    const crop = this.panel.querySelector('#cropBox');
    if (crop && e.initialized) {
      crop.hidden = false;
      crop.style.left = `${e.cropX * scale}px`;
      crop.style.top = `${e.cropY * scale}px`;
      crop.style.width = `${e.cropWidth * scale}px`;
      crop.style.height = `${e.cropHeight * scale}px`;
    }
    const summary = this.panel.querySelector('#cropSummary');
    if (summary) summary.textContent = `${e.cropWidth} × ${e.cropHeight}${e.cropX || e.cropY ? ` · ${e.cropX}, ${e.cropY}` : ''}`;
    persist();
  }
  start(event) {
    const target = event.target.closest('[data-caption], [data-crop]');
    if (!target || event.button !== 0 || !this.dimensions.width) return;
    event.preventDefault();
    target.focus();
    target.setPointerCapture(event.pointerId);
    this.drag = { target, x: event.clientX, y: event.clientY, editor: { ...state.editor } };
  }
  move(event) {
    if (!this.drag) return;
    const { target, x, y, editor } = this.drag;
    const dx = Math.round((event.clientX - x) / this.scale);
    const dy = Math.round((event.clientY - y) / this.scale);
    this.apply(target, editor, dx, dy);
  }
  apply(target, before, dx, dy) {
    const e = state.editor;
    const { width, height } = this.dimensions;
    if (target.dataset.caption) {
      const line = target.dataset.caption;
      e.layout = 'custom';
      e[`${line}X`] = Math.round(clamp(before[`${line}X`] + dx, 0, width - 1));
      e[`${line}Y`] = Math.round(clamp(before[`${line}Y`] + dy, 0, height - 1));
    } else {
      const handle = target.dataset.crop;
      let left = before.cropX, top = before.cropY;
      let right = left + before.cropWidth, bottom = top + before.cropHeight;
      // Even crop boundaries match FFmpeg's chroma-subsampled video coordinates.
      dx = Math.round(dx / 2) * 2; dy = Math.round(dy / 2) * 2;
      if (handle.includes('w')) left = clamp(left + dx, 0, right - 8);
      if (handle.includes('e')) right = clamp(right + dx, left + 8, width);
      if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 8);
      if (handle.includes('s')) bottom = clamp(bottom + dy, top + 8, height);
      Object.assign(e, { cropX: left, cropY: top, cropWidth: right - left, cropHeight: bottom - top });
    }
    this.paint();
    this.onChange();
  }
  keyboard(event) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const target = event.target.closest('[data-caption], [data-crop]');
    if (!delta || !target) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : target.dataset.crop ? 2 : 1;
    this.apply(target, { ...state.editor }, delta[0] * step, delta[1] * step);
  }
}
