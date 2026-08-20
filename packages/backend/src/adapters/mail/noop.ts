import type { MailPort } from "../../ports/mail.js";

export function createNoopMail(): MailPort {
  return {
    send: async (): Promise<void> => {
      await Promise.resolve();
    },
    close: async (): Promise<void> => {
      await Promise.resolve();
    },
  };
}
