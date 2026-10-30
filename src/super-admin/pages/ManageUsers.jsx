import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import InviteAdminForm from "../components/InviteAdminForm.jsx";
import { adminPermissionOptions } from "../../../server/super-admin/permissions.js";

function AdminPermissionEditor({ account, busy, updateUser }) {
  const [permissions, setPermissions] = useState(account.permissions || []);
  useEffect(() => setPermissions(account.permissions || []), [account._id, account.permissions]);
  const samePermissions = permissions.length === (account.permissions || []).length
    && permissions.every((permission) => (account.permissions || []).includes(permission));
  return <details className="staff-permissions">
    <summary>Permissions ({permissions.length})</summary>
    <fieldset disabled={busy}>
      {adminPermissionOptions.map(({ value, label }) => <label key={value}><input type="checkbox" checked={permissions.includes(value)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, value] : current.filter((permission) => permission !== value))} />{label}</label>)}
      <button type="button" className="button button-dark" disabled={busy || samePermissions} onClick={() => updateUser(account, { permissions })}>Save permissions</button>
      <p>Saving permissions signs this administrator out. New access takes effect after they sign in again.</p>
    </fieldset>
  </details>;
}

export default function ManageUsers({ owners = false, user, sellerDetails, setSellerDetails, createSeller, busy, searchInput, setSearchInput, setSearch, page, setPage, loading, data, updateUser, roleFilter, setRoleFilter, statusFilter, setStatusFilter }) {
  return <section className="control-panel">
          <div className="control-panel-heading"><div><h2>{owners ? "Super Admin access" : "People & access"}</h2><p>Owners manage the website. Admins manage sellers and the catalog. Sellers manage their own listings.</p></div></div>
          {!owners && <form className="control-panel" onSubmit={createSeller}>
            <h3>Create {sellerDetails.role === "admin" ? "an admin" : "a seller"} account</h3>
            <p className="settings-help">Sellers can publish and manage their own products. Admins manage sellers and the catalog. Share sign-in details securely.</p>
            <div className="control-form-grid">
              {user?.role === "superadmin" && <label>Account role<select value={sellerDetails.role || "seller"} onChange={(event) => setSellerDetails((current) => ({ ...current, role: event.target.value, permissions: event.target.value === "admin" ? current.permissions || [] : [] }))}><option value="seller">Seller</option><option value="admin">Admin</option></select></label>}
              <label>Full name<input value={sellerDetails.name} onChange={(event) => setSellerDetails((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={80} required /></label>
              <label>Email address<input type="email" autoComplete="email" value={sellerDetails.email} onChange={(event) => setSellerDetails((current) => ({ ...current, email: event.target.value }))} maxLength={254} required /></label>
              <label>Password<input type="password" autoComplete="new-password" value={sellerDetails.password} onChange={(event) => setSellerDetails((current) => ({ ...current, password: event.target.value }))} minLength={12} maxLength={128} required /><small>Use at least 12 characters. Share it securely.</small></label>
            </div>
            {user?.role === "superadmin" && sellerDetails.role === "admin" && <fieldset className="staff-permissions staff-permissions-create"><legend>Admin permissions</legend>{adminPermissionOptions.map(({ value, label }) => <label key={value}><input type="checkbox" checked={(sellerDetails.permissions || []).includes(value)} onChange={(event) => setSellerDetails((current) => ({ ...current, permissions: event.target.checked ? [...(current.permissions || []), value] : (current.permissions || []).filter((permission) => permission !== value) }))} />{label}</label>)}</fieldset>}
            <button className="button button-dark" disabled={busy}>Create {sellerDetails.role === "admin" ? "admin" : "seller"} account</button>
          </form>}
          {owners && <InviteAdminForm />}
          <div className="sa-filters"><label>Role<select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option value="">All roles</option>{(owners ? ["superadmin"] : (user?.role === "superadmin" ? ["customer", "seller", "admin", "superadmin"] : ["customer", "seller"])).map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option></select></label></div>
          <form className="control-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}><Search size={17} /><input aria-label="Search users by name or email" placeholder="Search by name or email..." value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><button disabled={loading}>Search</button></form>
          {data && <><div className="control-table-wrap"><table className="control-table"><thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>ACCESS</th></tr></thead><tbody>{data.users.map((account) => { const protectedAccount = account.role === "superadmin" || account._id === user?.id; return <tr key={account._id}><td><div className="control-person"><span>{account.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.name}</strong><small>{account.email}</small></div></div></td><td>{protectedAccount ? <span className="role-badge">{account.role === "superadmin" ? "Super admin" : account.role}</span> : <select aria-label={`Role for ${account.name}`} value={account.role} disabled={busy} onChange={(event) => updateUser(account, { role: event.target.value })}><option value="customer">Customer</option><option value="seller">Seller</option>{user?.role === "superadmin" && <option value="admin">Admin</option>}</select>}</td><td><span className={`control-status ${account.isActive === false ? "blocked" : "active"}`}>{account.isActive === false ? "Blocked" : "Active"}</span></td><td>{new Date(account.createdAt).toLocaleDateString("en-IN")}</td><td>{protectedAccount ? <span className="protected-account"><ShieldCheck size={13} /> Protected</span> : <>{account.role === "admin" && user?.role === "superadmin" && <AdminPermissionEditor account={account} busy={busy} updateUser={updateUser} />}<button className={account.isActive === false ? "unblock-action" : "block-action"} disabled={busy} onClick={() => updateUser(account, { isActive: account.isActive === false })}>{account.isActive === false ? "Unblock" : "Block account"}</button></>}</td></tr>; })}</tbody></table></div>{!data.users.length && <p className="control-empty">No accounts match your search.</p>}<div className="control-pagination"><span>{data.total} accounts · Page {page} of {Math.max(1, data.pages)}</span><div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button><button aria-label="Next page" disabled={page >= data.pages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div></>}
        </section>;
}
