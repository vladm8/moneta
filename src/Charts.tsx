import { useId, useState } from "react";
import { useFinance, CategoryDetails, Money } from "./ui";
import { summary, entriesFor } from "./engine";

const donutRadius = 124;
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
      }))
      .filter((c) => c.amount > 0),
    ...(stats.unallocated > 0
      ? [
          {
            id: "unallocated",
            name: t("Unallocated"),
            color: "var(--unallocated)",
            amount: stats.unallocated,
          },
        ]
      : []),
  ];
  const total = Math.max(stats.income, stats.allocated);
  const circ = 2 * Math.PI * donutRadius;
  let running = 0;
  const arcs = segments.map((segment) => {
    const length = total ? (segment.amount / total) * circ : 0;
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
        hover === segment.id ? 34 : 28,
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
          {arcs.map((s) => (
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
export function SpendingTrend() {
  const { ledger, month, fmt, t } = useFinance();
  const [day, setDay] = useState<number | null>(null);
  const [year, m] = month.split("-").map(Number);
  const days = new Date(year, m, 0).getDate();
  const entries = entriesFor(ledger, month).filter(
    (e) => e.type === "expense" || e.type === "refund",
  );
  let total = 0;
  const points = Array.from({ length: days }, (_, i) => {
    total += entries
      .filter((e) => Number(e.date.slice(8)) === i + 1)
      .reduce((s, e) => s + (e.type === "refund" ? -e.amount : e.amount), 0);
    return total;
  });
  const max = Math.max(10000, ...points) * 1.15;
  const x = (i: number) => 38 + (i / (days - 1)) * 640;
  const min = Math.min(0, ...points);
  const y = (v: number) => 200 - ((v - min) / (max - min)) * 170;
  const path = points
    .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`)
    .join(" ");
  return (
    <div className="trend-chart">
      <div className="trend-tooltip">
        {day !== null
          ? `${t("Day")} ${day + 1} · ${fmt(points[day])}`
          : fmt(total)}
      </div>
      <svg
        viewBox="0 0 710 245"
        role="img"
        aria-label={t("Cumulative expenses by day")}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity=".24" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line
              x1="38"
              y1={y(max * r)}
              x2="680"
              y2={y(max * r)}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <text x="0" y={y(max * r) - 7} fill="var(--muted)" fontSize="10">
              {Math.round((max * r) / 100)}
            </text>
          </g>
        ))}
        <path
          d={`${path} L678,${y(0)} L38,${y(0)} Z`}
          fill="url(#trend-fill)"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--green)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {points.map((v, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(v)}
              r={day === i ? 5 : 10}
              fill={day === i ? "var(--green)" : "transparent"}
              stroke={day === i ? "var(--surface)" : "none"}
              strokeWidth="3"
              tabIndex={0}
              aria-label={`${t("Day")} ${i + 1}: ${fmt(v)}`}
              onFocus={() => setDay(i)}
              onMouseEnter={() => setDay(i)}
              onMouseLeave={() => setDay(null)}
              onBlur={() => setDay(null)}
              onClick={() => setDay(i)}
            />
            {(i === 0 || i === days - 1 || i % 7 === 0) && (
              <text
                x={x(i)}
                y="230"
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="11"
              >
                {i + 1}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
