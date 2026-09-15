export async function post(path, body, signal) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
export async function upload(file) {
  const response = await fetch(`/api/uploads?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Could not upload ${file.name}.`);
  return body;
}
