/**
 * Phone numbers are stored in E.164 form (`+919876543210`).
 * Indian numbers are the default: a bare 10-digit mobile number gets `+91`.
 */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Returns the E.164 form of a phone number, or `null` if it is not a valid number. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    if (digits.startsWith("91")) {
      const national = digits.slice(2);
      return INDIAN_MOBILE.test(national) ? `+91${national}` : null;
    }
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // 98765 43210 | 098765 43210 | 91 98765 43210
  let national = digits;
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  return INDIAN_MOBILE.test(national) ? `+91${national}` : null;
}

/** `+919876543210` -> `+91 98765 43210`. Other countries are returned unchanged. */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** `+919876543210` -> `+91 ••••• •3210`, for showing a number without revealing it. */
export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4);
  return e164.startsWith("+91") ? `+91 ••••• •${last4}` : `•••• ${last4}`;
}

/** A link that opens WhatsApp with a message ready to send. Works on web and phones. */
export function whatsappLink(message: string, phone?: string): string {
  const to = phone ? phone.replace(/\D/g, "") : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}
