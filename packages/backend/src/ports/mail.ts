export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface MailPort {
  readonly send: (message: MailMessage) => Promise<void>;
  readonly close: () => Promise<void>;
}
