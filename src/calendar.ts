export type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  intensity: 'low' | 'medium' | 'high';
};

export type RadioRecommendation = {
  song: string;
  artist: string;
  audioUrl: string;
  source: string;
  headline: string;
  reason: string;
  tags: string[];
  displayMode: 'lyrics' | 'poem';
  lyrics: Array<{
    time: number;
    text: string;
  }>;
  poem: string[];
};

export type PlayableRecommendationPayload = {
  ok: boolean;
  recommendation?: RadioRecommendation;
  tracks?: Array<{
    song: string;
    artist: string;
    source: string;
    tags: string[];
  }>;
  error?: string;
};

export const mockTodayEvents: CalendarEvent[] = [
  { title: '产品评审', start: '10:00', end: '11:00', intensity: 'high' },
  { title: '需求同步', start: '14:00', end: '14:30', intensity: 'medium' },
  { title: '设计对齐', start: '16:00', end: '17:00', intensity: 'medium' },
  { title: '周会', start: '18:00', end: '18:30', intensity: 'medium' },
];

export function createRecommendation(events: CalendarEvent[]): RadioRecommendation {
  const weight = events.reduce((total, event) => {
    const score = event.intensity === 'high' ? 3 : event.intensity === 'medium' ? 2 : 1;
    return total + score;
  }, 0);

  if (weight >= 7) {
    return {
      song: 'Evening Wind',
      artist: 'Musical Demo',
      audioUrl: '/audio/evening-wind.wav',
      source: 'Local Demo',
      headline: '飞书渐静，给耳朵一阵晚风。',
      reason: '会议密了些，所以选一首轻声的 demo。',
      tags: ['会议后放松', '低刺激', '轻民谣'],
      displayMode: 'lyrics',
      lyrics: [
        { time: 0, text: '把屏幕的光调暗一点，' },
        { time: 7, text: '让风慢慢经过耳边。' },
        { time: 14, text: '今天的句号落下，' },
        { time: 21, text: '剩下的时间交给音乐。' },
      ],
      poem: [],
    };
  }

  return {
    song: 'Evening Wind',
    artist: 'Musical Demo',
    audioUrl: '/audio/evening-wind.wav',
    source: 'Local Demo',
    headline: '飞书留白，旋律慢慢靠近。',
    reason: '今天留有空隙，适合一首轻柔的停靠。',
    tags: ['轻声线', '慢节奏', '留白'],
    displayMode: 'lyrics',
    lyrics: [
      { time: 0, text: '还有一点安静，' },
      { time: 7, text: '刚好够一首歌停留。' },
      { time: 14, text: '让旋律靠近，' },
      { time: 21, text: '把今天放回心里。' },
    ],
    poem: [],
  };
}

export async function loadPlayableRecommendation(events: CalendarEvent[]): Promise<RadioRecommendation> {
  const response = await fetch('/api/music/recommendation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    throw new Error('无法读取可播放曲库');
  }

  const payload = (await response.json()) as PlayableRecommendationPayload;
  if (!payload.ok || !payload.recommendation) {
    throw new Error(payload.error || '无法读取可播放曲库');
  }

  return payload.recommendation;
}

export async function loadTodayCalendarEvents(): Promise<CalendarEvent[]> {
  const response = await fetch('/api/calendar/today');
  if (!response.ok) {
    throw new Error('无法读取飞书日历');
  }

  const payload = (await response.json()) as {
    ok: boolean;
    events?: CalendarEvent[];
    error?: string;
  };

  if (!payload.ok) {
    throw new Error(payload.error || '无法读取飞书日历');
  }

  return payload.events || [];
}
