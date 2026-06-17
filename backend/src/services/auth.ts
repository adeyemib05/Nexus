import { createHmac } from 'crypto';

/**
 * Generates a Bitget HMAC-SHA256 signature.
 * Pre-image: timestamp + METHOD + requestPath + body
 */
export function generateSign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secretKey: string
): string {
  const preImage = timestamp + method.toUpperCase() + requestPath + body;
  return createHmac('sha256', secretKey).update(preImage).digest('base64');
}

/**
 * Builds the full set of authenticated headers for a Bitget request.
 */
export function buildAuthHeaders(
  method: string,
  requestPath: string,
  body: string,
  apiKey: string,
  secretKey: string,
  passphrase: string
): Record<string, string> {
  const timestamp = String(Date.now());
  const sign = generateSign(timestamp, method, requestPath, body, secretKey);
  return {
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
    'locale': 'en-US',
  };
}
