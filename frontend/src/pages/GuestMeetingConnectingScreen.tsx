import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";

export default function GuestMeetingConnectingScreen({ stovoSite }: { stovoSite: string }) {
  const copy = useStrings().sharedUi;
  return <main className="guest-meeting-page guest-meeting-page--connecting">
    <div className="guest-connecting-status" role="status">
      <LoaderCircle className="guest-connecting-spinner" size={36} aria-hidden="true" />
      <span>{copy.joiningMeeting}</span>
    </div>
    <a className="guest-stovo-marketing" href={stovoSite} target="_blank" rel="noreferrer">{copy.privateSpaceInvite} <ArrowUpRight size={16} aria-hidden="true" /></a>
  </main>;
}
