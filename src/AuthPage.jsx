import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Eye, EyeOff, Heart, LoaderCircle, LockKeyhole, Mail, PackageCheck, ShieldCheck, ShoppingBag, Sparkles, UserRound } from "lucide-react";
import { getErrorMessage } from "./api.js";
import { useShop } from "./ShopContext.jsx";
import { StatusMessage } from "./components.jsx";
import { authDestination, validateAuth } from "./authValidation.js";
import "./auth.css";

export default function AuthPage({ mode, seller = false }) {
  const { signIn, settings } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const isRegister = mode === "register";
  const [accountRole, setAccountRole] = useState(seller ? "seller" : "customer");
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState({ password: false, confirmPassword: false });
  const [imageFailed, setImageFailed] = useState(false);
  const validLength = values.password.length >= 8 && values.password.length <= 128;
  const passwordsMatch = Boolean(values.confirmPassword && values.password === values.confirmPassword);

  function change(name, value) {
    const updated = { ...values, [name]: value };
    setValues(updated);
    if (errors[name] || (name === "password" && errors.confirmPassword)) {
      const checked = validateAuth(updated, mode);
      setErrors((current) => ({ ...current, [name]: checked[name], ...(name === "password" ? { confirmPassword: checked.confirmPassword } : {}) }));
    }
    if (serverError) setServerError("");
  }

  function checkField(name) {
    const checked = validateAuth(values, mode);
    setErrors((current) => ({ ...current, [name]: checked[name] }));
  }

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    const checked = validateAuth(values, mode);
    setErrors(checked);
    setServerError("");
    if (Object.keys(checked).length) {
      formRef.current?.elements.namedItem(Object.keys(checked)[0])?.focus();
      return;
    }
    setLoading(true);
    try {
      const payload = { email: values.email.trim(), password: values.password, ...(isRegister ? { name: values.name.trim(), role: accountRole } : {}) };
      const account = await signIn(payload, mode);
      navigate(authDestination(account.role, location.state?.from), { replace: true });
    } catch (error) { setServerError(getErrorMessage(error)); }
    finally { setLoading(false); }
  }

  function input(name, { label, placeholder, Icon, type = "text", autoComplete, maxLength = 128 }) {
    const password = name === "password" || name === "confirmPassword";
    const id = `access-${name}`;
    const hint = isRegister && name === "password" ? "access-password-hint" : undefined;
    const describedBy = [errors[name] && `${id}-error`, hint].filter(Boolean).join(" ") || undefined;
    return <div className={`access-field ${errors[name] ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="access-input"><Icon size={17} aria-hidden="true" /><input id={id} name={name} value={values[name]} type={password ? visible[name] ? "text" : "password" : type} autoComplete={autoComplete} placeholder={placeholder} required maxLength={maxLength} aria-invalid={Boolean(errors[name])} aria-describedby={describedBy} onChange={(event) => change(name, event.target.value)} onBlur={() => checkField(name)} spellCheck={false} autoCapitalize={name === "email" || password ? "none" : "words"} />{password && <button type="button" className="access-password-toggle" aria-label={`${visible[name] ? "Hide" : "Show"} ${name === "confirmPassword" ? "confirmation password" : "password"}`} aria-pressed={visible[name]} aria-controls={id} onClick={() => setVisible((current) => ({ ...current, [name]: !current[name] }))}>{visible[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button>}{name === "confirmPassword" && passwordsMatch && !errors[name] && <Check size={17} className="access-field-check" aria-hidden="true" />}</div>
      {errors[name] && <span className="access-field-error" id={`${id}-error`} aria-live="polite">{errors[name]}</span>}
    </div>;
  }

  const brand = <><span className="access-brand-icon"><Sparkles size={20} /></span><span>{settings.siteName === "ShopSphere" ? <>shop<span>sphere</span></> : settings.siteName}</span></>;

  return <main id="main-content" className={`access-page ${isRegister ? "access-register" : "access-login"}`}>
    <header className="access-topbar"><Link className="access-brand" to="/" aria-label={`${settings.siteName} home`}>{brand}</Link><Link className="access-back" to="/"><ArrowLeft size={14} /><span>Back to the shop</span></Link></header>
    <div className="access-card">
      <section className="access-presentation" aria-labelledby="access-story-title">
        {!imageFailed && <img className="access-cover" src={settings.heroImage} alt="" onError={() => setImageFailed(true)} />}
        <div className="access-cover-shade" aria-hidden="true" />
        <div className="access-orbit orbit-a" aria-hidden="true" /><div className="access-orbit orbit-b" aria-hidden="true" />
        <div className="access-presentation-content"><span className="access-story-pill"><span />{isRegister ? "A GOOD PLACE TO BEGIN" : "YOUR EVERYDAY, ELEVATED"}</span><div className="access-story-copy"><span className="access-story-overline">THOUGHTFULLY FOUND. JUST FOR YOU.</span><h2 id="access-story-title">{isRegister ? <>Your next favorite<br />starts <em>right here.</em></> : <>All your good finds.<br /><em>One thoughtful space.</em></>}</h2><p>{isRegister ? "A place for your saved favorites, your latest orders, and all the little things that make life yours." : "Come back to the things you love. Your favorites and orders, ready whenever you are."}</p></div>
          <div className="access-story-note"><span className="access-note-icon">{isRegister ? <Sparkles size={22} /> : <Heart size={22} />}</span><div><strong>{isRegister ? "Make yourself at home." : "Good to have you back."}</strong><small>{isRegister ? "A little discovery. A lot to love." : "Your next good find is waiting."}</small></div><ArrowUpRight size={19} /></div>
          <div className="access-benefits"><span><Heart size={14} />Saved favorites</span><span><PackageCheck size={14} />Order tracking</span><span><ShoppingBag size={14} />Easy shopping</span></div>
        </div>
      </section>

      <section className="access-form-panel" aria-labelledby="access-title">
        <div className="access-form-content">
          <nav className="access-mode-switch" aria-label="Account options"><Link to="/login" state={location.state} aria-current={!isRegister ? "page" : undefined} className={!isRegister ? "selected" : ""} aria-disabled={loading} onClick={(event) => { if (loading) event.preventDefault(); }}>Sign in</Link><Link to="/register" state={location.state} aria-current={isRegister ? "page" : undefined} className={isRegister ? "selected" : ""} aria-disabled={loading} onClick={(event) => { if (loading) event.preventDefault(); }}>Create account</Link></nav>
          <div className="access-form-heading"><span className="access-heading-icon">{isRegister ? <UserRound size={20} /> : <LockKeyhole size={20} />}</span><span className="access-form-kicker">{isRegister ? "YOUR OWN LITTLE CORNER" : "YOUR ACCOUNT"}</span><h1 id="access-title">{isRegister ? "Create your account." : "Welcome back."}</h1><p>{isRegister ? "A few details, and you're part of the good things." : "Sign in to your orders, favorites and everyday finds."}</p></div>
          {serverError && <StatusMessage tone="error">{serverError}</StatusMessage>}
          <form ref={formRef} className="access-form" onSubmit={submit} noValidate aria-busy={loading}><fieldset disabled={loading}>
            {isRegister && <div className="access-field"><label htmlFor="account-role">Account type</label><select id="account-role" value={accountRole} onChange={(event) => setAccountRole(event.target.value)}><option value="customer">Customer — shop and track orders</option><option value="seller">Seller — list and sell your products</option></select><p className="access-password-hint">{accountRole === "seller" ? "Create your seller ID and start listing products from your seller dashboard." : "Choose Seller if you want to sell products."}</p></div>}
            {isRegister && input("name", { label: "Full name", placeholder: "Your full name", Icon: UserRound, autoComplete: "name", maxLength: 80 })}
            {input("email", { label: "Email address", placeholder: "you@example.com", Icon: Mail, type: "email", autoComplete: "email", maxLength: 254 })}
            {input("password", { label: "Password", placeholder: isRegister ? "Create a password" : "Enter your password", Icon: LockKeyhole, autoComplete: isRegister ? "new-password" : "current-password" })}
            {isRegister && <div id="access-password-hint" className={`access-password-hint ${validLength ? "is-valid" : ""}`}><span className="access-hint-dot">{validLength ? <Check size={10} /> : null}</span>Use 8–128 characters.</div>}
            {isRegister && input("confirmPassword", { label: "Confirm password", placeholder: "Re-enter your password", Icon: LockKeyhole, autoComplete: "new-password" })}
            <button className="button button-dark access-submit" disabled={loading}>{loading ? <><LoaderCircle size={17} className="access-spinner" />{isRegister ? "Creating your account..." : "Signing you in..."}</> : <>{isRegister ? "Create account" : "Sign in"}<ArrowRight size={17} /></>}</button>
          </fieldset></form>
          <p className="access-account-note">{isRegister ? "Already have an account?" : "New here?"} <Link to={isRegister ? "/login" : "/register"} state={location.state}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
          <p className="access-account-note"><Link to="/sell">Want to sell your products? Become a seller</Link></p>
          <div className="access-guest"><span>Just looking around?</span><Link to="/products">Explore the shop <ArrowUpRight size={14} /></Link></div>
          <p className="access-security"><ShieldCheck size={14} />Your account. Your orders. Your favorites.</p>
        </div>
      </section>
    </div>
    <footer className="access-footer"><span>© {new Date().getFullYear()} {settings.siteName}</span><span>Thoughtfully found. Ready for real life.</span><Link to="/products">Keep exploring <ArrowUpRight size={12} /></Link></footer>
  </main>;
}
