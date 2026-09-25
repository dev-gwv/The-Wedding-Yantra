import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config.js";
import { AppError } from "../../lib/http.js";

export type OtpChannel = "whatsapp" | "sms" | "none";

/**
 * Delivers sign-in codes. WhatsApp and SMS providers plug in here without touching the
 * sign-in logic. Returns how the code went out.
 */
export interface OtpSender {
  send(phone: string, code: string): Promise<OtpChannel | void>;
}

export function createConsoleOtpSender(log: FastifyBaseLogger, options: { revealCode: boolean }): OtpSender {
  return {
    async send(phone, code) {
      if (options.revealCode) {
        log.info({ phone }, `sign-in code for ${phone}: ${code}`);
      } else {
        log.warn({ phone }, "no SMS/WhatsApp provider configured; sign-in code was not delivered");
      }
      return "none";
    },
  };
}

/** `+919876543210` -> `919876543210`, the way both providers want numbers. */
const digits = (phone: string) => phone.replace(/\D/g, "");

/**
 * WhatsApp Cloud API with an approved "authentication" template: the code in the body and
 * on the copy-code button, as Meta requires for that template type.
 */
export function createWhatsAppOtpSender(
  opts: { token: string; phoneNumberId: string; template: string; language: string },
  fetchImpl: typeof fetch = fetch,
): OtpSender {
  return {
    async send(phone, code) {
      const res = await fetchImpl(`https://graph.facebook.com/v21.0/${encodeURIComponent(opts.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: digits(phone),
          type: "template",
          template: {
            name: opts.template,
            language: { code: opts.language },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(`WhatsApp didn't send the code: ${body.error?.message ?? res.status}`);
      }
      return "whatsapp";
    },
  };
}

/** MSG91's OTP API: an SMS from a DLT-approved template that carries the code. */
export function createMsg91OtpSender(opts: { authKey: string; templateId: string }, fetchImpl: typeof fetch = fetch): OtpSender {
  return {
    async send(phone, code) {
      const url = new URL("https://control.msg91.com/api/v5/otp");
      url.searchParams.set("template_id", opts.templateId);
      url.searchParams.set("mobile", digits(phone));
      url.searchParams.set("otp", code);
      const res = await fetchImpl(url, { method: "POST", headers: { authkey: opts.authKey, "content-type": "application/json" }, body: "{}" });
      const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (!res.ok || body.type !== "success") throw new Error(`MSG91 didn't send the code: ${body.message ?? res.status}`);
      return "sms";
    },
  };
}

/**
 * Tries each sender in turn (e.g. WhatsApp, then SMS). If none gets through, the person is
 * told to try again, and the failures are logged for whoever runs the service.
 */
export function createFallbackOtpSender(senders: OtpSender[], log: FastifyBaseLogger): OtpSender {
  return {
    async send(phone, code) {
      for (const sender of senders) {
        try {
          return await sender.send(phone, code);
        } catch (err) {
          log.error({ err, phone }, "sign-in code not sent");
        }
      }
      throw new AppError(502, "CODE_NOT_SENT", "We couldn't send your code just now. Please try again in a minute.");
    },
  };
}

/** The senders the settings ask for, in order. */
export function createOtpSender(config: Config, log: FastifyBaseLogger, fetchImpl: typeof fetch = fetch): OtpSender {
  const senders = config.otp.providers.map((p) =>
    p === "whatsapp" ? createWhatsAppOtpSender(config.otp.whatsapp!, fetchImpl) : createMsg91OtpSender(config.otp.msg91!, fetchImpl),
  );
  if (senders.length === 0) {
    return createConsoleOtpSender(log, { revealCode: config.nodeEnv !== "production" || config.otpDevEcho });
  }
  return createFallbackOtpSender(senders, log);
}
