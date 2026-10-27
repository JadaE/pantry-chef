// On-device speech-to-text for the quick log (expo-speech-recognition, Android's own recognizer in on-device mode:
// audio is processed on the phone, nothing is sent to a cloud service, and no account is needed). If the phone cannot do
// on-device recognition (older than Android 13, or no on-device speech pack), voiceAvailable() is false and the mic is hidden.
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export function voiceAvailable(): boolean {
  try { return Platform.OS === 'android' && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() === true; } catch { return false; }
}
export const useSpeechEvent = useSpeechRecognitionEvent;
export type VoiceStart = { ok: true } | { ok: false; message: string };
export async function startListening(): Promise<VoiceStart> {
  try {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) return { ok: false, message: 'Microphone permission was not given. You can still type.' };
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false, requiresOnDeviceRecognition: true, addsPunctuation: false });
    return { ok: true };
  } catch (e: any) { return { ok: false, message: 'Voice is not available right now. You can still type.' }; }
}
export const stopListening = () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };
export const abortListening = () => { try { ExpoSpeechRecognitionModule.abort(); } catch {} };
export function voiceErrorText(code: string): string {
  if (code === 'language-not-supported' || code === 'service-not-allowed') return "This phone doesn't have the offline English speech pack. Type instead, or add it in Android settings.";
  if (code === 'not-allowed') return 'Microphone permission was not given. You can still type.';
  if (code === 'no-speech' || code === 'speech-timeout') return "Didn't catch that. Tap the mic and try again.";
  if (code === 'aborted') return '';
  return "Couldn't hear that. Try again or type.";
}
