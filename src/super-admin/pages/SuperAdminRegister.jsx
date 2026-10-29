import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useShop } from "../../ShopContext.jsx";
import { validateAuth } from "../../authValidation.js";
import { getErrorMessage } from "../../api.js";
import { useAdminSession } from "../hooks/useAdminSession.jsx";
import AdminAuthLayout from "../layouts/AdminAuthLayout.jsx";
import PasswordField from "../components/PasswordField.jsx";

export default function SuperAdminRegister() {
  const { signIn } = useShop();
  const session = useAdminSession();
  const navigate = useNavigate();
  // Invitation links use a fragment so the token is not sent in URLs to the API or a referrer.
  const [values, setValues] = useState(() => { const fragment = new URLSearchParams(window.location.hash.slice(1)); return { name: "", email: fragment.get("email") || "", invitationToken: fragment.get("token") || "", password: "", confirmPassword: "" }; });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname); }, []);
  if (session.status === "authorized") return <Navigate to="/super-admin/dashboard" replace />;
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    const validation = validateAuth(values, "register");
    if (values.password.length < 12 || new TextEncoder().encode(values.password).length > 72) validation.password = "Use at least 12 characters and at most 72 UTF-8 bytes.";
    if (!/^[a-f0-9]{64}$/.test(values.invitationToken.trim())) validation.invitationToken = "Enter the 64-character invitation token from your owner.";
    setErrors(validation); setError(""); if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      await signIn({ name: values.name.trim(), email: values.email.trim(), password: values.password, invitationToken: values.invitationToken.trim() }, "register", "/super-admin/auth/register");
      navigate("/super-admin/dashboard", { replace: true });
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <AdminAuthLayout title="Accept your invitation" description="Create an owner account with an invitation from an existing Super Admin."><form onSubmit={submit} noValidate aria-busy={busy}>
    <p className="sa-info">Invitations are tied to your email, expire after 24 hours and can be used once. For the first owner, use the secure server setup described in the project README.</p>
    {error && <p className="sa-alert" role="alert">{error}</p>}<fieldset disabled={busy}>
    {[["name", "Full name", "text", "name", 80], ["email", "Invited email address", "email", "email", 254], ["invitationToken", "Invitation token", "text", "off", 64]].map(([key, label, type, autoComplete, maxLength]) => <div className="sa-field" key={key}><label htmlFor={`sa-${key}`}>{label}</label><input id={`sa-${key}`} type={type} autoComplete={autoComplete} spellCheck={false} required maxLength={maxLength} value={values[key]} onChange={change(key)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `sa-${key}-error` : undefined} />{errors[key] && <small id={`sa-${key}-error`} className="sa-field-error">{errors[key]}</small>}</div>)}
    <PasswordField autoComplete="new-password" required minLength={12} maxLength={72} value={values.password} onChange={change("password")} error={errors.password} />
    <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" required maxLength={72} value={values.confirmPassword} onChange={change("confirmPassword")} error={errors.confirmPassword} />
    <button className="sa-primary" disabled={busy || session.status === "checking"}>{busy ? <><LoaderCircle size={18} className="spin" />Creating account…</> : <>Create Super Admin account <ArrowRight size={18} /></>}</button></fieldset>
    <p className="sa-auth-switch">Already set up? <Link to="/super-admin/login">Sign in</Link></p>
  </form></AdminAuthLayout>;
}
