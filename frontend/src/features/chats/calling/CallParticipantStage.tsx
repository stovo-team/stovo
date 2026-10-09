import { forwardRef, type HTMLAttributes } from "react";

type CallParticipantStageProps = HTMLAttributes<HTMLDivElement>;

/** Shared stage wrapper for DM/group calls, mobile calls, voice channels, and guest meetings. */
export const CallParticipantStage = forwardRef<HTMLDivElement, CallParticipantStageProps>(function CallParticipantStage(
  { className = "", ...props },
  ref,
) {
  return <div {...props} ref={ref} className={className} />;
});
