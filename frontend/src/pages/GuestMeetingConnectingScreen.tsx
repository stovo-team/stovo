import { LoaderCircle } from "lucide-react";

export default function GuestMeetingConnectingScreen({ stovoSite }: { stovoSite: string }) {
  return <main className="guest-meeting-page guest-meeting-page--connecting">
    <div className="guest-connecting-status" role="status">
      <LoaderCircle className="guest-connecting-spinner" size={36} aria-hidden="true" />
      <span>Joining meeting…</span>
    </div>
    <a className="guest-stovo-marketing" href={stovoSite} target="_blank" rel="noreferrer">Want a private space for your own group? Run Stovo <span aria-hidden="true">↗</span></a>
  </main>;
}
