import { ArrowLeft, UserPlus } from "lucide-react";
import { useStrings } from "../../../i18n/LanguageContext";

type MobileActiveTopBarProps = {
  areControlsVisible: boolean;
  isLandscapeView: boolean;
  isSharingScreen: boolean;
  isParticipantFocused: boolean;
  onShrink?: () => void;
  onCloseLandscape: () => void;
  onRotateLandscape: () => void;
  onCloseParticipantFocus: () => void;
  onInvite: () => void;
};

export function MobileActiveTopBar({
  areControlsVisible,
  isLandscapeView,
  isSharingScreen,
  isParticipantFocused,
  onShrink,
  onCloseLandscape,
  onRotateLandscape,
  onCloseParticipantFocus,
  onInvite,
}: MobileActiveTopBarProps) {
  const copy = useStrings().auditUi;
  return (
    <div className={`mobile-active-top-bar${areControlsVisible ? "" : " mobile-active-controls--hidden"}`}>
      {isLandscapeView && <button type="button" className="mobile-active-shrink-btn mobile-active-landscape-close" aria-label={copy.closeLandscape} onClick={(event) => { event.stopPropagation(); onCloseLandscape(); }}><ArrowLeft size={20} aria-hidden="true" /></button>}
      {isParticipantFocused && <button type="button" className="mobile-active-shrink-btn mobile-active-focus-back" aria-label={copy.closeParticipantFocus} onClick={(event) => { event.stopPropagation(); onCloseParticipantFocus(); }}><ArrowLeft size={20} aria-hidden="true" /></button>}
      <button type="button" className="mobile-active-shrink-btn" aria-label={copy.shrinkCall} title={copy.shrinkCall} onClick={(event) => { event.stopPropagation(); onShrink?.(); }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
      <div className="mobile-active-top-actions">
        <button type="button" className="mobile-active-shrink-btn mobile-active-invite-btn" aria-label={copy.invitePeople} title={copy.invitePeople} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onInvite(); }}>
          <UserPlus size={20} aria-hidden="true" />
        </button>
        {isSharingScreen && !isLandscapeView && <button type="button" className="mobile-active-shrink-btn mobile-active-landscape-open" aria-label={copy.rotateLandscape} title={copy.rotateLandscape} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCloseParticipantFocus(); onRotateLandscape(); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8V5a2 2 0 0 1 2-2h3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M7 21 3 17l4-4" /><path d="m17 3 4 4-4 4" /><rect x="8" y="7" width="8" height="10" rx="1" transform="rotate(90 12 12)" />
          </svg>
        </button>}
      </div>
    </div>
  );
}
