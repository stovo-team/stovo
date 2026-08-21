import type { ReactNode } from "react";
import { Bus, Cat, Flag, History, Music, Shirt, Smile, Trophy, Utensils } from "lucide-react";
import { Categories } from "emoji-picker-react";

export const EMOJI_CATEGORY_ICONS: Partial<Record<Categories, ReactNode>> = {
  [Categories.SUGGESTED]: <History aria-hidden="true" size={18} />,
  [Categories.SMILEYS_PEOPLE]: <Smile aria-hidden="true" size={18} />,
  [Categories.ANIMALS_NATURE]: <Cat aria-hidden="true" size={18} />,
  [Categories.FOOD_DRINK]: <Utensils aria-hidden="true" size={18} />,
  [Categories.TRAVEL_PLACES]: <Bus aria-hidden="true" size={18} />,
  [Categories.ACTIVITIES]: <Trophy aria-hidden="true" size={18} />,
  [Categories.OBJECTS]: <Shirt aria-hidden="true" size={18} />,
  [Categories.SYMBOLS]: <Music aria-hidden="true" size={18} />,
  [Categories.FLAGS]: <Flag aria-hidden="true" size={18} />
};
