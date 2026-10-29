import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AdminSessionProvider } from "./hooks/useAdminSession.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import SuperAdminLogin from "./pages/SuperAdminLogin.jsx";
import SuperAdminRegister from "./pages/SuperAdminRegister.jsx";
import SuperAdminWorkspace from "./SuperAdminWorkspace.jsx";
import { navigation } from "./navigation.js";
import "./styles/super-admin.css";

function WorkspaceRoute() {
  const { section } = useParams();
  if (section === "admins") return <Navigate to="/super-admin/owners" replace />;
  return section === "dashboard" || navigation.some(([key]) => key === section) ? <SuperAdminWorkspace key={section} /> : <Navigate to="/super-admin/dashboard" replace />;
}
export default function SuperAdminRoutes() {
  return <AdminSessionProvider><Routes>
    <Route path="login" element={<SuperAdminLogin />} />
    <Route path="register" element={<SuperAdminRegister />} />
    <Route element={<ProtectedAdminRoute />}>
      <Route index element={<Navigate to="/super-admin/dashboard" replace />} />
      <Route path=":section" element={<WorkspaceRoute />} />
      <Route path="*" element={<Navigate to="/super-admin/dashboard" replace />} />
    </Route>
  </Routes></AdminSessionProvider>;
}
