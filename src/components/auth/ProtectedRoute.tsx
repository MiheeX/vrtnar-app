import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
      setLoading(false);
    });
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">🌱</div>
    );
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default ProtectedRoute;
