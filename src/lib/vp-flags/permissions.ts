/** Returns true when the given admin account may post a reply to the given
 * VP query recipient row.
 *
 * `hq_viewer` is intentionally excluded: the role is read-only and must
 * not be able to post official HQ responses on the company record. */
export function canReplyToVpRecipient(
  admin: { role: string; region?: string | null; branch?: string | null },
  recipient: { type: string; region?: string | null; branch?: string | null }
): boolean {
  if (recipient.type === "hq") return admin.role === "hq";
  if (recipient.type === "regional") return admin.role === "regional" && admin.region === recipient.region;
  if (recipient.type === "branch") return admin.role === "branch" && admin.branch === recipient.branch;
  return false;
}
