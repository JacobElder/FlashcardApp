import { useState } from 'react';

export interface SkillPoint {
  step: number;
  ability: number;
  date: string;
}

interface SkillChartProps {
  data: SkillPoint[];
  /** Ability range shown on the y axis. */
  min?: number;
  max?: number;
}

// viewBox units; the SVG scales to its container's width
const W = 320;
const H = 200;
const PAD = { top: 10, right: 10, bottom: 22, left: 26 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Line chart of skill level over answers: a lightweight inline SVG. */
export function SkillChart({ data, min = -4, max = 4 }: SkillChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return null;

  const x = (i: number) => PAD.left + (data.length === 1 ? PLOT_W / 2 : (i / (data.length - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + ((max - Math.min(max, Math.max(min, v))) / (max - min)) * PLOT_H;
  const yTicks = [];
  for (let v = min; v <= max; v += 2) yTicks.push(v);
  const xTicks = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.ability).toFixed(1)}`).join(' ');

  const first = data[0];
  const last = data[data.length - 1];
  const label = `Skill level over ${data.length} answers, from ${first.ability} to ${last.ability}.`;

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (vbX - PAD.left) / PLOT_W;
    setHover(Math.round(Math.min(1, Math.max(0, frac)) * (data.length - 1)));
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none select-none"
        role="img"
        aria-label={label}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
              stroke={v === 0 ? '#475569' : '#334155'}
              strokeDasharray={v === 0 ? undefined : '3 3'}
            />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
          </g>
        ))}
        {xTicks.map(i => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{data[i].step}</text>
        ))}
        <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.length === 1 && <circle cx={x(0)} cy={y(first.ability)} r={4} fill="#3b82f6" />}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#64748b" />
            <circle cx={x(hover)} cy={y(h.ability)} r={5} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 shadow"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <div className="text-slate-400">Answer {h.step} · {h.date}</div>
          <div>Skill level {h.ability}</div>
        </div>
      )}
    </div>
  );
}
