import { v } from "../styles/variables";
export const DesplegableUser = [
  {
    text: "Mi perfil",
    icono: v.iconoUser,
    tipo: "miperfil",
  },
  // {
  //   text: "Configuracion",
  //   icono: v.iconoSettings,
  //   tipo: "configuracion",
  // },
  {
    text: "Cerrar sesión",
    icono: v.iconoCerrarSesion,
    tipo: "cerrarsesion",
  },
];

// TODO: data SIDEBAR
export const LinkArray = [
  {
    label: "Inicio",
    icon: <v.iconoInicio />,
    to: "/",
    roles: ["admin"],
  },
  {
    label: "Tareas",
    icon: <v.iconoTask />,
    to: "/tasks",
    roles: ["admin"],
  },
  {
    label: "Cargas",
    icon: <v.iconoLoads />,
    to: "/loads",
    roles: ["admin"],
  },
  {
    label: "Receptores de correo",
    icon: <v.iconoCorreo />,
    to: "/email-recipients",
    roles: ["admin"],
  },
  {
    label: "Resumen de Carga",
    icon: <v.iconoResumen />,
    to: "/summaries",
    roles: ["admin"],
  },
  // {
  //   label: "Usuarios",
  //   icon: <v.iconoUser />,
  //   to: "/usuarios",
  //   roles: ["admin"],
  // },
];

export const SecondarylinksArray = [
  // {
  //   label: "Configuración",
  //   icon: <AiOutlineSetting />,
  //   to: "/admin",
  //   roles: ["admin"],
  // },
  // {
  //   label: "Acerca de",
  //   icon: <v.iconoayuda />,
  //   to: "/admin",
  //   roles: ["admin"],
  // },
  {
    label: "Salir",
    icon: <v.iconoCerrarSesion />,
    to: false,
    roles: ["admin"],
  },
];

//TODO: temas
export const TemasData = [
  {
    icono: "🌞",
    descripcion: "light",
  },
  {
    icono: "🌚",
    descripcion: "dark",
  },
];
