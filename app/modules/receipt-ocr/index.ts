// On-device text recognition (Google ML Kit, bundled Latin model: works offline, no Play Services download, free).
// Returns every recognised line with its bounding box so receipt rows can be rebuilt (ML Kit often splits the
// item-name column and the price column into separate blocks).
import { requireOptionalNativeModule } from 'expo-modules-core';
export type OcrLine = { text: string; left: number; top: number; right: number; bottom: number };
export type OcrResult = { text: string; lines: OcrLine[]; width: number; height: number };
const Native = requireOptionalNativeModule<{ recognize(uri: string): Promise<OcrResult> }>('ReceiptOcr');
export const ocrAvailable = !!Native;
export async function recognize(uri: string): Promise<OcrResult> {
  if (!Native) throw new Error('Text recognition is not available in this build.');
  return Native.recognize(uri);
}
