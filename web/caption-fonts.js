const fonts = new Map();
export function captionStyle(editor, line) {
  const family = editor[`${line}FontFamily`] || editor.fontFamily || 'sans-serif';
  const extra = editor[`${line}FontStyle`] || '';
  const bold = editor.bold || extra.includes('bold');
  const italic = editor.italic || extra.includes('italic');
  const key = `${family}:${bold}:${italic}`;
  return { family, bold, italic, key, size: Number(editor[`${line}FontSize`] || editor.fontSize) || 50 };
}
export function previewFamily(editor, line) {
  if (editor.fontUrl) return 'MemeCustomFont';
  const style = captionStyle(editor,line);
  return fonts.get(style.key)?.name || style.family;
}
export async function ensureCaptionFonts(editor) {
  if (editor.fontUrl) return;
  await Promise.all(['top','bottom'].map(line => {
    const style = captionStyle(editor,line);
    if (fonts.has(style.key)) return fonts.get(style.key).promise;
    const name = `MemeFont${fonts.size}`;
    const params = new URLSearchParams({family:style.family,bold:style.bold?'1':'0',italic:style.italic?'1':'0'});
    const font = new FontFace(name, `url("/api/font?${params}")`, {weight:style.bold?'700':'400',style:style.italic?'italic':'normal'});
    const entry = {name:'',promise:font.load().then(loaded=>{ document.fonts.add(loaded);entry.name=name; })};
    fonts.set(style.key,entry);
    return entry.promise;
  }));
}
