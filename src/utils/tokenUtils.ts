/** Public Render deployment used by the mobile app and MT5 EA. */
export const LIVE_SERVER_HTTPS =
  'https://propfirm-guardian-server.onrender.com';

/** WebSocket endpoint on the same host as {@link LIVE_SERVER_HTTPS}. */
export const LIVE_SERVER_WSS =
  'wss://propfirm-guardian-server.onrender.com';

/**
 * Generates a UUID v4 token (lowercase) without external dependencies.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export function generateAccountToken(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let token = '';

  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === 'x' || ch === 'y') {
      const rand = Math.floor(Math.random() * 16);
      const nibble = ch === 'x' ? rand : (rand & 0x3) | 0x8;
      token += nibble.toString(16);
    } else {
      token += ch;
    }
  }

  return token;
}

/**
 * Displays a UUID token for humans. UUIDs are already segmented; returned unchanged.
 */
export function formatTokenForDisplay(token: string): string {
  return token;
}

/** Hosted compiled EA download URL (GitHub Pages). */
export function getEADownloadUrl(): string {
  return 'https://ajviral.github.io/propfirm-guardian/PropFirmGuardianEA.ex5';
}

/**
 * Plain-text body for the MT5 setup email pre-filled via mailto:.
 */
export function getSetupEmailBody(token: string, label: string): string {
  const eaUrl = getEADownloadUrl();
  const serverUrl = LIVE_SERVER_HTTPS;

  return [
    'Hello,',
    '',
    'You are setting up PropFirm Guardian live account monitoring for your MT5 account.',
    `Connection label: ${label}`,
    '',
    'Your unique connection token (paste this into the EA inputs):',
    token,
    '',
    'Setup steps:',
    `1. Download the EA file: ${eaUrl}`,
    '2. Copy PropFirmGuardianEA.ex5 into your MT5 Experts folder',
    '   (File → Open Data Folder → MQL5 → Experts)',
    '3. In MT5, drag PropFirmGuardianEA onto any chart',
    `4. In the EA Inputs tab, paste your token: ${token}`,
    `5. Set ServerURL to: ${serverUrl}`,
    '6. Click OK. Live data will appear in PropFirm Guardian within 5 seconds.',
    '',
    'If you need help, contact support: giftobey@gmail.com',
    '',
    '— PropFirm Guardian',
  ].join('\n');
}
