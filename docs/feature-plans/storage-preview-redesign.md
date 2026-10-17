---
title: "Storage preview redesign"
type: feature-plan
---

# Storage preview redesign

## User problem

The Storage file inspector takes too much horizontal space and presents media in a large, fixed-looking frame. Videos appear undersized, document previews spend space on file-type decoration, and file metadata and actions compete with the preview.

## Scope and observable behavior

- Open a selected file in an overlay aligned to the right edge and vertically centered. Size the window around its contents while preserving the image or video's aspect ratio.
- Scale small and large images and videos to the standard viewport budget, including upscaling low-resolution sources. Do not show file byte size as part of the media surface.
- Render supported document contents directly without a file-type icon card. Markdown content uses a plain, unboxed surface.
- Place Download, Full screen, and the actions menu inside the media surface for every file type. Reserve a toolbar row above document text. Full screen enlarges the actual content within viewport bounds and changes to a restore icon; omit the duplicate video fullscreen control.
- Put the filename in the shared popup title treatment. The actions menu shows SVG icons with labels beside them; Metadata opens a separate information popup with size, saved date, and source.
- Keep Open in chat when available, Favorite, and permission-gated Delete as labeled icon actions in the actions menu.
- Use the shared popup close control and retain keyboard and backdrop dismissal behavior.
- Place Storage settings beside search. Display file and folder grouping as disabled, gray Premium options and clear earlier stored grouping flags.
- Add synthetic, ephemeral mock records for representative photo, video, document, and Markdown previews so the real Files page can be inspected without uploading files.

## Constraints and decisions

- Preserve existing file selection, download, favorite, deletion permission, chat navigation, media playback, document parsing, and fullscreen behavior.
- Keep preview geometry bounded by viewport dimensions and use `object-fit: contain` for images and videos.
- Keep settings and copy localized in the existing English and Russian catalogs; mark both grouping options as Premium.
- Use the shared popup primitives for the preview shell, close action, and settings popup.
- Keep mock preview records local to mock mode; do not add server fixtures or require user uploads.
- Use a renderable PDF fixture in mock mode so document previews can be visually verified.
