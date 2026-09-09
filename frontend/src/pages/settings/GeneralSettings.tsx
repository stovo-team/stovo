import { useAppearance } from "../../appearance/AppearanceContext";
import type { AppStrings } from "../../config/strings";
import { GeneralChatControls } from "./AppearanceControls";

export function GeneralSettings({ strings }: { strings: AppStrings }) {
  const { appearance, updateAppearance } = useAppearance();

  return <div className="settings-toggle-groups"><section className="general-chat-settings"><h3>{strings.settings.chatMedia}</h3><GeneralChatControls appearance={appearance} strings={strings} updateAppearance={updateAppearance} /></section></div>;
}
