import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
  imageBase64?: string;
  imageName?: string;
  mimeType?: string;
}

export interface NativeSharePluginInterface {
  share(options: NativeShareOptions): Promise<{ shared: boolean }>;
}

export const NativeSharePlugin = registerPlugin<NativeSharePluginInterface>("NativeSharePlugin");

export interface ShareContentOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
  dataUrl?: string;
  filename?: string;
  mimeType?: string;
}

export interface ShareContentResult {
  shared: boolean;
  cancelled?: boolean;
  fallbackToCopy?: boolean;
  error?: string;
}

async function dataUrlToFile(dataUrl: string, filename: string, mimeType: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: mimeType || blob.type || "image/png" });
}

export async function shareContent(options: ShareContentOptions): Promise<ShareContentResult> {
  const { title, text, url, dialogTitle, dataUrl, filename, mimeType } = options;

  if (Capacitor.isNativePlatform()) {
    try {
      await NativeSharePlugin.share({
        title,
        text,
        url,
        dialogTitle,
        imageBase64: dataUrl,
        imageName: filename,
        mimeType: mimeType || (dataUrl?.startsWith("data:image/png") ? "image/png" : "image/jpeg")
      });
      return { shared: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { shared: false, error: message };
    }
  }

  // Web fallback using Web Share API if supported
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const shareData: ShareData = {
        title: title || undefined
      };

      if (url && text) {
        if (text.includes(url)) {
          shareData.text = text;
        } else {
          shareData.text = text;
          shareData.url = url;
        }
      } else if (url) {
        shareData.url = url;
      } else if (text) {
        shareData.text = text;
      }

      if (dataUrl && filename && typeof navigator.canShare === "function") {
        try {
          const file = await dataUrlToFile(dataUrl, filename, mimeType || "image/png");
          if (navigator.canShare({ ...shareData, files: [file] })) {
            await navigator.share({
              ...shareData,
              files: [file]
            });
            return { shared: true };
          }
        } catch {
          // File sharing not accepted, fall back to sharing text/url
        }
      }

      await navigator.share(shareData);
      return { shared: true };
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || err.message.includes("abort") || err.message.includes("cancel"))) {
        return { shared: false, cancelled: true };
      }
      return { shared: false, fallbackToCopy: true };
    }
  }

  // Web Share API is not supported on this platform/browser
  return { shared: false, fallbackToCopy: true };
}
