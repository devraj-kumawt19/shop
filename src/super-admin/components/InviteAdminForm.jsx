import { useState } from "react";
import { getErrorMessage } from "../../api.js";
import superAdminApi from "../services/superAdminApi.js";

export default function InviteAdminForm() {
  const [email, setEmail] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setInvitation(null);
    try {
      const { data } = await superAdminApi.post("invitations", { email });
      const fragment = new URLSearchParams({ token: data.invitation.token, email: data.invitation.email });
      setInvitation({ url: `${window.location.origin}/super-admin/register#${fragment}`, expiresAt: data.invitation.expiresAt });
      setEmail("");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <section className="sa-invite"><h3>Invite a Super Admin</h3><p>Give owner access only to someone you trust. The invitation works once for this email and expires in 24 hours.</p><form onSubmit={submit}><label>Invited email<input type="email" autoComplete="off" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label><button className="button button-dark" disabled={busy}>{busy ? "Creating invitation…" : "Create secure invitation"}</button></form>{error && <p className="sa-alert" role="alert">{error}</p>}{invitation && <div className="sa-info" role="status"><label>Copy and share this link securely<textarea rows={3} readOnly value={invitation.url} onFocus={(event) => event.target.select()} /></label><p>Shown only now. Expires {new Date(invitation.expiresAt).toLocaleString("en-IN")}.</p><button onClick={() => setInvitation(null)}>Dismiss invitation link</button></div>}</section>;
}
