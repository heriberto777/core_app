/**
 * variables.jsx — Retrocompatibilidad
 *
 * Este archivo existía con el objeto `v` que mezclaba tokens, iconos e imágenes.
 * Ahora están separados en:
 *   - styles/tokens.js   → Spacing, Colors, Typography, Breakpoints
 *   - styles/icons.js    → Icons
 *   - styles/images.js   → Images
 *
 * El objeto `v` se mantiene aquí para no romper los componentes existentes
 * que aún lo importan. Ir migrando gradualmente a los nuevos módulos.
 *
 * @deprecated Preferir importar desde tokens.js, icons.js e images.js directamente.
 */
export { Icons } from "./icons";
export { Images } from "./images";
export { Spacing, Colors, Typography, Breakpoints, BorderRadius, Sidebar, Shadows } from "./tokens";

// ---- Objeto `v` legacy para retrocompatibilidad con imports existentes ----
import { Icons } from "./icons";
import { Images } from "./images";
import { Spacing, Colors, Typography, Breakpoints, BorderRadius, Sidebar, Shadows } from "./tokens";

export const v = {
  // Espaciado
  smSpacing: Spacing.sm,
  mdSpacing: Spacing.md,
  lgSpacing: Spacing.lg,
  xlSpacing: Spacing.xl,
  xxlSpacing: Spacing.xxl,

  // Sidebar
  sidebarWidth: Sidebar.width,
  sidebarWidthInitial: Sidebar.widthCollapsed,

  // Bordes
  borderRadius: BorderRadius.base,

  // Tipografía (legacy)
  font16px: Typography.base,

  // Breakpoints
  bpmaggie: Breakpoints.maggie,
  bplisa: Breakpoints.lisa,
  bpbart: Breakpoints.bart,
  bpmarge: Breakpoints.marge,
  bphomer: Breakpoints.homer,

  // Colores legacy
  colorPrincipal: Colors.primary,
  colorSecundario: Colors.secondary,
  colorIngresos: Colors.income,
  colorbgingresos: Colors.incomeBg,
  colorGastos: Colors.expense,
  colorbgGastos: Colors.expenseBg,
  colorError: Colors.danger,
  colorExito: "#9046FF",
  verde: Colors.success,
  rojo: Colors.danger,

  // Sombras
  boxshadowGray: `box-shadow: ${Shadows.gray}; -webkit-box-shadow: ${Shadows.gray}; -moz-box-shadow: ${Shadows.gray};`,

  // Iconos (mapeo desde Icons para retrocompatibilidad)
  paletacolores: Icons.palette,
  emoji: Icons.emoji,
  iconeditarTabla: Icons.edit,
  iconeliminarTabla: Icons.delete,
  agregar: Icons.add,
  iconoguardar: Icons.save,
  iconocerrar: Icons.close,
  iconoayuda: Icons.help,
  iconeyes: Icons.eyes,
  iconoFlechabajo: Icons.arrowDown,
  iconoflechaderecha: Icons.arrowRight,
  flechaabajolarga: Icons.arrowDownLong,
  flechaarribalarga: Icons.arrowUpLong,
  iconocorona: Icons.crown,
  iconoUser: Icons.user,
  iconoGestion: Icons.userGroup,
  iconoCerrarSesion: Icons.exitApp,
  iconofotovacia: Icons.photoEmpty,
  iconSetting: Icons.settingsAlt,
  iconoSettings: Icons.settings,
  iconoTask: Icons.task,
  iconoLoads: Icons.loads,
  iconoNachero: Icons.book,
  iconoDevolucion: Icons.devolution,
  iconoCaja: Icons.cashRegister,
  iconoInicio: Icons.home,
  iconoCorreo: Icons.email,
  iconoResumen: Icons.checkSquare,
  iconoDocument: Icons.document,
  balance: Icons.balance,
  iconoContabilidad: Icons.accounting,
  iconopie: Icons.chartPie,
  iconolineal: Icons.chartLine,
  iconobars: Icons.chartBars,
  iconocalculadora: Icons.calculator,
  iconocheck: Icons.calendarCheck,
  iconoreact: Icons.react,
  iconosupabase: Icons.supabase,
  iconogoogle: Icons.google,

  // Imágenes (desde Images)
  logo: Images.logo,
  logoLetra: Images.logoLetra,
  imagenfondo: Images.fondoPrincipal,
  imgHackerUser: Images.avatarHacker,
  imgRabbitUser: Images.avatarRabbit,
  imgDogUser: Images.avatarDog,
  imgDespacho: Images.moduleDespacho,
  imgVentas: Images.moduleVentas,
  imgFacturacion: Images.moduleFacturacion,
  imgContabilidad: Images.moduleContabilidad,
  imgUsuarios: Images.moduleUsuarios,
};
