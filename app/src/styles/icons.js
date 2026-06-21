/**
 * styles/icons.js
 * Centraliza todos los iconos usados en la aplicación.
 * Separado de tokens de diseño e imágenes para facilitar tree-shaking.
 *
 * Refactor de variables.jsx: los iconos ahora tienen su propio módulo.
 */
import { CiPalette } from "react-icons/ci";
import { BsEmojiLaughing, BsArrowDown, BsArrowUpShort, BsGoogle, BsQuestionCircle, BsBarChartLine, BsCalendarCheck } from "react-icons/bs";
import { RiDeleteBin2Line, RiEditLine, RiVipCrownFill, RiSettings3Line, RiCloseLine } from "react-icons/ri";
import { IoIosArrowDown, IoIosArrowForward } from "react-icons/io";
import { BiUserCircle, BiSave } from "react-icons/bi";
import { MdExitToApp, MdOutlineAttachMoney } from "react-icons/md";
import { FcPicture } from "react-icons/fc";
import { CgMathPlus } from "react-icons/cg";
import { TbBrandSupabase } from "react-icons/tb";
import { HiOutlineChartPie } from "react-icons/hi";
import { SlGraph } from "react-icons/sl";
import { AiOutlineCalculator } from "react-icons/ai";
import {
    FaReact,
    FaTruck,
    FaBookReader,
    FaHome,
    FaRegEye,
    FaUserFriends,
    FaUndo,
    FaCashRegister,
    FaTasks,
    FaEnvelope,
    FaTruckLoading,
    FaCheckSquare,
    FaFileAlt,
    FaCog,
    FaBalanceScale,
} from "react-icons/fa";

export const Icons = {
    // Acciones de tabla
    palette: CiPalette,
    emoji: BsEmojiLaughing,
    edit: RiEditLine,
    delete: RiDeleteBin2Line,
    add: CgMathPlus,
    save: BiSave,
    close: RiCloseLine,
    help: BsQuestionCircle,
    eyes: FaRegEye,

    // Navegación
    arrowDown: IoIosArrowDown,
    arrowRight: IoIosArrowForward,
    arrowDownLong: BsArrowDown,
    arrowUpLong: BsArrowUpShort,

    // Usuario y sesión
    crown: RiVipCrownFill,
    user: BiUserCircle,
    userGroup: FaUserFriends,
    exitApp: MdExitToApp,
    photoEmpty: FcPicture,

    // Configuración
    settings: RiSettings3Line,
    settingsAlt: FaCog,

    // Módulos del sistema
    task: FaTasks,
    loads: FaTruckLoading,
    truck: FaTruck,
    home: FaHome,
    email: FaEnvelope,
    devolution: FaUndo,
    cashRegister: FaCashRegister,
    document: FaFileAlt,
    checkSquare: FaCheckSquare,
    book: FaBookReader,
    balance: FaBalanceScale,
    accounting: MdOutlineAttachMoney,

    // Analytics
    chartPie: HiOutlineChartPie,
    chartLine: SlGraph,
    chartBars: BsBarChartLine,
    calculator: AiOutlineCalculator,
    calendarCheck: BsCalendarCheck,

    // Tecnología (decorativos)
    react: FaReact,
    supabase: TbBrandSupabase,
    google: BsGoogle,
};
