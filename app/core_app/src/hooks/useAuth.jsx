import { useContext } from "react";
import { AuthContext } from "../index";

export const useAuth = () => useContext(AuthContext);
