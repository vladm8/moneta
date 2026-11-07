import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Info, TriangleAlert, X } from "lucide-react";

export type ToastOptions = { duration?: number; variant?: "success" | "error" | "info" };
export function Notification({
  message,
  undo,
  onClose,
  closeLabel,
  undoLabel,
  duration,
  variant = "success",
}: {
  message: string;
  undo?: () => void;
  onClose: () => void;
  closeLabel: string;
  undoLabel: string;
  duration: number;
  variant?: ToastOptions["variant"];
}) {
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (paused || closing) return;
    const timer = setTimeout(() => setClosing(true), duration);
    return () => clearTimeout(timer);
  }, [duration, paused, closing]);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => close.current(), 320);
    return () => clearTimeout(timer);
  }, [closing]);
  return createPortal(
    <div className="notification-position">
      <div
        className={`app-notification liquid-glass notification-${variant} ${closing ? "is-leaving" : ""}`}
        role={variant === "error" ? "alert" : "status"}
        aria-atomic="true"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
        }}
      >
        <span className="notification-icon">
          {variant === "error" ? <TriangleAlert size={16} /> : variant === "info" ? <Info size={16} /> : <Check size={16} strokeWidth={2.5} />}
        </span>
        <span className="notification-message">{message}</span>
        {undo && (
          <button
            className="notification-undo"
            onClick={() => {
              undo();
              setClosing(true);
            }}
          >
            {undoLabel}
          </button>
        )}
        <button
          className="notification-close"
          aria-label={closeLabel}
          onClick={() => setClosing(true)}
        >
          <X size={15} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
