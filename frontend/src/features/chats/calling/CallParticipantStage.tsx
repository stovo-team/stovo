import type { HTMLAttributes } from "react";

type CallParticipantStageProps = HTMLAttributes<HTMLDivElement>;

/** Shared stage wrapper for DM/group calls, mobile calls, voice channels, and guest meetings. */
export function CallParticipantStage({ className = "", ...props }: CallParticipantStageProps) {
  return <div {...props} className={className} />;
}
