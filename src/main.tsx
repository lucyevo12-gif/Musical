import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  CalendarEvent,
  RadioRecommendation,
  createRecommendation,
  loadPlayableRecommendation,
  loadTodayCalendarEvents,
  mockTodayEvents,
} from './calendar';
import './styles.css';

const LARK_CALENDAR_STORAGE_KEY = 'musical:lark-calendar:v1';

if (new URLSearchParams(window.location.search).has('firstUse')) {
  window.localStorage.removeItem(LARK_CALENDAR_STORAGE_KEY);
  window.history.replaceState({}, '', window.location.pathname);
}

function WaveBars({
  compact = false,
  levels,
  offset = 0,
}: {
  compact?: boolean;
  levels: number[];
  offset?: number;
}) {
  const barCount = compact ? 70 : 58;
  return (
    <div className={compact ? 'wave-bars compact' : 'wave-bars'} aria-hidden="true">
      <div className="wave-track">
        {Array.from({ length: barCount }).map((_, index) => (
          <span
            key={index}
            style={{
              height: `${compact ? 8 + levels[(index + offset) % levels.length] * 30 : 18 + levels[(index + offset) % levels.length] * 78}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function App() {
  const [calendarAuthorized, setCalendarAuthorized] = useState(
    () => window.localStorage.getItem(LARK_CALENDAR_STORAGE_KEY) === 'connected',
  );
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(mockTodayEvents);
  const [calendarStatus, setCalendarStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [musicStatus, setMusicStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [playableRecommendation, setPlayableRecommendation] = useState<RadioRecommendation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveLevels, setWaveLevels] = useState(() => {
    return Array.from({ length: 96 }).map((_, index) => 0.22 + Math.abs(Math.sin(index * 0.53)) * 0.58);
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const fallbackRecommendation = useMemo(() => createRecommendation(calendarEvents), [calendarEvents]);
  const recommendation = playableRecommendation || fallbackRecommendation;
  const waveOffset = Math.floor(currentTime * 18) % waveLevels.length;
  const lyricIndex = recommendation.displayMode === 'lyrics' ? recommendation.lyrics.reduce((activeIndex, lyric, index) => {
    return currentTime >= lyric.time ? index : activeIndex;
  }, 0) : -1;

  function formatTime(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
          audio.load();
        }
        const playPromise = audio.play();
        setIsPlaying(true);
        await ensureAudioAnalyser(audio);
        await playPromise;
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seekToPointer(event: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextTime = ratio * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  async function ensureAudioAnalyser(audio: HTMLAudioElement) {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (!sourceRef.current) {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.68;
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  }

  async function authorizeCalendar() {
    window.localStorage.setItem(LARK_CALENDAR_STORAGE_KEY, 'connected');
    setCalendarAuthorized(true);
    setCalendarStatus('loading');

    try {
      const events = await loadTodayCalendarEvents();
      setCalendarEvents(events);
      setCalendarStatus('ready');
    } catch {
      setCalendarEvents(mockTodayEvents);
      setCalendarStatus('error');
    }
  }

  useEffect(() => {
    if (!calendarAuthorized) return;

    let active = true;
    setCalendarStatus('loading');
    loadTodayCalendarEvents()
      .then((events) => {
        if (!active) return;
        setCalendarEvents(events);
        setCalendarStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setCalendarEvents(mockTodayEvents);
        setCalendarStatus('error');
      });

    return () => {
      active = false;
    };
  }, [calendarAuthorized]);

  useEffect(() => {
    if (!calendarAuthorized || calendarStatus === 'loading') return;

    let active = true;
    setMusicStatus('loading');
    setPlayableRecommendation(null);
    loadPlayableRecommendation(calendarEvents)
      .then((nextRecommendation) => {
        if (!active) return;
        setPlayableRecommendation(nextRecommendation);
        setMusicStatus('ready');
        setCurrentTime(0);
        setDuration(0);
      })
      .catch(() => {
        if (!active) return;
        setMusicStatus('error');
      });

    return () => {
      active = false;
    };
  }, [calendarAuthorized, calendarEvents, calendarStatus]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [recommendation.audioUrl]);

  useEffect(() => {
    if (!isPlaying || !analyserRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);

    function tick() {
      analyser.getByteTimeDomainData(data);
      let energySum = 0;
      for (let cursor = 0; cursor < data.length; cursor += 1) {
        const centered = (data[cursor] - 128) / 128;
        energySum += centered * centered;
      }
      const energy = Math.sqrt(energySum / data.length);
      const phase = performance.now() * 0.006;
      const nextLevels = Array.from({ length: 96 }).map((_, index) => {
        const lowBand = Math.pow(Math.abs(Math.sin(index * 0.31 + phase)), 2.4);
        const highBand = Math.pow(Math.abs(Math.sin(index * 0.89 - phase * 1.5)), 3);
        const envelope = 0.55 + Math.min(0.45, energy * 2.2);
        return Math.max(0.08, Math.min(1, 0.08 + energy * 0.28 + (lowBand * 0.72 + highBand * 0.24) * envelope));
      });
      setWaveLevels(nextLevels);
      animationRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying]);

  return (
    <main className="app-shell">
      <section className="mini-app" aria-label="Musical 个人电台">
        <header className="studio-header">
          <div className="host">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="station-name">Musical</p>
            </div>
          </div>
        </header>

        <section className="dark-stage">
          <div className="stage-copy">
            <p>Playing...</p>
          </div>
          <WaveBars levels={waveLevels} offset={waveOffset} />
        </section>

        {calendarAuthorized ? (
          <section className="player-panel">
            <audio
              ref={audioRef}
              src={recommendation.audioUrl}
              preload="auto"
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onCanPlay={(event) => {
                event.currentTarget.volume = 1;
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => setIsPlaying(false)}
            />
            <div className="panel-handle" />
            {calendarStatus === 'loading' ? <p className="calendar-state">正在读取今天的飞书日程...</p> : null}
            {calendarStatus === 'error' ? <p className="calendar-state">暂时读取失败，先用默认节奏推荐。</p> : null}
            {musicStatus === 'loading' ? <p className="calendar-state">正在试听可播放曲库...</p> : null}
            {musicStatus === 'error' ? <p className="calendar-state">公开曲库暂时没连上，先播放本地 demo。</p> : null}
            <div className="now-playing">
              <div>
                <h1>{recommendation.song}</h1>
                <p className="artist">{recommendation.artist}</p>
              </div>
            </div>

            <div className="progress-row">
              <button className={isPlaying ? 'play-button playing' : 'play-button'} aria-label={isPlaying ? '暂停播放' : '播放'} onClick={togglePlayback}>
                <span />
              </button>
              <div
                className="progress-track"
                role="slider"
                aria-label="播放进度"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration || 0)}
                aria-valuenow={Math.round(currentTime || 0)}
                tabIndex={0}
                onPointerDown={seekToPointer}
                onKeyDown={(event) => {
                  const audio = audioRef.current;
                  if (!audio || !duration) return;
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  const delta = event.key === 'ArrowRight' ? 5 : -5;
                  const nextTime = Math.min(duration, Math.max(0, currentTime + delta));
                  audio.currentTime = nextTime;
                  setCurrentTime(nextTime);
                }}
              >
                <span style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              </div>
              <p>{formatTime(currentTime)} / {formatTime(duration)}</p>
            </div>

            <div className="schedule-card">
              <div>
                <p>飞书日程电台</p>
                <strong>{recommendation.headline}</strong>
                <span>{recommendation.reason}</span>
              </div>
            </div>

            <div className="tag-cloud">
              {recommendation.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <section className={recommendation.displayMode === 'poem' ? 'lyrics-card poem-card' : 'lyrics-card'} aria-label={recommendation.displayMode === 'poem' ? '日程小诗' : '歌词展示'}>
              {recommendation.displayMode === 'poem'
                ? recommendation.poem.map((line) => (
                  <p key={line} className="poem-line">
                    {line}
                  </p>
                ))
                : recommendation.lyrics.map((line, index) => (
                  <p
                    key={line.text}
                    className={index === lyricIndex ? 'lyric-line active' : 'lyric-line'}
                  >
                    {line.text}
                  </p>
                ))}
            </section>

            <footer className="mini-player">
              <time>{formatTime(currentTime)}</time>
              <WaveBars compact levels={waveLevels} offset={waveOffset} />
            </footer>
          </section>
        ) : (
          <section className="player-panel auth-panel">
            <div className="panel-handle" />
            <div className="auth-card">
              <p>首次使用</p>
              <h1>连接飞书</h1>
              <span>Musical 会读取今天的日程节奏，为你生成一首适合当下的放松歌曲。</span>
              <button className="auth-button" onClick={authorizeCalendar}>
                授权飞书日历
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
