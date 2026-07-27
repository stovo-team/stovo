export const GALLERY_ATTACHMENT_ACCEPT = "image/*,video/*";

export const CAMERA_ATTACHMENT_ACCEPT = "image/*";

export const AUDIO_ATTACHMENT_ACCEPT =
  "audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/*";

export const DOCUMENT_ATTACHMENT_ACCEPT =
  "application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const DESKTOP_ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  AUDIO_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_ACCEPT
].join(",");
