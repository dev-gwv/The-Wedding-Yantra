import type { FastifyBaseLogger } from "fastify";

/**
 * Delivers sign-in codes. Today only a development sender exists; a WhatsApp or SMS
 * provider plugs in here later without touching the sign-in logic.
 */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export function createConsoleOtpSender(log: FastifyBaseLogger, options: { revealCode: boolean }): OtpSender {
  return {
    async send(phone, code) {
      if (options.revealCode) {
        log.info({ phone }, `sign-in code for ${phone}: ${code}`);
      } else {
        log.warn({ phone }, "no SMS/WhatsApp provider configured; sign-in code was not delivered");
      }
    },
  };
}
