export async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load spec from ${path}`);
  }
  return await response.json();
}

// Mantém retrocompatibilidade caso alguma parte chame loadAdventure diretamente
export async function loadAdventure(path) {
  return await loadJSON(path);
}