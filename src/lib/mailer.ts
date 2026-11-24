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
    case "feedback":
      return `Dear Hiring Team,\n\nThank you for letting me know, and for considering my application${role}. I'd really appreciate any brief feedback on my application or assessment, as it would help me improve for future opportunities.\n\nThank you for your time.\n\n${sign}`;
    default:
      return `Dear Hiring Team,\n\nThank you for getting in touch${role}. \n\n${sign}`;
  }
}
