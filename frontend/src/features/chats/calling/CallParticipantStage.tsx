import { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { getScreenShareBottomRailHeight, getScreenShareLayout, getScreenSharePresenterSize } from "./screenShareLayout";

type CallParticipantStageProps = HTMLAttributes<HTMLDivElement>;

/** Shared stage wrapper for DM/group calls, mobile calls, voice channels, and guest meetings. */
export const CallParticipantStage = forwardRef<HTMLDivElement, CallParticipantStageProps>(function CallParticipantStage(
  { className = "", ...props },
  ref,
) {
  return <div {...props} ref={ref} className={className} />;
});

export function useScreenShareStageSize(enabled: boolean, participantCount: number, isMobile: boolean, viewportHeight: number) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = (width: number, height: number) => {
      if (width && height) setSize((current) => current?.width === width && current.height === height ? current : { width, height });
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      updateSize(width, height);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);

  const layout = size ? getScreenShareLayout(size.width, size.height, participantCount) : null;
  const useBottomScreenShareRail = size ? isMobile || layout === "bottom" : false;
  const screenPresenterSize = size
    ? getScreenSharePresenterSize(Math.min(size.width, 1440), size.height, useBottomScreenShareRail ? "bottom" : "side", getScreenShareBottomRailHeight(viewportHeight))
    : null;

  return { stageRef, useBottomScreenShareRail, screenPresenterSize };
}
