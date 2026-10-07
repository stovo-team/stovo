import type { ComponentProps } from "react";
import { Volume2 } from "lucide-react";
import { CallAudioSettingsPopup } from "../features/chats/calling/CallAudioSettingsPopup";
import { useCallAudioTests } from "../features/chats/calling/useCallAudioTests";

type Props = ComponentProps<typeof CallAudioSettingsPopup>;

export function GuestMeetingAudioSettings(props: Props) {
  return props.isMobile ? <MobileAudioSettings {...props} /> : <CallAudioSettingsPopup {...props} />;
}

function MobileAudioSettings({ settings, localStream = null, onPatch }: Props) {
  const test = useCallAudioTests(localStream, settings);
  return <section className="guest-settings-popover" role="dialog" aria-label="Device settings">
    <div className="guest-settings-section">
      <label>Microphone volume <strong>{settings.inputGain}%</strong><input aria-label="Microphone volume" type="range" min="0" max="200" value={settings.inputGain} onChange={(event) => onPatch({ inputGain: Number(event.target.value) })} /></label>
      <div className="guest-mic-test"><span>Microphone test</span>{test.available ? <div className="guest-mic-meter" aria-label={`Microphone level ${test.level}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={test.level}><i style={{ width: `${test.level}%` }} /></div> : <small>Microphone unavailable</small>}</div>
    </div>
    <div className="guest-settings-section">
      <label>Speaker volume <strong>{settings.outputVolume}%</strong><input aria-label="Speaker volume" type="range" min="0" max="100" value={settings.outputVolume} onChange={(event) => onPatch({ outputVolume: Number(event.target.value) })} /></label>
      <button type="button" className="guest-test-sound" disabled={settings.soundDisabled || settings.outputVolume <= 0} onClick={() => void test.testSound()}><Volume2 size={16} /> Test sound</button>
      {test.warning && <p role="status">{test.warning}</p>}
    </div>
  </section>;
}
