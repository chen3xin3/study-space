import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { readRestorableRoute, rememberRoute } from "./route-session";

export function RouteSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const saved = readRestorableRoute(window.localStorage, location.pathname);
      if (saved) {
        navigate(saved, { replace: true });
        return;
      }
    }
    rememberRoute(window.localStorage, location.pathname);
  }, [location.pathname, navigate]);

  return null;
}
