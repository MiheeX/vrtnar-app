import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";

// Stran, na katero vodi povezava iz emaila za ponastavitev gesla.
// supabase-js iz URL-ja prebere recovery token in ustvari sejo, nato nastavimo novo geslo.
function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(!!session);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Geslo mora imeti vsaj 6 znakov.");
      return;
    }
    if (password !== confirm) {
      setError("Gesli se ne ujemata.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      navigate("/garden", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-700 mb-6 text-center">
          🌱 Novo geslo
        </h1>

        {checking ? (
          <p className="text-sm text-center text-gray-500">Preverjam povezavo...</p>
        ) : !hasSession ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-red-500">
              Povezava za ponastavitev gesla ni veljavna ali je potekla.
            </p>
            <Link to="/login" className="text-sm text-green-700 hover:underline">
              Nazaj na prijavo in pošlji novo povezavo
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Novo geslo"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
            />
            <input
              type="password"
              placeholder="Ponovi geslo"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
            />

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 text-white rounded-lg p-3 font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Shranjujem..." : "Shrani geslo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
