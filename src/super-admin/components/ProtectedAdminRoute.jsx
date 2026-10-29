import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAdminSession } from "../hooks/useAdminSession.jsx";

export default function ProtectedAdminRoute() {
  const session = useAdminSession();
  const location = useLocation();
  if (session.status === "checking") return <main id="main-content" className="sa-session" role="status"><LoaderCircle className="spin" />Verifying your access…</main>;
  if (session.status === "error") return <main id="main-content" className="sa-session"><p role="alert">{session.message}</p><button className="button button-dark" onClick={session.retry}>Try again</button></main>;
  if (session.status !== "authorized") return <Navigate to="/super-admin/login" replace state={{ from: location.pathname, denied: session.status === "forbidden" }} />;
  return <Outlet />;
}
