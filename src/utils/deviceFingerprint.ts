import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

export async function generateFingerprint(): Promise<{
  fingerprintHash: string;
  deviceId: string;
  installId: string;
}> {
  const androidId =
    Platform.OS === 'android'
      ? (Application.getAndroidId?.() ?? (Application as { androidId?: string }).androidId) ??
        'unknown'
      : Application.applicationId ?? 'unknown';

  let installTime = 'unknown';
  try {
    const installedAt = await Application.getInstallationTimeAsync();
    installTime = installedAt.toISOString();
  } catch {
    installTime = 'unknown';
  }

  const platformTag = Platform.OS === 'ios' ? 'ios' : 'android';
  const combinedString = `${androidId}:${installTime}:${platformTag}`;

  const fingerprintHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combinedString,
  );

  return {
    fingerprintHash,
    deviceId: androidId,
    installId: installTime,
  };
}
