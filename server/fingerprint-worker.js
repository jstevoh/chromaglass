// Cloudflare Worker — audio-fingerprint proxy for ChromaGlass.
//
// Keeps the AudD (or ACRCloud) API key server-side. The client POSTs a short
// WAV snippet as multipart form-data (field "file"); the worker forwards it to
// the fingerprinting service and returns a normalized JSON response:
//
//   { isrc, title, artist, album, durationSec, offsetSec }
//
// Deploy:
//   1. npm i -g wrangler && wrangler login
//   2. wrangler deploy server/fingerprint-worker.js --name chromaglass-fingerprint
//   3. wrangler secret put AUDD_API_TOKEN   (get a token at https://audd.io)
//   4. Set VITE_FINGERPRINT_PROXY_URL to the deployed worker URL in .env
//
// To use ACRCloud instead, set ACR_HOST / ACR_ACCESS_KEY / ACR_ACCESS_SECRET
// secrets — the worker prefers ACRCloud when those are present.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    let file;
    try {
      const form = await request.formData();
      file = form.get('file');
    } catch {
      return json({ error: 'expected multipart form-data with a "file" field' }, 400);
    }
    if (!file || typeof file === 'string') return json({ error: 'missing audio file' }, 400);
    if (file.size > 2 * 1024 * 1024) return json({ error: 'snippet too large' }, 413);

    try {
      if (env.ACR_HOST && env.ACR_ACCESS_KEY && env.ACR_ACCESS_SECRET) {
        return json(await identifyAcrCloud(file, env));
      }
      if (env.AUDD_API_TOKEN) {
        return json(await identifyAudd(file, env));
      }
      return json({ error: 'no fingerprint service configured' }, 503);
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
  },
};

async function identifyAudd(file, env) {
  const form = new FormData();
  form.append('api_token', env.AUDD_API_TOKEN);
  form.append('file', file, 'snippet.wav');
  form.append('return', 'timecode');
  const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
  const data = await res.json();
  const r = data && data.result;
  if (!r) return { match: false };
  return {
    match: true,
    isrc: r.isrc || null,
    title: r.title,
    artist: r.artist,
    album: r.album || null,
    offsetSec: parseTimecode(r.timecode),
    durationSec: null,
  };
}

function parseTimecode(tc) {
  if (!tc || typeof tc !== 'string') return null;
  const parts = tc.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

async function identifyAcrCloud(file, env) {
  const httpMethod = 'POST';
  const httpUri = '/v1/identify';
  const dataType = 'audio';
  const signatureVersion = '1';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = [httpMethod, httpUri, env.ACR_ACCESS_KEY, dataType, signatureVersion, timestamp].join('\n');

  const keyData = new TextEncoder().encode(env.ACR_ACCESS_SECRET);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const form = new FormData();
  form.append('sample', file, 'snippet.wav');
  form.append('sample_bytes', String(file.size));
  form.append('access_key', env.ACR_ACCESS_KEY);
  form.append('data_type', dataType);
  form.append('signature_version', signatureVersion);
  form.append('signature', signature);
  form.append('timestamp', timestamp);

  const res = await fetch(`https://${env.ACR_HOST}${httpUri}`, { method: 'POST', body: form });
  const data = await res.json();
  const music = data && data.metadata && data.metadata.music && data.metadata.music[0];
  if (!music) return { match: false };
  return {
    match: true,
    isrc: (music.external_ids && music.external_ids.isrc) || null,
    title: music.title,
    artist: (music.artists && music.artists.map(a => a.name).join(', ')) || 'Unknown',
    album: (music.album && music.album.name) || null,
    offsetSec: typeof music.play_offset_ms === 'number' ? music.play_offset_ms / 1000 : null,
    durationSec: typeof music.duration_ms === 'number' ? music.duration_ms / 1000 : null,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
