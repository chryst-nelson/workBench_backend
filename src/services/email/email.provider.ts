import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Default until a real provider (SES, Resend, SMTP...) is configured. */
class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    if (env.NODE_ENV === "production") {
      logger.warn({ to: message.to, subject: message.subject }, "Email provider not configured; email not sent");
      return;
    }
    logger.info({ to: message.to, subject: message.subject, text: message.text }, "[dev email]");
  }
}

export class MemoryEmailProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

let provider: EmailProvider = new ConsoleEmailProvider();
export const getEmailProvider = () => provider;
export const setEmailProvider = (p: EmailProvider) => {
  provider = p;
};
