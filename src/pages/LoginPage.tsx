import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      navigate("/garden");
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
    } else {
      setError("Preveri email za potrditev registracije!");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-700 mb-6 text-center">
          🌱 Vrtnar
        </h1>

        <form className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
          />
          <input
            type="password"
            placeholder="Geslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="bg-green-600 text-white rounded-lg p-3 font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Nalagam..." : "Prijava"}
          </button>

          <button
            onClick={handleRegister}
            disabled={loading}
            className="border border-green-600 text-green-600 rounded-lg p-3 font-semibold hover:bg-green-50 disabled:opacity-50"
          >
            Registracija
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
