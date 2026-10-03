// Remotion port of videos/usd-rate (same script, data and soundtrack) to compare with the video-maker version.
import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

export const FPS = 30;
export const DURATION = 24;

const C = {
  bg: '#0f1216', ink: '#f3f5f7', muted: '#9aa3ad', card: '#1a1f26', line: '#2a313a',
  accent: '#3fb6ff', up: '#ff6b5e', good: '#2bd99f',
};
const FONT = '"Liberation Sans", "DejaVu Sans", system-ui, sans-serif';
const OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Official NBU USD rate, year-end; 2026 = 2 Oct.
const DATA: [number, number][] = [
  [2013, 7.99], [2014, 15.77], [2015, 24.0], [2016, 27.19], [2017, 28.07], [2018, 27.69], [2019, 23.69],
  [2020, 28.27], [2021, 27.28], [2022, 36.57], [2023, 37.98], [2024, 42.04], [2025, 42.1], [2026, 44.83],
];

const s = (sec: number) => Math.round(sec * FPS);

// Enter with a blur-focus, hold, exit faster than it came in. Times are seconds, relative to the Sequence.
const Reveal: React.FC<{ at?: number; out?: number; dy?: number; blur?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at = 0, out, dy = 60, blur = 8, style, children,
}) => {
  const f = useCurrentFrame();
  const inK = interpolate(f, [s(at), s(at + 0.5)], [0, 1], { easing: OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outK = out === undefined ? 0 : interpolate(f, [s(out - 0.35), s(out)], [0, 1], { easing: OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const k = inK * (1 - outK);
  return (
    <div style={{
      opacity: k,
      transform: `translateY(${(1 - k) * dy}px) scale(${0.96 + 0.04 * k})`,
      filter: blur ? `blur(${(1 - k) * blur}px)` : undefined,
      ...style,
    }}>{children}</div>
  );
};

const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '200px 90px 380px', textAlign: 'center', flexDirection: 'column' }}>
    {children}
  </AbsoluteFill>
);

const Step: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 40, fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>{children}</div>
);
const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 92, lineHeight: 1.06, fontWeight: 700, letterSpacing: '-0.015em' }}>{children}</div>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 50, color: C.muted, marginTop: 40, lineHeight: 1.3 }}>{children}</div>
);
const card: React.CSSProperties = { background: C.card, border: `2px solid ${C.line}`, borderRadius: 36 };

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - s(0.8), fps, config: { damping: 12, stiffness: 140 } });
  return (
    <Scene>
      <Reveal at={0} out={2.9} dy={30} blur={0}>
        <div style={{ fontSize: 40, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Курс долара</div>
      </Reveal>
      <Reveal at={0.1} out={2.9}>
        <div style={{ fontSize: 100, lineHeight: 1.06, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 28 }}>У 2013 році<br />долар коштував</div>
      </Reveal>
      <Reveal at={0.8} out={2.9} dy={0} blur={8}>
        <div style={{ fontSize: 260, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', marginTop: 40, color: C.accent, transform: `scale(${0.92 + 0.08 * pop})` }}>
          8<span style={{ fontSize: 120 }}> ₴</span>
        </div>
      </Reveal>
    </Scene>
  );
};

const Chart: React.FC = () => {
  const f = useCurrentFrame();
  const W = 900, H = 540, PAD = 24, MAX = 48;
  const pts = DATA.map(([, v], i) => [PAD + (i * (W - 2 * PAD)) / (DATA.length - 1), H - (v / MAX) * (H - 40)]);
  // Draw from 0.4s to 4.0s of this scene.
  const k = interpolate(f, [s(0.4), s(4.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pos = k * (DATA.length - 1);
  const i = Math.min(DATA.length - 2, Math.floor(pos));
  const r = pos - i;
  const value = DATA[i][1] + (DATA[i + 1][1] - DATA[i][1]) * r;
  const dot = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
  const drawn = [...pts.slice(0, i + 1), dot];
  const year = k >= 1 ? '2 жовтня 2026' : String(DATA[Math.round(pos)][0]);
  return (
    <Scene>
      <Reveal at={0} out={5.3} dy={40} blur={0}>
        <div style={{ fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: C.up }}>
          {value.toFixed(2).replace('.', ',')}<span style={{ fontSize: 90 }}> ₴</span>
        </div>
      </Reveal>
      <Reveal at={0.1} out={5.3} dy={30} blur={0}>
        <div style={{ fontSize: 56, fontWeight: 700, color: C.muted, marginTop: 10 }}>{year}</div>
      </Reveal>
      <Reveal at={0.2} out={5.3} dy={30} blur={0}>
        <svg width={900} height={560} viewBox="0 0 900 560" style={{ marginTop: 30 }}>
          <line x1={0} y1={540} x2={900} y2={540} stroke={C.line} strokeWidth={3} />
          <polyline points={drawn.map((p) => p.join(',')).join(' ')} fill="none" stroke={C.up} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={dot[0]} cy={dot[1]} r={18} fill={C.up} />
        </svg>
      </Reveal>
    </Scene>
  );
};

const Compare: React.FC = () => (
  <Scene>
    <Reveal at={0} out={4.1}><Title>1000 ₴ — це</Title></Reveal>
    <Reveal at={0.5} out={4.1} dy={70} blur={0}>
      <div style={{ display: 'flex', gap: 24, width: 900, marginTop: 56 }}>
        {[['2013', '$125', C.good], ['2026', '$22', C.up]].map(([y, v, col]) => (
          <div key={y} style={{ ...card, flex: 1, padding: '44px 24px' }}>
            <div style={{ fontSize: 44, color: C.muted, fontWeight: 700 }}>{y}</div>
            <div style={{ fontSize: 120, fontWeight: 700, marginTop: 16, letterSpacing: '-0.03em', color: col }}>{v}</div>
          </div>
        ))}
      </div>
    </Reveal>
    <Reveal at={2.0} out={4.1} dy={30} blur={0}>
      <Note>Гривня втратила <b style={{ color: C.ink }}>понад 80%</b><br />до долара</Note>
    </Reveal>
  </Scene>
);

const Forecast: React.FC = () => (
  <Scene>
    <Reveal at={0} out={3.7} dy={30} blur={0}><Step>Прогноз на жовтень</Step></Reveal>
    <Reveal at={0.1} out={3.7}><Title>Аналітики чекають</Title></Reveal>
    <Reveal at={0.7} out={3.7} dy={0} blur={6}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginTop: 50, fontSize: 140, fontWeight: 700, letterSpacing: '-0.03em' }}>
        <span>44,6</span><span style={{ color: C.muted, fontSize: 100 }}>–</span><span style={{ color: C.up }}>45,4</span>
      </div>
    </Reveal>
    <Reveal at={1.9} out={3.7} dy={30} blur={0}>
      <Note>Без обвалу, але <b style={{ color: C.ink }}>повільно вгору</b></Note>
    </Reveal>
  </Scene>
);

const Tips: React.FC = () => {
  const items = ['Не все в одній валюті', 'Гривні — в ОВДП чи депозит', 'Не купуй валюту на паніці'];
  return (
    <Scene>
      <Reveal at={0} out={4.6} dy={30} blur={0}><Step>Що робити</Step></Reveal>
      <Reveal at={0.1} out={4.6}><Title>Захисти <span style={{ color: C.accent }}>гроші</span></Title></Reveal>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: 900, textAlign: 'left', marginTop: 48 }}>
        {items.map((t, n) => (
          <Reveal key={t} at={0.9 + n * 0.7} out={4.6} dy={0} blur={0} style={{}}>
            <div style={{ ...card, borderRadius: 28, padding: '32px 40px', fontSize: 50, fontWeight: 700, display: 'flex', gap: 28, alignItems: 'center' }}>
              <span style={{ flex: 'none', width: 64, height: 64, borderRadius: '50%', background: C.accent, color: C.bg, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n + 1}</span>
              {t}
            </div>
          </Reveal>
        ))}
      </div>
    </Scene>
  );
};

const Cta: React.FC = () => (
  <Scene>
    <Reveal at={0} blur={6} dy={0}>
      <div style={{ fontSize: 100, fontWeight: 700, lineHeight: 1.05 }}>
        Підпишись —<br />курс <span style={{ color: C.accent }}>без паніки</span>
        <div style={{ marginTop: 40, fontSize: 44, fontWeight: 400, color: C.muted }}>щотижня, коротко й по цифрах</div>
      </div>
    </Reveal>
  </Scene>
);

export const UsdRate: React.FC = () => {
  const f = useCurrentFrame();
  const glow = interpolate(f, [0, s(3)], [0.9, 1.05], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.ink, fontFamily: FONT }}>
      <Audio src={staticFile('sound.wav')} />
      <div style={{
        position: 'absolute', width: 1000, height: 1000, left: 40, top: 380, borderRadius: '50%', transform: `scale(${glow})`,
        background: 'radial-gradient(circle, rgba(63,182,255,0.16), transparent 65%)',
      }} />
      <Sequence from={0} durationInFrames={s(3)}><Hook /></Sequence>
      <Sequence from={s(3)} durationInFrames={s(5.4)}><Chart /></Sequence>
      <Sequence from={s(8.4)} durationInFrames={s(4.2)}><Compare /></Sequence>
      <Sequence from={s(12.6)} durationInFrames={s(3.8)}><Forecast /></Sequence>
      <Sequence from={s(16.4)} durationInFrames={s(4.6)}><Tips /></Sequence>
      <Sequence from={s(21)}><Cta /></Sequence>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 400, textAlign: 'center', fontSize: 30, color: C.muted }}>
        Офіційний курс НБУ на кінець року · не фінансова порада
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 10, width: '100%', background: C.accent, transformOrigin: 'left', transform: `scaleX(${f / (DURATION * FPS)})` }} />
    </AbsoluteFill>
  );
};
