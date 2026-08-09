import React from "react";
import { useLogin, Input, Button } from "../../index";
import { Helmet } from "react-helmet-async";
import LogoCatelli from "../../assets/LogoCatelli_Sin_Fondo.png";

/**
 * LoginForm (dirección "Grid")
 * Pantalla de entrada alineada al resto de la app: fondo claro,
 * tarjeta con borde fino, esquinas precisas, acento azul único.
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
    // min-h-dvh (no min-h-screen/100vh): en móvil, 100vh se mide con la
    // barra de direcciones oculta, así que el contenedor queda más alto
    // que el área realmente visible y el card centrado termina fuera de
    // pantalla sin poder hacer scroll — se ve como una página en blanco.
    // dvh sí recalcula con el viewport visible real.
    <div className="flex justify-center items-center min-h-dvh w-full bg-slate-50">
      <Helmet>
        <title>Login - Catelli Core ERP</title>
      </Helmet>

      <div className="bg-white border border-slate-200 shadow-xl p-10 md:p-12 w-full max-w-[420px] flex flex-col items-center mx-4">
        {/* LOGO */}
        <div className="mb-8">
          <img src={LogoCatelli} alt="Catelli Logo" className="w-36 h-auto object-contain" />
        </div>

        <div className="text-center mb-10 w-full">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5">Bienvenido</h1>
          <p className="text-slate-500 text-sm font-medium">Ingresa tus credenciales para continuar</p>
        </div>

        {message && (
          <div className={`w-full px-4 py-3 text-sm font-semibold text-center mb-8 border animate-fadeIn ${isError
            ? "bg-red-50 border-red-200 text-red-600"
            : "bg-emerald-50 border-emerald-200 text-emerald-600"
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
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="w-full py-3 text-sm"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verificando...</span>
              </div>
            ) : "Iniciar Sesión"}
          </Button>
        </form>

        <footer className="mt-12 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
          &copy; {new Date().getFullYear()} CIGUADR
          <br />
          <span className="opacity-70 mt-1 block">Soluciones de Software de Alto Rendimiento</span>
        </footer>
      </div>
    </div>
  );
}
