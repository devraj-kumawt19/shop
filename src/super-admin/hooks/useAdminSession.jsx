import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useShop } from "../../ShopContext.jsx";
import { getErrorMessage } from "../../api.js";
import superAdminApi from "../services/superAdminApi.js";

const AdminSession = createContext(null);
export function AdminSessionProvider({ children }) {
  const { user, refreshUser } = useShop();
  const { pathname } = useLocation();
  const token = localStorage.getItem("luxecarts_token");
  const [revision, setRevision] = useState(0);
  const [session, setSession] = useState({ status: "checking" });
  useEffect(() => {
    if (!token) { setSession({ status: "anonymous", token, pathname }); return; }
    const controller = new AbortController();
    superAdminApi.me({ signal: controller.signal }).then(({ data }) => {
      setSession({ status: data.user.role === "superadmin" ? "authorized" : "forbidden", user: data.user, token, pathname });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if ([401, 403].includes(error.response?.status)) { refreshUser(); setSession({ status: "anonymous", token, pathname }); }
      else setSession({ status: "error", message: getErrorMessage(error), token, pathname });
    });
    return () => controller.abort();
  }, [token, pathname, user?.id, revision, refreshUser]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("super-admin-session-check", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("super-admin-session-check", refresh); };
  }, []);
  const current = session.token === token && session.pathname === pathname ? session : { status: "checking" };
  return <AdminSession.Provider value={{ ...current, retry: () => setRevision((value) => value + 1) }}>{children}</AdminSession.Provider>;
}
export const useAdminSession = () => useContext(AdminSession);
