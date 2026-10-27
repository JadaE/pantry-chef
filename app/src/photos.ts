// Item photos: taken with the camera or picked from the gallery (Android's photo picker), then copied into the
// app's private documents folder so they survive the picker's cache being cleared.
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Alert } from 'react-native';
import { newId } from './logic';
function photoDir() { const d = new Directory(Paths.document, 'photos'); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; }
async function keep(uri: string): Promise<string> {
  const dest = new File(photoDir(), newId() + '.jpg');
  await new File(uri).copy(dest);
  return dest.uri;
}
const OPTS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false, exif: false };
export async function takePhoto(): Promise<string | null> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) { Alert.alert('Camera permission needed', 'Allow camera access in Android Settings > Apps > Pantry Chef > Permissions to take item photos.'); return null; }
  const r = await ImagePicker.launchCameraAsync(OPTS);
  if (r.canceled || !r.assets?.[0]) return null;
  return keep(r.assets[0].uri);
}
export async function pickPhoto(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync(OPTS);
  if (r.canceled || !r.assets?.[0]) return null;
  return keep(r.assets[0].uri);
}
export function deletePhoto(uri: string | null | undefined) {
  if (!uri || !uri.includes('/photos/')) return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch {}
}
/** Save a product image (Open Food Facts) locally so it shows offline. Falls back to the web URL. */
export async function downloadPhoto(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try { const dest = new File(photoDir(), newId() + '.jpg'); const f = await File.downloadFileAsync(url, dest); return f.uri; }
  catch { return url; }
}
/** Receipt photo: full quality for text recognition, not kept. */
export async function receiptPhoto(camera: boolean): Promise<string | null> {
  if (camera) {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { Alert.alert('Camera permission needed', 'Allow camera access in Android Settings > Apps > Pantry Chef > Permissions.'); return null; }
  }
  const o: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const r = camera ? await ImagePicker.launchCameraAsync(o) : await ImagePicker.launchImageLibraryAsync(o);
  return r.canceled || !r.assets?.[0] ? null : r.assets[0].uri;
}
