import nodemailer, { type Transporter } from "nodemailer";

import type { PosEnv } from "../../env.js";
import type { MailMessage, MailPort } from "../../ports/mail.js";

export type TransportFactory = (env: PosEnv) => Transporter;

const defaultTransportFactory: TransportFactory = (env) =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // false for mailpit:1025
    auth:
      env.SMTP_USER !== undefined && env.SMTP_PASS !== undefined
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

/** Non-pooled SMTP: no long-lived sockets between sends — nothing to leak. */
export function createNodemailerMail(
  env: PosEnv,
  transportFactory: TransportFactory = defaultTransportFactory,
): MailPort {
  const transporter = transportFactory(env);
  return {
    send: async (message: MailMessage): Promise<void> => {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
    close: async (): Promise<void> => {
      await Promise.resolve();
      transporter.close(); // no-op unpooled; releases sockets if pool:true is ever enabled
    },
  };
}
