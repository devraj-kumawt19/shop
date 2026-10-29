import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useShop } from "../../ShopContext.jsx";
import { validateAuth } from "../../authValidation.js";
import { getErrorMessage } from "../../api.js";
import { useAdminSession } from "../hooks/useAdminSession.jsx";
import AdminAuthLayout from "../layouts/AdminAuthLayout.jsx";
import PasswordField from "../components/PasswordField.jsx";

export default function SuperAdminLogin() {
  const { signIn } = useShop();
  const session = useAdminSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session.status === "authorized") return <Navigate to="/super-admin/dashboard" replace />;
  async function submit(event) {
    event.preventDefault();
    const validation = validateAuth(values, "login"); setErrors(validation); setError("");
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      await signIn({ email: values.email.trim(), password: values.password }, "login", "/super-admin/auth/login");
      const from = location.state?.from;
      navigate(typeof from === "string" && /^\/super-admin\/(dashboard|users|owners|products|orders|categories|commerce|wallet|settings|activity)$/.test(from) ? from : "/super-admin/dashboard", { replace: true });
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <AdminAuthLayout title="Welcome back" description="Sign in to your Super Admin workspace."><form onSubmit={submit} noValidate aria-busy={busy}>
    {(location.state?.denied || session.status === "forbidden") && <p className="sa-alert" role="alert">Your current account does not have Super Admin access. Sign in with an authorized account.</p>}
    {error && <p className="sa-alert" role="alert">{error}</p>}
    <fieldset disabled={busy}><div className="sa-field"><label htmlFor="sa-email">Email address</label><input id="sa-email" type="email" autoComplete="username" maxLength={254} required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "sa-email-error" : undefined} />{errors.email && <small id="sa-email-error" className="sa-field-error">{errors.email}</small>}</div>
    <PasswordField autoComplete="current-password" required maxLength={128} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} error={errors.password} />
    <button className="sa-primary" disabled={busy || session.status === "checking"}>{busy ? <><LoaderCircle size={18} className="spin" />Signing in…</> : <>Sign in securely <ArrowRight size={18} /></>}</button></fieldset>
    <p className="sa-auth-switch">Have an invitation? <Link to="/super-admin/register">Create your account</Link></p><p className="sa-auth-switch"><Link to="/login">Customer or seller sign-in</Link></p>
  </form></AdminAuthLayout>;
}
