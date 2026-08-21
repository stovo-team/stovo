import type { AppStrings } from "../../config/strings";
import type { DevicePreferences } from "../../settings/devicePreferences";

type Props = {
  strings: AppStrings;
  preferences: DevicePreferences;
  onUpdate: (updates: Partial<DevicePreferences>) => void;
};

export function NotificationsSettings({ strings, preferences, onUpdate }: Props) {
  const messageOptions = [
    ["messageNotifications", strings.notifications.messageNotifications],
    ["messagePreview", strings.notifications.messagePreview],
    ["messageSound", strings.notifications.messageSound]
  ] as const;
  const callOptions = [
    ["callNotifications", strings.notifications.callNotifications],
    ["ringtoneEnabled", strings.notifications.ringtoneEnabled]
  ] as const;

  return (
    <div className="settings-toggle-groups">
      <section>
        <h3>{strings.notifications.messages}</h3>
        {messageOptions.map(([key, label]) => (
          <label className="appearance-toggle-row" key={key}>
            <strong>{label}</strong>
            <input type="checkbox" checked={preferences[key]} onChange={(event) => onUpdate({ [key]: event.target.checked })} />
          </label>
        ))}
      </section>
      <section>
        <h3>{strings.notifications.calls}</h3>
        {callOptions.map(([key, label]) => (
          <label className="appearance-toggle-row" key={key}>
            <strong>{label}</strong>
            <input type="checkbox" checked={preferences[key]} onChange={(event) => onUpdate({ [key]: event.target.checked })} />
          </label>
        ))}
      </section>
      <section>
        <h3>{strings.notifications.quietHours}</h3>
        <label className="appearance-toggle-row">
          <span><strong>{strings.notifications.muteNotifications}</strong><span className="appearance-toggle-help">{preferences.quietHoursStart} — {preferences.quietHoursEnd}</span></span>
          <input type="checkbox" checked={preferences.quietHoursEnabled} onChange={(event) => onUpdate({ quietHoursEnabled: event.target.checked })} />
        </label>
        <div className="quiet-hours-times">
          <label>{strings.notifications.start}<input aria-label={strings.notifications.quietHoursStartAria} type="time" value={preferences.quietHoursStart} onChange={(event) => onUpdate({ quietHoursStart: event.target.value })} /></label>
          <label>{strings.notifications.end}<input aria-label={strings.notifications.quietHoursEndAria} type="time" value={preferences.quietHoursEnd} onChange={(event) => onUpdate({ quietHoursEnd: event.target.value })} /></label>
        </div>
      </section>
    </div>
  );
}
