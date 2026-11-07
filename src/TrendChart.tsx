import { useEffect, useId, useRef, useState } from "react";
import { Money, useFinance } from "./ui";
import { locale, today } from "./engine";
import { nearestTrendIndex, trendSeries, trendWindow } from "./trend";
import { NavGlider } from "./motion";

export function SpendingTrendCard() {
  const { ledger, month, fmt, t, data } = useFinance();
  const [span, setSpan] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(710);
  const plot = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{
    x: number;
    y: number;
    previous: number | null;
  } | null>(null);
  const gradient = useId();
  const [year, m] = month.split("-").map(Number);
  const days = new Date(year, m, 0).getDate();
  const currentDay =
    month === today().slice(0, 7) ? Number(today().slice(8)) : days;
  const { start, end } = trendWindow(days, span, currentDay);
  const { daily, cumulative } = trendSeries(ledger.entries, month, start, end);
  const selected =
    active === null ? null : Math.min(active, cumulative.length - 1);
  const compact = width < 520;
  const height = compact
    ? Math.round(Math.max(190, Math.min(240, width * 0.68)))
    : 360;
  const left = compact ? 48 : 58,
    right = width - (compact ? 12 : 18),
    top = compact ? 14 : 18,
    bottom = height - (compact ? 30 : 36);
  const rawMin = Math.min(0, ...cumulative),
    rawMax = Math.max(0, ...cumulative);
  const padding = Math.max(100, (rawMax - rawMin) * 0.12);
  const min = rawMin < 0 ? rawMin - padding : 0;
  const max = Math.max(100, rawMax + padding);
  const x = (i: number) =>
    left + (i / Math.max(1, cumulative.length - 1)) * (right - left);
  const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const path = cumulative
    .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`)
    .join(" ");
  const dateLabel = (day: number) =>
    new Date(
      `${month}-${String(day).padStart(2, "0")}T12:00:00`,
    ).toLocaleDateString(locale(data.language), {
      day: "numeric",
      month: "long",
    });
  const shortDateLabel = (day: number) =>
    new Date(
      `${month}-${String(day).padStart(2, "0")}T12:00:00`,
    ).toLocaleDateString(locale(data.language), {
      day: "numeric",
      month: "short",
    });
  const compactRange = `${start} - ${end} ${new Date(`${month}-01T12:00:00`).toLocaleDateString(locale(data.language), { month: "short", year: "numeric" })}`;
  const ticks = [
    ...new Set([
      0,
      Math.round((cumulative.length - 1) / 3),
      Math.round(((cumulative.length - 1) * 2) / 3),
      cumulative.length - 1,
    ]),
  ];

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width)),
    );
    if (plot.current) observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setActive(null);
  }, [month]);

  function changeRange(next: number) {
    setSpan(next);
    setActive(null);
  }
  return (
    <section className="panel spending-trend-card">
      <div className="trend-card-heading">
        <div>
          <h2>{t("Monthly spending")}</h2>
          <p className="trend-label-desktop">
            {t("Cumulative expenses by day")}
          </p>
          <p className="trend-label-mobile">{t("Cumulative spending")}</p>
        </div>
        <span className="trend-date-range">
          <span className="trend-label-desktop">
            {dateLabel(start)} - {dateLabel(end)}
          </span>
          <span className="trend-label-mobile">{compactRange}</span>
        </span>
      </div>
      <div className="trend-controls">
        <div
          className="trend-ranges"
          role="group"
          aria-label={t("Chart range")}
        >
          <NavGlider active={String(span)} />
          {[
            [0, "Month", "Month"],
            [7, "1 week", "7 days"],
            [14, "2 weeks", "14 days"],
            [21, "3 weeks", "21 days"],
          ].map(([value, label, shortLabel]) => (
            <button
              key={value}
              className={span === value ? "active" : ""}
              aria-pressed={span === value}
              aria-label={t(String(label))}
              onClick={() => changeRange(Number(value))}
            >
              <span className="trend-label-desktop">{t(String(label))}</span>
              <span className="trend-label-mobile">
                {t(String(shortLabel))}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="trend-readout">
        <strong>
          <Money value={selected === null
              ? cumulative[cumulative.length - 1]
              : cumulative[selected]} />
        </strong>
        <span className="trend-selection-detail">
          {selected === null ? (
            t("Total in selected range")
          ) : (
            <>
              <span className="trend-label-desktop">
                {dateLabel(start + selected)}
              </span>
              <span className="trend-label-mobile">
                {shortDateLabel(start + selected)}
              </span>
              {` · ${t("That day")}: ${fmt(daily[selected])}`}
            </>
          )}
        </span>
      </div>
      <div ref={plot} className="trend-chart trend-interactive">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ height }}
          role="slider"
          tabIndex={0}
          aria-label={t("Cumulative expenses by day")}
          aria-valuemin={start}
          aria-valuemax={end}
          aria-valuenow={start + (selected ?? 0)}
          aria-valuetext={`${dateLabel(start + (selected ?? 0))}: ${fmt(cumulative[selected ?? 0])}`}
          onFocus={() => setActive((i) => i ?? 0)}
          onBlur={() => setActive(null)}
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse") {
              const origin = touchStart.current;
              if (!origin) return;
              if (
                Math.abs(event.clientY - origin.y) > 8 &&
                Math.abs(event.clientY - origin.y) >
                  Math.abs(event.clientX - origin.x)
              ) {
                setActive(origin.previous);
                return;
              }
            }
            const svg = event.currentTarget,
              matrix = svg.getScreenCTM();
            if (!matrix) return;
            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            setActive(
              nearestTrendIndex(
                point.matrixTransform(matrix.inverse()).x,
                left,
                right,
                cumulative.length,
              ),
            );
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse")
              event.currentTarget.focus({ preventScroll: true });
            else {
              // Keep touch exploration from focusing/scrolling the SVG like a form field.
              event.preventDefault();
              touchStart.current = {
                x: event.clientX,
                y: event.clientY,
                previous: active,
              };
            }
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const point = event.currentTarget.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            setActive(
              nearestTrendIndex(
                point.matrixTransform(matrix.inverse()).x,
                left,
                right,
                cumulative.length,
              ),
            );
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActive(null);
          }}
          onPointerUp={() => {
            touchStart.current = null;
          }}
          onPointerCancel={() => {
            if (touchStart.current) setActive(touchStart.current.previous);
            touchStart.current = null;
          }}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            if (event.key === "Escape") {
              setActive(null);
              return;
            }
            setActive(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? cumulative.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        cumulative.length - 1,
                        (selected ?? 0) + (event.key === "ArrowRight" ? 1 : -1),
                      ),
                    ),
            );
          }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity=".24" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g pointerEvents="none">
            {[min, (min + max) / 2, max].map((v) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <text
                  x={left - 10}
                  y={y(v) + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {new Intl.NumberFormat(locale(data.language), {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v / 100)}
                </text>
              </g>
            ))}
            <path
              className="trend-area-reveal"
              key={`area-${month}-${span}`}
              d={`${path} L${right},${y(0)} L${left},${y(0)} Z`}
              fill={`url(#${gradient})`}
            />
            <path
              className="trend-line-reveal"
              key={`line-${month}-${span}`}
              pathLength={1}
              d={path}
              fill="none"
              stroke="var(--green)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {ticks.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 10}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="12"
              >
                {start + i}
              </text>
            ))}
            {selected !== null && (
              <g className="trend-cursor">
                <line
                  x1={x(selected)}
                  x2={x(selected)}
                  y1={top}
                  y2={bottom}
                  stroke="var(--green)"
                  strokeOpacity=".5"
                  strokeDasharray="4 4"
                />
                <circle
                  className="trend-cursor-dot"
                  cx={x(selected)}
                  cy={y(cumulative[selected])}
                  r="5"
                  fill="var(--green)"
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              </g>
            )}
          </g>
        </svg>
      </div>
      <p className="trend-help trend-label-desktop">
        {t(
          "Move across the chart, tap, or use the arrow keys to select a day.",
        )}
      </p>
      <p className="trend-help trend-label-mobile">
        {t("Touch or slide to check a day.")}
      </p>
    </section>
  );
}
