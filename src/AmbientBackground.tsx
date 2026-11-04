import { useEffect, useRef } from "react";

/** Decorative media only; never connected to the financial state. */
export function AmbientBackground() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (reducedMotion.matches || document.hidden) {
        media.pause();
      } else {
        // Defer loading until motion is allowed. Autoplay denial leaves the poster.
        if (!media.getAttribute("src"))
          media.src = `${import.meta.env.BASE_URL}assets/moneta-ambient.mp4`;
        void media.play().catch(() => {});
      }
    };
    syncPlayback();
    reducedMotion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      media.pause();
      reducedMotion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }, []);

  return (
    <div className="ambient-background" aria-hidden="true">
      <video
        ref={video}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={`${import.meta.env.BASE_URL}assets/moneta-ambient-poster.jpg`}
        tabIndex={-1}
        disablePictureInPicture
      />
      <div className="ambient-veil" />
    </div>
  );
}
