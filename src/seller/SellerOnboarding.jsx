import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShop } from "../ShopContext.jsx";
import { getErrorMessage } from "../api.js";
import { StatusMessage } from "../components.jsx";

export default function SellerOnboarding() {
  const { user, signIn } = useShop();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function becomeSeller() {
    setBusy(true); setError("");
    try { await signIn({}, "register", "/auth/become-seller"); navigate("/seller"); }
    catch (error) { setError(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  const workspace = user?.role === "superadmin" ? "/super-admin/dashboard" : "/seller";
  return <main id="main-content" className="page-width account-page">
    <span className="eyebrow">SELL WITH US</span><h1>Turn your products into <em>good finds.</em></h1>
    <p>Create your own seller ID, publish products, set prices and manage your stock from one dashboard.</p>
    <div className="control-panel"><h2>Your store, your listings</h2><ol><li>Register with your name, email and password.</li><li>Add products with photos, prices, categories and available stock.</li><li>Sign in any time to update your own listings.</li></ol>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {!user ? <><Link className="button button-dark" to="/seller/register">Create seller account</Link><p>Already registered? <Link to="/login" state={{ from: "/seller" }}>Sign in</Link>. Have a customer account? Sign in first to use it for selling.</p></> : user.role === "customer" ? <><p>Your existing account and order history stay with you when you become a seller.</p><button className="button button-dark" disabled={busy} onClick={becomeSeller}>{busy ? "Creating seller access..." : "Become a seller with this account"}</button></> : <Link className="button button-dark" to={workspace}>Open your dashboard</Link>}
    </div>
  </main>;
}
