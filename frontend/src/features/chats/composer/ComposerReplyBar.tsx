import { Reply, X } from "lucide-react";

import { ComposerContextThumb } from "../conversation/MessageAttachmentThumbs";
import { firstImageAttachment, messageActionSummary } from "../shared/messagePresentation";
import type { Message } from "../shared/types";

type ComposerReplyBarProps = {
  accessToken: string | null;
  replyTarget: Message;
  onCancel: () => void;
};

export function ComposerReplyBar({ accessToken, replyTarget, onCancel }: ComposerReplyBarProps) {
  return (
    <div className={`reply-composer-preview${firstImageAttachment(replyTarget) ? "" : " reply-composer-preview--no-thumb"}`}>
      <Reply className="reply-composer-icon" aria-hidden="true" size={16} />
      <span className="reply-composer-bar" aria-hidden="true" />
      <ComposerContextThumb accessToken={accessToken} file={firstImageAttachment(replyTarget)} />
      <div className="reply-composer-copy">
        <span className="reply-composer-who">Reply to {replyTarget.senderDisplayName ?? "Family member"}</span>
        <span className="reply-composer-snip">{messageActionSummary(replyTarget)}</span>
      </div>
      <button type="button" className="reply-composer-dismiss" aria-label="Cancel reply" title="Cancel reply" onClick={onCancel}>
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
