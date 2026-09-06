import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Explicitly serve static files with proper MIME headers and caching controls
app.use(express.static(__dirname, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Route non-existent asset / data requests with 404 instead of returning index.html SPA fallback
app.use('/data', (req, res) => {
  res.status(404).json({ error: `File not found: ${req.originalUrl}` });
});

app.use('/assets', (req, res) => {
  res.status(404).send('Asset not found');
});

// SPA fallback: Only return index.html for page navigation (requests without a file extension)
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send(`Resource not found: ${req.path}`);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Grid RPG Engine server running on http://0.0.0.0:${PORT}`);
});
