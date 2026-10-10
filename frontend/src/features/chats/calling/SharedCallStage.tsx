import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ForwardedRef, type HTMLAttributes, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALL_CONTROLS_REVEAL_EVENT } from "./SharedCallControlPanel";

type SharedCallStageProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  isSharing: boolean;
  isMobile?: boolean;
  cameraFit?: "fit" | "cover";
  onToggleParticipants?: (collapsed: boolean) => void;
};

function assignForwardedRef(ref: ForwardedRef<HTMLDivElement>, node: HTMLDivElement | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
}

/** Shared presentation frame. It only controls presentation chrome; call adapters own all streams. */
export const SharedCallStage = forwardRef<HTMLDivElement, SharedCallStageProps>(function SharedCallStage({
  children,
  className = "",
  isSharing,
  isMobile = false,
  cameraFit = "fit",
  onToggleParticipants,
  ...props
}, ref) {
  const contentId = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [presenterAnchor, setPresenterAnchor] = useState<{ left: number; top: number } | null>(null);
  const [participantsCollapsed, setParticipantsCollapsed] = useState(false);
  useEffect(() => {
    if (!isSharing) setParticipantsCollapsed(false);
  }, [isSharing]);
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    props.onPointerMove?.(event);
    if (!isMobile) window.dispatchEvent(new Event(CALL_CONTROLS_REVEAL_EVENT));
  };
  const toggleParticipants = () => {
    setParticipantsCollapsed((collapsed) => {
      return !collapsed;
    });
    onToggleParticipants?.(!participantsCollapsed);
  };
  const setStageRef = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    assignForwardedRef(ref, node);
  }, [ref]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!isSharing || !stage) {
      setPresenterAnchor(null);
      return;
    }
    const presenter = stage.querySelector<HTMLElement>(".call-grid__tile--screen, .guest-call-screen-tile");
    if (!presenter) {
      setPresenterAnchor(null);
      return;
    }
    const measure = () => {
      const stageBounds = stage.getBoundingClientRect();
      const presenterBounds = presenter.getBoundingClientRect();
      if (!stageBounds.width || !presenterBounds.width) return;
      const next = {
        left: presenterBounds.right - stageBounds.left,
        top: presenterBounds.top - stageBounds.top + presenterBounds.height / 2,
      };
      setPresenterAnchor((current) => current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    observer?.observe(presenter);
    const handleTransitionEnd = () => measure();
    stage.addEventListener("transitionend", handleTransitionEnd, true);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      stage.removeEventListener("transitionend", handleTransitionEnd, true);
      window.removeEventListener("resize", measure);
    };
  }, [isSharing, isMobile, participantsCollapsed, children]);

  return (
    <div
      {...props}
      ref={setStageRef}
      className={`shared-call-stage shared-call-stage-layout${className ? ` ${className}` : ""}`}
      data-sharing={isSharing ? "true" : "false"}
      data-participants-collapsed={participantsCollapsed ? "true" : "false"}
      data-mobile={isMobile ? "true" : "false"}
      data-camera-fit={cameraFit}
      onPointerMove={handlePointerMove}
    >
      {isSharing && (
        <button
          type="button"
          className="shared-call-participants-toggle"
          aria-label={participantsCollapsed ? "Show participants" : "Hide participants"}
          aria-controls={contentId}
          aria-expanded={!participantsCollapsed}
          title={participantsCollapsed ? "Show participants" : "Hide participants"}
          style={presenterAnchor ? { left: `${presenterAnchor.left}px`, top: `${presenterAnchor.top}px`, right: "auto", transform: "translate(-50%, -50%)" } : undefined}
          onClick={toggleParticipants}
        >
          {participantsCollapsed ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
        </button>
      )}
      <div className="shared-call-stage-content" id={contentId}>{children}</div>
    </div>
  );
});
