import { useStrings } from "../../../i18n/LanguageContext";

export function MockScreenSharePreview({ ownerName }: { ownerName: string }) {
  const copy = useStrings().auditUi;
  return (
    <div className="mock-screen-share-preview" role="img" aria-label={copy.ownerSharedScreen(ownerName)}>
      <div className="mock-screen-share-preview__topbar" aria-hidden="true">
        <span className="mock-screen-share-preview__window-dots" />
        <span>{copy.stovoWorkspace}</span>
        <span className="mock-screen-share-preview__topbar-status">{copy.sharedBy} {ownerName}</span>
      </div>
      <div className="mock-screen-share-preview__content" aria-hidden="true">
        <aside className="mock-screen-share-preview__sidebar">
          <span className="mock-screen-share-preview__brand-mark">S</span>
          <span className="mock-screen-share-preview__sidebar-item is-active">{copy.overview}</span>
          <span className="mock-screen-share-preview__sidebar-item">{copy.projectPlan}</span>
          <span className="mock-screen-share-preview__sidebar-item">{copy.messages}</span>
          <span className="mock-screen-share-preview__sidebar-item">{copy.files}</span>
        </aside>
        <main className="mock-screen-share-preview__document">
          <span className="mock-screen-share-preview__eyebrow">{copy.planningDocument}</span>
          <strong>{copy.q4Planning}</strong>
          <span className="mock-screen-share-preview__document-rule" />
          <span className="mock-screen-share-preview__line mock-screen-share-preview__line--wide" />
          <span className="mock-screen-share-preview__line" />
          <div className="mock-screen-share-preview__cards">
            <span><b>01</b> {copy.roadmapReview}</span>
            <span><b>02</b> {copy.designMilestones}</span>
            <span><b>03</b> {copy.launchReadiness}</span>
          </div>
          <span className="mock-screen-share-preview__line mock-screen-share-preview__line--wide" />
          <span className="mock-screen-share-preview__line mock-screen-share-preview__line--short" />
        </main>
      </div>
      <div className="mock-screen-share-preview__taskbar" aria-hidden="true">
        <span /> <span /> <span /> <span />
      </div>
    </div>
  );
}
