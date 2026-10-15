export function MockScreenSharePreview({ ownerName }: { ownerName: string }) {
  return (
    <div className="mock-screen-share-preview" role="img" aria-label={`${ownerName}'s shared screen`}>
      <div className="mock-screen-share-preview__topbar" aria-hidden="true">
        <span className="mock-screen-share-preview__window-dots" />
        <span>Stovo Workspace</span>
        <span className="mock-screen-share-preview__topbar-status">Shared by {ownerName}</span>
      </div>
      <div className="mock-screen-share-preview__content" aria-hidden="true">
        <aside className="mock-screen-share-preview__sidebar">
          <span className="mock-screen-share-preview__brand-mark">S</span>
          <span className="mock-screen-share-preview__sidebar-item is-active">Overview</span>
          <span className="mock-screen-share-preview__sidebar-item">Project plan</span>
          <span className="mock-screen-share-preview__sidebar-item">Messages</span>
          <span className="mock-screen-share-preview__sidebar-item">Files</span>
        </aside>
        <main className="mock-screen-share-preview__document">
          <span className="mock-screen-share-preview__eyebrow">PLANNING TEAM · DOCUMENT</span>
          <strong>Q4 product planning</strong>
          <span className="mock-screen-share-preview__document-rule" />
          <span className="mock-screen-share-preview__line mock-screen-share-preview__line--wide" />
          <span className="mock-screen-share-preview__line" />
          <div className="mock-screen-share-preview__cards">
            <span><b>01</b> Roadmap review</span>
            <span><b>02</b> Design milestones</span>
            <span><b>03</b> Launch readiness</span>
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
