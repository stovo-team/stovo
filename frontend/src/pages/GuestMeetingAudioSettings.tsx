import type { ComponentProps } from "react";
import { Volume2 } from "lucide-react";
import { CallAudioSettingsPopup } from "../features/chats/calling/CallAudioSettingsPopup";
import { useCallAudioTests } from "../features/chats/calling/useCallAudioTests";
import { useStrings } from "../i18n/LanguageContext";

type Props = ComponentProps<typeof CallAudioSettingsPopup>;

export function GuestMeetingAudioSettings(props: Props) {
  return props.isMobile ? <MobileAudioSettings {...props} /> : <CallAudioSettingsPopup {...props} />;
}

function MobileAudioSettings({ settings, localStream = null, onPatch }: Props) {
  const strings = useStrings();
  const copy = strings.callAudio;
  const test = useCallAudioTests(localStream, settings);
  return <section className="guest-settings-popover" role="dialog" aria-label={strings.meetings.guest.openDeviceSettings}>
    <div className="guest-settings-section">
      <label>{copy.microphoneVolume} <strong>{settings.inputGain}%</strong><input aria-label={copy.microphoneVolume} type="range" min="0" max="200" value={settings.inputGain} onChange={(event) => onPatch({ inputGain: Number(event.target.value) })} /></label>
      <div className="guest-mic-test"><span>{copy.micTest}</span>{test.available ? <div className="guest-mic-meter" aria-label={copy.microphoneLevelValue(test.level)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={test.level}><i style={{ width: `${test.level}%` }} /></div> : <small>{copy.micUnavailable}</small>}</div>
    </div>
    <div className="guest-settings-section">
      <label>{copy.outputVolume} <strong>{settings.outputVolume}%</strong><input aria-label={copy.outputVolume} type="range" min="0" max="100" value={settings.outputVolume} onChange={(event) => onPatch({ outputVolume: Number(event.target.value) })} /></label>
      <button type="button" className="guest-test-sound" disabled={settings.soundDisabled || settings.outputVolume <= 0} onClick={() => void test.testSound()}><Volume2 size={16} /> {copy.testSound}</button>
      {test.warning && <p role="status">{test.warning}</p>}
    </div>
  </section>;
}
