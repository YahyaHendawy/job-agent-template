/** Sends a reply from the job inbox (Gmail SMTP with the same app password). Only ever called when the owner taps Send. */
import nodemailer from "nodemailer";
import { imapCreds } from "@/worker/inbox";

export async function sendReply(opts: { to: string; subject: string; text: string; inReplyTo?: string | null; fromName?: string }) {
  const creds = await imapCreds();
  if (!creds) throw new Error("Job inbox is not connected");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: creds.user, pass: creds.pass } });
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const info = await t.sendMail({
    from: opts.fromName ? { name: opts.fromName, address: creds.user } : creds.user, to: opts.to, subject, text: opts.text,
    ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: opts.inReplyTo } : {}),
  });
  return info.messageId;
}

export function replyTemplate(category: string, ctx: { firstName: string; lastName?: string; role?: string; employer?: string; phone?: string }) {
  const sign = `Kind regards,\n${[ctx.firstName, ctx.lastName].filter(Boolean).join(" ")}${ctx.phone ? `\n${ctx.phone}` : ""}`;
  const role = ctx.role ? ` for the ${ctx.role} position` : "";
  switch (category) {
    case "interview":
      return `Dear Hiring Team,\n\nThank you for the invitation to interview${role}. I would be delighted to attend.\n\nI am available at the following times:\n- \n- \n- \n\nPlease let me know which suits you best, or feel free to suggest another time.\n\n${sign}`;
    case "assessment":
      return `Dear Hiring Team,\n\nThank you for the update${role}. I confirm I have received the assessment and will complete it before the deadline.\n\n${sign}`;
    case "offer":
      return `Dear Hiring Team,\n\nThank you very much for the offer${role}. I am delighted to receive it. Could you please send the full details (start date, contract and next steps) so I can review them?\n\n${sign}`;
    case "accept_offer":
      return `Dear Hiring Team,\n\nThank you very much for the offer${role}. I'm delighted to accept.\n\nPlease let me know the next steps, including the contract, my start date and time, where to go on my first day and anything you need from me beforehand (for example right-to-work documents).\n\nI'm looking forward to joining the team.\n\n${sign}`;
    case "decline_offer":
      return `Dear Hiring Team,\n\nThank you very much for the offer${role}, and for your time during the process. After careful thought, I've decided to decline, as I've accepted another opportunity that fits my studies.\n\nI really enjoyed learning about the team and hope our paths cross again in the future.\n\n${sign}`;
    case "feedback":
      return `Dear Hiring Team,\n\nThank you for letting me know, and for considering my application${role}. I'd really appreciate any brief feedback on my application or assessment, as it would help me improve for future opportunities.\n\nThank you for your time.\n\n${sign}`;
    default:
      return `Dear Hiring Team,\n\nThank you for getting in touch${role}. \n\n${sign}`;
  }
}

/** A new email (not a reply) from the job inbox, optionally with attachments. Only called when the owner taps Send. */
export async function sendEmail(opts: { to: string; subject: string; text: string; fromName?: string; attachments?: { filename: string; content: Buffer }[] }) {
  const creds = await imapCreds();
  if (!creds) throw new Error("Job inbox is not connected");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: creds.user, pass: creds.pass } });
  const info = await t.sendMail({ from: opts.fromName ? { name: opts.fromName, address: creds.user } : creds.user, to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments });
  return info.messageId;
}
