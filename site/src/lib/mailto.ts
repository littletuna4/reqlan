export function mailtoWithSubject(mailtoHref: string, subject: string): string {
  const [base, existingQuery] = mailtoHref.split("?");
  const params = new URLSearchParams(existingQuery ?? "");
  params.set("subject", subject);
  return `${base}?${params.toString()}`;
}
