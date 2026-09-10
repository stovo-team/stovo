import { FileText } from "lucide-react";

export function QuickAccessPanel() {
  return (
    <section className="quick-access-panel" aria-label="Drafts and scheduled messages">
      <header className="quick-access-panel-header"><FileText size={20} /><h1>Drafts &amp; scheduled</h1></header>
      <div className="quick-access-panel-tabs" role="tablist"><button type="button" className="active" role="tab" aria-selected="true">Drafts</button><button type="button" role="tab" aria-selected="false">Scheduled</button></div>
      <div className="quick-access-panel-empty"><FileText size={28} /><strong>No drafts or scheduled messages</strong><p>Drafts and scheduled messages from all chats will appear here.</p></div>
    </section>
  );
}
