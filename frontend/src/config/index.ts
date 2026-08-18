/**
 * Central config barrel.
 *
 * Import from here in all components:
 *   import { strings, colors, brand, radii, sizes, motion } from "../config";
 *
 * Structure
 * ─────────────────────────────────────────────────────
 *  config/
 *  ├── index.ts          ← you are here
 *  ├── brand.ts          ← app name, logo title, tagline, deep-link scheme
 *  ├── motion.ts         ← animation durations, easings, distances
 *  ├── radii.ts          ← border-radius numeric values
 *  ├── sizes.ts          ← icon px, input constraints, scale ranges
 *  ├── colors/
 *  │   ├── index.ts      ← swap dark ↔ light here
 *  │   └── dark.ts       ← current active color set
 *  └── strings/
 *      ├── index.ts      ← swap language here
 *      └── english.ts    ← current active language
 */

export { brand } from "./brand";
export type { AppBrand } from "./brand";

export { motion } from "./motion";
export type { AppMotion } from "./motion";

export { radii } from "./radii";
export type { AppRadii } from "./radii";

export { sizes } from "./sizes";
export type { AppSizes } from "./sizes";

export { colors } from "./colors";
export type { AppColors } from "./colors";

export { strings } from "./strings";
export type { AppStrings } from "./strings";
