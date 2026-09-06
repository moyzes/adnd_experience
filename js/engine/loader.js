/**
 * Loads and parses JSON resources with path normalization, HTML fallback guards,
 * and cache-busting retries to prevent SPA fallback routing collisions.
 */
export async function loadJSON(path) {
  // Normalize path to root-relative if not an absolute HTTP URL
  const isAbsoluteUrl = path.startsWith('http://') || path.startsWith('https://');
  const normalizedPath = isAbsoluteUrl
    ? path
    : (path.startsWith('/') ? path : '/' + path.replace(/^\.\//, ''));

  let response;
  try {
    response = await fetch(normalizedPath);
  } catch (netErr) {
    throw new Error(`Network error while fetching resource at ${normalizedPath}: ${netErr.message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to load ${normalizedPath} — HTTP status ${response.status} (${response.statusText || 'Not Found'})`);
  }

  let rawText = await response.text();

  // If server returned an HTML document (such as an SPA index.html fallback), retry with cache buster
  if (rawText.trim().startsWith('<')) {
    const separator = normalizedPath.includes('?') ? '&' : '?';
    const cacheBusterUrl = `${normalizedPath}${separator}_cb=${Date.now()}`;
    try {
      const retryRes = await fetch(cacheBusterUrl);
      if (retryRes.ok) {
        const retryText = await retryRes.text();
        if (!retryText.trim().startsWith('<')) {
          rawText = retryText;
        } else {
          throw new Error(`Resource at ${normalizedPath} returned an HTML document instead of JSON.`);
        }
      } else {
        throw new Error(`Failed to load ${normalizedPath} on cache-busting retry (${retryRes.status})`);
      }
    } catch (retryErr) {
      throw new Error(`Malformed JSON in resource at ${path}: Server returned HTML document instead of JSON`);
    }
  }

  try {
    return JSON.parse(rawText);
  } catch (parseErr) {
    throw new Error(`Malformed JSON in resource at ${path}: ${parseErr.message}`);
  }
}

// Backward compatibility alias in case legacy code calls loadAdventure directly
export async function loadAdventure(path) {
  return await loadJSON(path);
}