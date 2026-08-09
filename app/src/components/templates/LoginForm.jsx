import React, { useState } from "react";
import { useLogin, Input, Button } from "../../index";
import { Helmet } from "react-helmet-async";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaExclamationCircle, FaCheckCircle } from "react-icons/fa";
import LogoCatelli from "../../assets/LogoCatelli_Sin_Fondo.png";

/**
 * LoginForm — panel de marca + formulario.
 * min-h-dvh (no min-h-screen/100vh): en móvil, 100vh se mide con la
 * barra de direcciones oculta, así que el contenedor queda más alto
 * que el área realmente visible y el contenido termina fuera de
 * pantalla sin poder hacer scroll — se ve como una página en blanco.
 * dvh sí recalcula con el viewport visible real.
 */
export function LoginForm() {
  const {
    formData,
    errors,
    loading,
    status,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useLogin();

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-dvh w-full bg-slate-50">
      <Helmet>
        <title>Login - Catelli Core ERP</title>
      </Helmet>

      {/* PANEL DE MARCA — solo en pantallas grandes */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 flex-col justify-between p-14 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
        <div className="relative">
          <img src={LogoCatelli} alt="Catelli Logo" className="w-40 h-auto object-contain brightness-0 invert" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold tracking-tight leading-tight mb-3">
            Catelli Core ERP
          </h2>
          <p className="text-primary-100 text-base leading-relaxed">
            Plataforma central de gestión logística: cargas, traspasos y tareas de transferencia en un solo lugar.
          </p>
        </div>
        <p className="relative text-[11px] font-semibold text-primary-200 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} CIGUADR — Soluciones de Software de Alto Rendimiento
        </p>
      </div>

      {/* PANEL DE FORMULARIO */}
      <div className="flex flex-1 flex-col justify-center items-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex justify-center mb-8">
            <img src={LogoCatelli} alt="Catelli Logo" className="w-32 h-auto object-contain" />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5">Bienvenido</h1>
            <p className="text-slate-500 text-sm font-medium">Ingresa tus credenciales para continuar</p>
          </div>

          {status && (
            <div
              role="alert"
              className={`flex items-start gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-medium mb-6 border animate-fadeIn ${
                status.type === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              {status.type === "error" ? (
                <FaExclamationCircle className="mt-0.5 shrink-0" />
              ) : (
                <FaCheckCircle className="mt-0.5 shrink-0" />
              )}
              <span>{status.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
            <Input
              label="Correo Electrónico"
              type="email"
              name="email"
              icon={FaEnvelope}
              placeholder="ejemplo@catelli.com"
              value={formData.email}
              error={errors.email}
              onChange={handleChange}
              onBlur={handleBlur}
              autoComplete="email"
              required
            />

            <Input
              label="Contraseña"
              type={showPassword ? "text" : "password"}
              name="password"
              icon={FaLock}
              placeholder="••••••••"
              value={formData.password}
              error={errors.password}
              onChange={handleChange}
              onBlur={handleBlur}
              autoComplete="current-password"
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                </button>
              }
            />

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
              {loading ? "Verificando..." : "Iniciar Sesión"}
            </Button>
          </form>

          <footer className="lg:hidden mt-12 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
            &copy; {new Date().getFullYear()} CIGUADR
            <br />
            <span className="opacity-70 mt-1 block">Soluciones de Software de Alto Rendimiento</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
