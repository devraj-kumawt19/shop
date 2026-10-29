import AdminSidebar from "../components/AdminSidebar.jsx";
import AdminNavbar from "../components/AdminNavbar.jsx";

export default function SuperAdminLayout({ title, children }) {
  return <div className="control-layout"><AdminSidebar /><main id="main-content" className="control-main"><AdminNavbar title={title} /><div className="control-body">{children}</div></main></div>;
}
