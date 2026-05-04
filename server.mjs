import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || process.env.MUSICAL_API_PORT || 8787);
const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(ROOT_DIR, 'dist');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DEMO_AUDIUS_TRACK_ID = process.env.MUSICAL_DEMO_TRACK_ID || 'w2vOK';
const USE_DEMO_TRACK = process.env.MUSICAL_DEMO_TRACK !== 'off';
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};
function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function minutesBetween(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 30;
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

function eventIntensity(event) {
  const duration = minutesBetween(event.start_time?.datetime, event.end_time?.datetime);
  const title = event.summary || '';
  if (duration >= 60 || /评审|周会|Review|Meeting|项目/.test(title)) return 'high';
  if (duration >= 30 || /同步|对齐|日会/.test(title)) return 'medium';
  return 'low';
}

function normalizeEvent(event) {
  return {
    title: event.summary || '未命名日程',
    start: event.start_time?.datetime || '',
    end: event.end_time?.datetime || '',
    intensity: eventIntensity(event),
  };
}

function eventWeight(events) {
  return events.reduce((total, event) => {
    const score = event.intensity === 'high' ? 3 : event.intensity === 'medium' ? 2 : 1;
    return total + score;
  }, 0);
}

function musicQueries(events) {
  const weight = eventWeight(events);
  if (weight >= 7) {
    return ['ambient piano', 'lofi chill', 'acoustic calm', 'downtempo'];
  }
  if (weight >= 4) {
    return ['indie acoustic', 'chillhop', 'ambient folk', 'soft electronic'];
  }
  return ['morning ambient', 'dream pop', 'calm instrumental', 'soft piano'];
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function titleCase(value) {
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'with']);
  if (!value || hasCjk(value) || /[A-Z]/.test(value.slice(1))) return value;
  return value
    .split(/\s+/)
    .map((word, index, words) => {
      const lower = word.toLowerCase();
      if (index > 0 && index < words.length - 1 && smallWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function poemForTrack(track, events) {
  const title = track.title || '';
  const artist = track.user?.name || track.user?.handle || '';
  const genre = track.genre || '';
  const mood = track.mood || '';
  const language = hasCjk(`${title} ${artist} ${genre} ${mood} ${track.tags || ''}`) ? 'zh' : 'en';
  const weight = eventWeight(events);

  if (language === 'zh') {
    return weight >= 7
      ? ['飞书把白天收进一页纸，', '琴声替你把句号放轻。', '人声退远，', '晚风在耳边慢慢落座。']
      : ['飞书留下一小块空白，', '旋律从边角处亮起来。', '不用赶路，', '今天可以慢一点结束。'];
  }

  return weight >= 7
    ? ['Feishu folds the day into quiet lines,', 'the piano loosens what meetings held tight.', 'No words arrive,', 'only a softer room for the evening.']
    : ['Feishu leaves a margin in the day,', 'a small melody finds its way in.', 'Nothing asks to be answered,', 'the afternoon learns how to breathe.'];
}

function formatTrack(track, events) {
  const genre = track.genre || track.mood || 'Independent';
  const mood = track.mood || 'Calm';
  const artist = track.user?.name || track.user?.handle || 'Audius Artist';
  const title = titleCase(track.title || 'Untitled');
  return {
    song: title,
    artist,
    audioUrl: `/api/music/stream?id=${encodeURIComponent(track.id)}`,
    source: 'Audius',
    headline: eventWeight(events) >= 7 ? '飞书渐静，给耳朵一阵晚风。' : '飞书留白，旋律慢慢靠近。',
    reason: eventWeight(events) >= 7
      ? `会议密了些，所以选一首 ${mood.toLowerCase()} 的 ${genre.toLowerCase()}。`
      : `今天留有空隙，适合一首 ${mood.toLowerCase()} 的 ${genre.toLowerCase()}。`,
    tags: ['Audius', genre, mood].filter(Boolean).slice(0, 3),
    displayMode: 'poem',
    lyrics: [],
    poem: poemForTrack(track, events),
  };
}

function audiusDemoRecommendation(events) {
  return {
    song: 'Morning Dreams',
    artist: 'Mondo Loops',
    audioUrl: `/api/music/stream?id=${encodeURIComponent(DEMO_AUDIUS_TRACK_ID)}`,
    source: 'Audius',
    headline: eventWeight(events) >= 7 ? '飞书渐静，给耳朵一阵晚风。' : '飞书留白，旋律慢慢靠近。',
    reason: eventWeight(events) >= 7
      ? '会议密了些，所以选一首柔和的人声 chill。'
      : '今天留有空隙，适合一首柔和的人声 chill。',
    tags: ['Audius', 'Vocal', 'Chill'],
    displayMode: 'poem',
    lyrics: [],
    poem: [
      'Feishu lowers the room a little,',
      'a voice comes in like window light.',
      'Nothing needs to hurry,',
      'the evening finds a softer tempo.',
    ],
  };
}

async function searchAudius(events) {
  const results = await Promise.all(musicQueries(events).map(async (query, queryIndex) => {
    const url = new URL('https://api.audius.co/v1/tracks/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '8');
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) return [];
    const payload = await response.json();
    const candidates = (payload.data || [])
      .filter((track) => track.id && track.is_streamable !== false && !track.is_stream_gated)
      .filter((track) => !track.duration || (track.duration >= 45 && track.duration <= 420));
    return candidates.map((track) => ({ ...track, queryIndex }));
  }));

  const seen = new Set();
  return results
    .flat()
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .sort((a, b) => scoreAudiusTrack(b) - scoreAudiusTrack(a));
}

function scoreAudiusTrack(track) {
  const text = `${track.title || ''} ${track.genre || ''} ${track.mood || ''} ${track.tags || ''}`.toLowerCase();
  let score = 100 - (track.queryIndex || 0) * 12;
  if (/ambient|piano|lo-?fi|chill|acoustic|downtempo|instrumental|folk/.test(text)) score += 36;
  if (/peaceful|calm|sentimental|romantic|cool/.test(text)) score += 24;
  if (/hard|trap|dubstep|metal|aggressive|upbeat/.test(text)) score -= 30;
  score += Math.min(18, Math.log10((track.play_count || 1) + 1) * 4);
  const duration = track.duration || 0;
  if (duration >= 90 && duration <= 260) score += 10;
  return score;
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function proxyAudiusStream(req, res, trackId) {
  const apiUrl = `https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream`;
  const upstream = await fetch(apiUrl, {
    headers: req.headers.range ? { range: req.headers.range } : undefined,
    redirect: 'follow',
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Audius stream failed: ${upstream.status}`);
  }

  const headers = {
    'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
    'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'cache-control': 'no-store',
  };
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');
  if (contentLength) headers['content-length'] = contentLength;
  if (contentRange) headers['content-range'] = contentRange;

  res.writeHead(upstream.status, headers);
  Readable.fromWeb(upstream.body).pipe(res);
}

function isUsefulEvent(event) {
  const title = event.summary || '';
  if (event.self_rsvp_status === 'decline') return false;
  if (/公共假期|public holiday/i.test(title)) return false;
  return Boolean(event.start_time?.datetime && event.end_time?.datetime);
}

async function readTodayAgenda() {
  if (process.env.MUSICAL_CALENDAR_MODE === 'empty') {
    return [];
  }

  const today = shanghaiDate();
  const { stdout } = await execFileAsync(
    'lark-cli',
    ['calendar', '+agenda', '--start', today, '--end', today, '--format', 'json', '--as', 'user'],
    { maxBuffer: 1024 * 1024 * 8 },
  );
  const payload = JSON.parse(stdout);
  if (!payload.ok) {
    throw new Error(payload.error?.message || 'Failed to read Lark calendar');
  }
  return (payload.data || []).filter(isUsefulEvent).map(normalizeEvent);
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(DIST_DIR, normalizedPath);

  try {
    await access(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': requestedPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      createReadStream(filePath).pipe(res);
    }
    return true;
  } catch {
    try {
      const html = await readFile(join(DIST_DIR, 'index.html'));
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : html);
      return true;
    } catch {
      return false;
    }
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/api/calendar/today' && req.method === 'GET') {
    try {
      const events = await readTodayAgenda();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, events }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown calendar error',
        }),
      );
    }
    return;
  }

  if (req.url === '/api/music/recommendation' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req);
      const events = Array.isArray(body.events) ? body.events : [];
      if (USE_DEMO_TRACK) {
        const recommendation = audiusDemoRecommendation(events);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          recommendation,
          tracks: [{ song: recommendation.song, artist: recommendation.artist, source: recommendation.source, tags: recommendation.tags }],
        }));
        return;
      }

      const tracks = await searchAudius(events);
      if (!tracks.length) {
        throw new Error('No playable Audius tracks found');
      }
      const formatted = tracks.slice(0, 6).map((track) => formatTrack(track, events));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        recommendation: formatted[0],
        tracks: formatted.map(({ song, artist, source, tags }) => ({ song, artist, source, tags })),
      }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown music error',
        }),
      );
    }
    return;
  }

  if (req.url?.startsWith('/api/music/stream') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const trackId = url.searchParams.get('id');
      if (!trackId) throw new Error('Missing track id');
      await proxyAudiusStream(req, res, trackId);
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown stream error',
        }),
      );
    }
    return;
  }

  if (await serveStatic(req, res)) {
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Musical API listening on http://localhost:${PORT}`);
});
