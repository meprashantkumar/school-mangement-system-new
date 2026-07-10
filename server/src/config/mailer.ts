import nodemailer from "nodemailer";
import { env } from "./env";

const transporter = env.email.user
  ? nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: { user: env.email.user, pass: env.email.pass },
    })
  : null;

// Sends an email if SMTP is configured; otherwise logs and no-ops (dev friendly).
export const sendMail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!transporter) {
    console.log(`[email skipped - not configured] to=${to} subject="${subject}"`);
    return;
  }
  await transporter.sendMail({ from: env.email.from, to, subject, html });
};
