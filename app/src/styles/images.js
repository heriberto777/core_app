/**
 * styles/images.js
 * Centraliza todas las imágenes y assets estáticos de la aplicación.
 * Separado de tokens e iconos para facilitar el reemplazo de assets.
 *
 * Refactor de variables.jsx: las imágenes ahora tienen su propio módulo.
 */
import logo from "../assets/Catelli_Logo_C.jpg";
import logoLetra from "../assets/LogoCatelli_Sin_Fondo.png";
import imagenFondo from "../assets/catelli_frontal.png";

// Avatares de usuario
import imgHackerUser from "../assets/hacker.png";
import imgRabbitUser from "../assets/rabbit.png";
import imgDogUser from "../assets/dog.png";

// Imágenes de módulos
import imgDespacho from "../assets/carga-de-archivos_64.png";
import imgVentas from "../assets/etiqueta-de-venta.png";
import imgFacturacion from "../assets/nuevas-tecnologias.png";
import imgContabilidad from "../assets/contabilidad_64.png";
import imgUsuarios from "../assets/nino.png";

export const Images = {
    // Branding
    logo,
    logoLetra,
    fondoPrincipal: imagenFondo,

    // Avatares de usuario
    avatarHacker: imgHackerUser,
    avatarRabbit: imgRabbitUser,
    avatarDog: imgDogUser,

    // Módulos del sistema
    moduleDespacho: imgDespacho,
    moduleVentas: imgVentas,
    moduleFacturacion: imgFacturacion,
    moduleContabilidad: imgContabilidad,
    moduleUsuarios: imgUsuarios,
};
