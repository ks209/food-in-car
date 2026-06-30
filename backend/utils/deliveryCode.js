import crypto from 'crypto';

// Unambiguous base32 alphabet (no 0/O/1/I) — easy to read & type as a fallback.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Short random token embedded in the customer's QR. The delivery person scans it
// (or types it) to mark the order COMPLETED. ~8 chars ≈ 40 bits of entropy.
export function genDeliveryCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
