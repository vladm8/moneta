import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

export const motionAllowed = () =>
  !matchMedia("(prefers-reduced-motion: reduce)").matches;
const easing = "cubic-bezier(.22,.8,.25,1)";
let navigationTransition: { skipTransition: () => void } | undefined;
let navigationSequence = 0;

// Only navigation is captured. Financial updates always commit immediately.
export function navigateWithMotion(update: () => void, animate = true) {
  const sequence = ++navigationSequence;
  navigationTransition?.skipTransition();
  if (!animate || !motionAllowed() || !document.startViewTransition) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => {
    if (sequence === navigationSequence) flushSync(update);
  });
  navigationTransition = transition;
  // Skipping a superseded visual transition rejects ready, but navigation still commits.
  void transition.ready.catch(() => {});
}

export function NavGlider({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<{
    transform: string;
    width: string;
    height: string;
  } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current,
      nav = el?.parentElement;
    if (!el || !nav) return;
    function position() {
      const selected = nav!.querySelector<HTMLElement>(
        '[aria-current="page"], [aria-pressed="true"]',
      );
      if (!selected || !selected.offsetWidth) {
        el!.style.opacity = "0";
        previous.current = null;
        return;
      }
      const next = {
        transform: `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`,
        width: `${selected.offsetWidth}px`,
        height: `${selected.offsetHeight}px`,
      };
      if (
        previous.current &&
        Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous.current![key as keyof typeof next],
        )
      )
        return;
      el!.getAnimations().forEach((animation) => animation.cancel());
      Object.assign(el!.style, next, { opacity: "1" });
      if (previous.current && motionAllowed())
        el!.animate([previous.current, next], { duration: 390, easing });
      previous.current = next;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      el.getAnimations().forEach((a) => a.cancel());
    };
  }, [active]);
  return <span ref={ref} className="nav-glider" aria-hidden="true" />;
}

// The real value is visible from the first frame; no synthetic intermediate balances.
export function useValueMotion<T extends HTMLElement>(
  ref: RefObject<T | null>,
  value: string | number,
) {
  const previous = useRef(value);
  useLayoutEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (!changed || !motionAllowed() || !ref.current) return;
    const animation = ref.current.animate(
      [
        { transform: "translateY(3px)", opacity: 0.68 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 260, easing },
    );
    return () => animation.cancel();
  }, [value, ref]);
}

// FLIP only visible rows and cap animation work, even for large imported histories.
export function useListMotion(
  ref: RefObject<HTMLDivElement | null>,
  signature: string,
) {
  const positions = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    if (!motionAllowed()) {
      positions.current.clear();
      return;
    }
    const next = new Map<string, DOMRect>();
    const candidates: { row: HTMLElement; rect: DOMRect; old?: DOMRect }[] = [];
    for (const row of Array.from(
      ref.current?.children || [],
    ) as HTMLElement[]) {
      const id = row.dataset.motionId;
      if (!id) continue;
      const rect = row.getBoundingClientRect();
      next.set(id, rect);
      if (rect.bottom > 0 && rect.top < innerHeight && candidates.length < 16)
        candidates.push({ row, rect, old: positions.current.get(id) });
    }
    const animations: Animation[] = [];
    if (motionAllowed())
      candidates.forEach(({ row, rect, old }, i) => {
        const dy = old ? old.top - rect.top : 7;
        if (old && Math.abs(dy) < 1) return;
        animations.push(
          row.animate(
            [
              {
                transform: `translateY(${Math.max(-120, Math.min(120, dy))}px)`,
                opacity: old ? 1 : 0.4,
              },
              { transform: "translateY(0)", opacity: 1 },
            ],
            { duration: 300, delay: old ? 0 : Math.min(i * 18, 90), easing },
          ),
        );
      });
    positions.current = next;
    return () => animations.forEach((a) => a.cancel());
  }, [signature, ref]);
}

export function useInteractionLight() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0,
      target: HTMLElement | null = null,
      x = 0,
      y = 0;
    const clear = () => {
      target?.classList.remove("motion-lit");
      target = null;
    };
    const move = (event: PointerEvent) => {
      if (preference.matches || !fine.matches || event.pointerType !== "mouse")
        return;
      const candidate = (event.target as Element).closest<HTMLElement>(
        '.page-content:not([data-page="banks"]) .dashboard-primary, .page-content:not([data-page="banks"]) .metric-block, .page-content:not([data-page="banks"]) .goal-card, .page-content:not([data-page="banks"]) .allocation-panel, .add-transaction',
      );
      if (candidate !== target) {
        clear();
        target = candidate;
      }
      if (!target) return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--light-x", `${x - rect.left}px`);
        target.style.setProperty("--light-y", `${y - rect.top}px`);
        target.classList.add("motion-lit");
      });
    };
    const reduce = () => {
      clear();
      if (preference.matches) {
        navigationTransition?.skipTransition();
        document.getAnimations().forEach((a) => a.cancel());
      }
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    preference.addEventListener("change", reduce);
    return () => {
      cancelAnimationFrame(frame);
      clear();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      preference.removeEventListener("change", reduce);
    };
  }, []);
}
