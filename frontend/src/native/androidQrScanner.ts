import { Capacitor } from "@capacitor/core";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

export async function scanAndroidLoginQR(): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error("QR scanner is being installed. Try again shortly or use your password.");
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  } catch (error) {
    if (error instanceof Error && error.message === "scan canceled.") return null;
    throw error;
  }
}
