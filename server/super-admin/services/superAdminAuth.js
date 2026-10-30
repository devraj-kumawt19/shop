import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { User, SuperAdminInvitation } from "../../db/models.js";

export const hashInvitation = (token) => createHash("sha256").update(token).digest("hex");
export const validEmail = (email) => typeof email === "string" && email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const invalidInvitation = () => Object.assign(new Error("This invitation is invalid, expired or already used. Ask your owner for a new invitation."), { status: 400 });

export async function createInvitation(actor, email) {
  if (!validEmail(email)) throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw Object.assign(new Error("This email already has an account. Use the server provisioning command for existing accounts."), { status: 409 });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await SuperAdminInvitation.create({ email: normalizedEmail, tokenHash: hashInvitation(token), invitedBy: actor.id, expiresAt });
  return { token, email: normalizedEmail, expiresAt };
}

export async function acceptInvitation(input) {
  const { name, email, password, invitationToken } = input || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) throw Object.assign(new Error("Enter a name between 2 and 80 characters."), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
  // bcrypt uses at most 72 bytes; reject longer new owner passwords rather than silently truncating.
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) throw Object.assign(new Error("Use a password of at least 12 characters and at most 72 UTF-8 bytes."), { status: 400 });
  if (typeof invitationToken !== "string" || !/^[a-f0-9]{64}$/.test(invitationToken)) throw invalidInvitation();
  const normalizedEmail = email.trim().toLowerCase();
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      // Claim and create in one transaction: replay, concurrent requests and failed account creation cannot consume a valid invite twice.
      const invitation = await SuperAdminInvitation.findOneAndUpdate({ tokenHash: hashInvitation(invitationToken), email: normalizedEmail, acceptedAt: null, expiresAt: { $gt: new Date() } }, { $set: { acceptedAt: new Date() } }, { returnDocument: "after", session });
      if (!invitation) throw invalidInvitation();
      // Recheck the inviter's current role and status, never a role supplied by the registering client.
      const owner = await User.findById(invitation.invitedBy).session(session);
      if (!owner || owner.role !== "superadmin" || owner.isActive === false) throw invalidInvitation();
      [user] = await User.create([{ name: name.trim(), email: normalizedEmail, password, role: "superadmin", permissions: [] }], { session });
    });
    return user;
  } finally { await session.endSession(); }
}
