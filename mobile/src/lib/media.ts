import * as ImagePicker from 'expo-image-picker';
import { api } from './api';

export interface PickedImage {
  dataUrl: string;
  base64: string;
  mime: string;
}

export async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.7,
    base64: true,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.base64) return null;

  const mime = asset.mimeType ?? 'image/jpeg';
  return { dataUrl: `data:${mime};base64,${asset.base64}`, base64: asset.base64, mime };
}

export async function uploadDataUrl(token: string, dataUrl: string): Promise<string> {
  const result = await api.uploadMedia(token, dataUrl);
  return result.url;
}

export async function pickAndUpload(token: string): Promise<string | null> {
  const picked = await pickImage();
  if (!picked) return null;
  return uploadDataUrl(token, picked.dataUrl);
}
