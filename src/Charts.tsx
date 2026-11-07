import { useEffect, useId, useRef, useState } from "react";
import { motionAllowed } from "./motion";
import { useFinance, CategoryDetails, Money } from "./ui";
import { summary } from "./engine";

const donutRadius = 124;
// Interpolate shares, not SVG path commands: arc flags cannot be morphed safely.
function useDonutShares(target: Record<string, number>) {
  const signature = JSON.stringify(target);
  const [shares, setShares] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const next: Record<string, number> = JSON.parse(signature);
    if (!motionAllowed()) { current.current = next; setShares(next); return; }
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const blend = 1 - Math.exp(-Math.min(now - previous, 64) / 55);
      previous = now;
      let pending = false;
      const value: Record<string, number> = {};
      for (const id of new Set([...Object.keys(current.current), ...Object.keys(next)])) {
        const from = current.current[id] || 0, to = next[id] || 0;
        const difference = to - from;
        value[id] = Math.abs(difference) < 0.0001 ? to : from + difference * blend;
        pending ||= value[id] !== to;
      }
      if (!motionAllowed()) { current.current = next; setShares(next); return; }
      current.current = value;
      setShares(value);
      if (pending) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature]);
  return shares;
}
function segmentPath(start: number, end: number, width: number) {
  const inner = donutRadius - width / 2;
  const outer = donutRadius + width / 2;
  const corner = Math.min(3, ((end - start) * inner) / 4);
  const innerInset = corner / inner;
  const outerInset = corner / outer;

  const point = (radius: number, angle: number) =>
    `${160 + radius * Math.cos(angle)} ${160 + radius * Math.sin(angle)}`;
  return [
    `M ${point(outer, start + outerInset)}`,
    `A ${outer} ${outer} 0 ${end - start - 2 * outerInset > Math.PI ? 1 : 0} 1 ${point(outer, end - outerInset)}`,
    `Q ${point(outer, end)} ${point(outer - corner, end)}`,
    `L ${point(inner + corner, end)}`,
    `Q ${point(inner, end)} ${point(inner, end - innerInset)}`,
    `A ${inner} ${inner} 0 ${end - start - 2 * innerInset > Math.PI ? 1 : 0} 0 ${point(inner, start + innerInset)}`,
    `Q ${point(inner, start)} ${point(inner + corner, start)}`,
    `L ${point(outer - corner, start)}`,
    `Q ${point(outer, start)} ${point(outer, start + outerInset)} Z`,
  ].join(" ");
}
export function Donut({
  plan,
  compact = false,
}: {
  plan?: Record<string, number>;
  compact?: boolean;
}) {
  const { ledger, month, t, fmt, modal } = useFinance();
  const values = plan || ledger.plans[month] || {};
  const stats = summary(ledger, month, values);
  const [hover, setHover] = useState<string | null>(null);
  const [metric, setMetric] = useState("income");
  const gradientId = useId();
  const segments = [
    ...ledger.categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        amount: values[c.id] || 0,
      })),
    {
      id: "unallocated",
      name: t("Unallocated"),
      color: "var(--unallocated)",
      amount: Math.max(0, stats.unallocated),
    },
  ];
  const total = Math.max(stats.income, stats.allocated);
  const shares = useDonutShares(Object.fromEntries(segments.map(s => [s.id, total ? s.amount / total : 0])));
  const circ = 2 * Math.PI * donutRadius;
  let running = 0;
  const arcs = segments.filter(s => (shares[s.id] || 0) > 0).map((segment) => {
    const length = (shares[segment.id] || 0) * circ;
    const gap = Math.min(7, length * 0.18);
    const start = (running + gap / 2) / donutRadius - Math.PI / 2;
    running += length;
    return {
      ...segment,
      displayColor:
        segment.id === "unallocated"
          ? segment.color
          : `oklch(from ${segment.color} clamp(0.58, l, 0.73) clamp(0.13, c * 1.45, 0.23) h)`,
      path: segmentPath(
        start,
        start + (length - gap) / donutRadius,
        28,
      ),
    };
  });
  const selected = segments.find((s) => s.id === hover);
  const metrics: Record<string, { name: string; value: number }> = {
    income: { name: "Monthly income", value: stats.income },
    allocated: { name: "Allocated", value: stats.allocated },
    unallocated: { name: "Unallocated", value: stats.unallocated },
    available: { name: "Available money", value: stats.available },
  };
  return (
    <div className={`donut-section ${compact ? "donut-compact" : ""}`}>
      <div className="donut-wrap">
        <svg
          viewBox="0 0 320 320"
          className="donut"
          aria-label={t("Allocation")}
          role="group"
        >
          <defs>
            {arcs.map((segment, index) => (
              <linearGradient
                key={segment.id}
                id={`${gradientId}-${index}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  stopColor={`color-mix(in oklch, ${segment.displayColor}, white 8%)`}
                />
                <stop
                  offset="100%"
                  stopColor={`color-mix(in oklch, ${segment.displayColor}, #101426 22%)`}
                />
              </linearGradient>
            ))}
          </defs>
          <circle
            cx="160"
            cy="160"
            r="124"
            stroke="var(--unallocated)"
            strokeWidth="28"
            fill="none"
          />
          {arcs.map((s, index) => (
            <path
              key={s.id}
              d={s.path}
              fill={`url(#${gradientId}-${index}) ${s.color}`}
              opacity={hover && hover !== s.id ? 0.38 : 1}
              className="donut-segment"
              tabIndex={0}
              role="button"
              aria-label={`${s.name}: ${fmt(s.amount)}, ${stats.income ? ((s.amount / stats.income) * 100).toFixed(1) : 0}%`}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover(null)}
              onClick={() => {
                if (s.id !== "unallocated")
                  modal(<CategoryDetails id={s.id} />);
                else setMetric("unallocated");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (s.id !== "unallocated")
                    modal(<CategoryDetails id={s.id} />);
                  else setMetric("unallocated");
                }
              }}
            />
          ))}
        </svg>
        <div className="donut-center">
          <span className="donut-center-label">
            {selected?.name || t(metrics[metric].name)}
          </span>
          <strong>
            <Money
              value={selected?.amount ?? metrics[metric].value}
              decimals={!!selected}
            />
          </strong>
          <span className="donut-center-note">
            {selected
              ? `${stats.income ? ((selected.amount / stats.income) * 100).toFixed(1) : 0}% ${t("of income")}`
              : t(
                  stats.unallocated === 0 && stats.income
                    ? "Your plan is balanced"
                    : "Your money. Your peace of mind.",
                )}
          </span>
        </div>
      </div>
      <select
        className="metric-selector"
        aria-label={t("Select")}
        value={metric}
        onChange={(e) => setMetric(e.target.value)}
      >
        {Object.entries(metrics).map(([id, m]) => (
          <option key={id} value={id}>
            {t(m.name)}
          </option>
        ))}
      </select>
      {!compact && (
        <div className="chart-legend">
          {arcs.filter(s => s.amount > 0).map((s) => (
            <button
              key={s.id}
              className={hover === s.id ? "highlighted" : ""}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover(null)}
              onClick={() =>
                s.id !== "unallocated"
                  ? modal(<CategoryDetails id={s.id} />)
                  : setMetric("unallocated")
              }
            >
              <span className="dot" style={{ background: s.displayColor }} />
              {s.name}
              <span>
                {stats.income ? Math.round((s.amount / stats.income) * 100) : 0}
                %
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
