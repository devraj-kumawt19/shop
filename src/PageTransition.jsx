import { useLocation } from "react-router-dom";

export default function PageTransition({ children }) {
  const { pathname, search } = useLocation();
  const routeKey = `${pathname}${search}`;
  return <>
    <div key={`progress:${routeKey}`} className="navigation-progress" aria-hidden="true"><span /></div>
    <div key={routeKey} className="page-transition">{children}</div>
  </>;
}
