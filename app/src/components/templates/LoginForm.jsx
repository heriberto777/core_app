import React from "react";
import { useLogin, Input, Button } from "../../index";
import { Helmet } from "react-helmet-async";
import LogoCatelli from "../../assets/LogoCatelli_Sin_Fondo.png";

/**
 * Corporate LoginForm (Tailwind Edition)
 * Experiencia de entrada con diseño Glassmorphism avanzado.
 */
export function LoginForm() {
  const {
    formData,
    errors,
    loading,
    message,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useLogin();

  const isError = message?.startsWith("Error:");

  return (
    <div className="flex justify-center items-center min-h-screen w-screen bg-slate-950 relative overflow-hidden">
      <Helmet>
        <title>Login - Catelli Core ERP</title>
      </Helmet>

      {/* BACKGROUND DECORATION */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_0%_0%,rgba(52,131,235,0.15)_0%,transparent_50%),radial-gradient(circle_at_100%_100%,rgba(144,70,255,0.1)_0%,transparent_50%)]" />
      </div>

      <div className="bg-slate-900/70 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[40px] p-10 md:p-14 w-full max-w-[460px] shadow-2xl flex flex-col items-center mx-4 z-10 animate-slideUp">
        {/* LOGO */}
        <div className="mb-8 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          <img src={LogoCatelli} alt="Catelli Logo" className="w-40 h-auto object-contain" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Bienvenido</h1>
          <p className="text-slate-400 font-medium">Ingresa tus credenciales para continuar</p>
        </div>

        {message && (
          <div className={`w-full p-4 rounded-2xl text-sm font-bold text-center mb-8 border animate-fadeIn ${isError
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            }`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="space-y-4">
            <Input
              label="Correo Electrónico"
              type="email"
              name="email"
              placeholder="ejemplo@catelli.com"
              value={formData.email}
              error={errors.email}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className="dark-input"
            />

            <Input
              label="Contraseña"
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              error={errors.password}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className="dark-input"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="w-full py-4 text-lg font-bold rounded-2xl shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Verificando...</span>
              </div>
            ) : "Iniciar Sesión"}
          </Button>
        </form>

        <footer className="mt-12 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
          &copy; {new Date().getFullYear()} CIGUADR
          <br />
          <span className="opacity-50 mt-1 block">Soluciones de Software de Alto Rendimiento</span>
        </footer>
      </div>

      <style>{`
        .dark-input label { color: rgba(255,255,255,0.6) !important; }
        .dark-input input { 
          background: rgba(15, 23, 42, 0.6) !important; 
          border-color: rgba(255, 255, 255, 0.1) !important; 
          color: white !important;
        }
        .dark-input input:focus {
          border-color: #4f46e5 !important;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1) !important;
        }
      `}</style>
    </div>
  );
}
