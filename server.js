'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const { google } = require('googleapis');
const path = require('path');
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const PORT = process.env.PORT || 3000;
const FOLDER_ID = (process.env.DRIVE_FOLDER_ID || '').trim();
const REFRESH_MS = Math.max(15000, Number(process.env.PLAYLIST_REFRESH_SECONDS || 60) * 1000);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v']);

function getAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    const obj = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8'));
    return new google.auth.JWT({ email: obj.client_email, key: obj.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth;
  }
  throw new Error('Configure as credenciais do Google Drive no arquivo .env.');
}
const drive = google.drive({ version: 'v3', auth: getAuth() });
let cache = { files: [], expires: 0, inflight: null, lastError: null, updatedAt: null };
async function fetchPlaylist(force = false) {
  if (!FOLDER_ID) throw new Error('DRIVE_FOLDER_ID não foi definido.');
  if (!force && Date.now() < cache.expires) return cache.files;
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    try {
      const found = [];
      let pageToken;
      do {
        const result = await drive.files.list({
          q: `'${FOLDER_ID.replace(/'/g, "\\'")}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
          orderBy: 'name', pageSize: 1000, pageToken,
          supportsAllDrives: true, includeItemsFromAllDrives: true
        });
        found.push(...(result.data.files || []));
        pageToken = result.data.nextPageToken;
      } while (pageToken);
      cache.files = found.filter(x => VIDEO_MIMES.has(x.mimeType)).map(x => ({
        id: x.id, name: x.name, size: x.size || null, modifiedTime: x.modifiedTime || null
      }));
      cache.expires = Date.now() + REFRESH_MS;
      cache.updatedAt = new Date().toISOString();
      cache.lastError = null;
      return cache.files;
    } catch (e) {
      cache.lastError = e.message;
      cache.expires = Date.now() + Math.min(REFRESH_MS, 15000);
      if (cache.updatedAt) return cache.files; // mantém playlist anterior se o Drive estiver temporariamente indisponível
      throw e;
    } finally { cache.inflight = null; }
  })();
  return cache.inflight;
}
app.get('/api/playlist', async (req, res) => {
  try {
    const videos = await fetchPlaylist();
    res.set('Cache-Control', 'no-store');
    res.json({ videos: videos.map(v => ({...v, url: `/api/video/${encodeURIComponent(v.id)}`})), updatedAt: cache.updatedAt, refreshSeconds: REFRESH_MS / 1000, warning: cache.lastError });
  } catch (e) { console.error('Playlist:', e.message); res.status(503).json({ error: 'Não foi possível acessar a pasta do Google Drive.', detail: process.env.NODE_ENV === 'production' ? undefined : e.message }); }
});
app.get('/api/video/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const videos = await fetchPlaylist();
    if (!videos.some(v => v.id === id)) return res.sendStatus(404);
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const response = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream', headers, validateStatus: status => status >= 200 && status < 300 });
    const upstream = response.data;
    res.status(response.status);
    const type = response.headers['content-type'] || 'video/mp4';
    res.set('Content-Type', type);
    for (const h of ['content-length','content-range','accept-ranges','etag','last-modified']) {
      if (response.headers[h]) res.set(h, response.headers[h]);
    }
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'private, max-age=60');
    upstream.on('error', e => { console.error('Stream:', e.message); if (!res.headersSent) res.status(502).end(); else res.destroy(e); });
    req.on('close', () => upstream.destroy());
    upstream.pipe(res);
  } catch (e) { console.error('Vídeo:', e.message); if (!res.headersSent) res.status(502).json({ error: 'Não foi possível transmitir o vídeo.' }); }
});
app.get('/health', (req,res) => res.json({ok: true, configured: Boolean(FOLDER_ID), videos: cache.files.length}));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (_,res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Nogueira TV: porta ${PORT}`));
