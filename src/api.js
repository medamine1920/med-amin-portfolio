export async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw Error(data.error || 'Request failed.');
  return data;
}

export const external = url => { try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; } };
