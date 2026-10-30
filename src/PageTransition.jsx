import { useLocation } from "react-router-dom";

export default function PageTransition({ children }) {
  const { pathname, search } = useLocation();
  const routeKey = `${pathname}${search}`;
  // Seller filters and sidebar sections share one workspace and its in-progress state.
  const contentKey = pathname === "/seller" ? pathname : routeKey;
  return <>
    <div key={`progress:${routeKey}`} className="navigation-progress" aria-hidden="true"><span /></div>
    <div key={contentKey} className="page-transition">{children}</div>
  </>;
}
