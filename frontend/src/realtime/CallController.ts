/**
 * Compatibility shim: ChatsPage and audioSettings import from CallController.
 * Media is now owned by CallSessionController (mesh + LiveKit SFU).
 */
export { default } from "./call/CallSessionController";
export type {
  CallSettings,
  CallDevice,
  CallCapabilities,
  RemoteMedia,
  CallTopology,
} from "./call/types";
export { DEFAULT_CALL_SETTINGS, shouldOfferToPeer } from "./call/types";
