import { useState } from "react";
import { useAuth } from "../index";
import { validateForm } from "../utils/index";
import Swal from "sweetalert2";

export function useLogin() {
    const { login } = useAuth();
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleBlur = (e) => {
        const { name } = e.target;
        const validationErrors = validateForm(formData);
        if (validationErrors[name]) {
            setErrors(prev => ({ ...prev, [name]: validationErrors[name] }));
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        const validationErrors = validateForm(formData);
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length > 0) {
            Swal.fire({
                icon: "warning",
                title: "Formulario Incompleto",
                text: "Por favor, completa todos los campos requeridos.",
                background: "rgba(255, 255, 255, 0.9)",
                backdrop: "rgba(0,0,0,0.4)"
            });
            return { ok: false };
        }

        try {
            setLoading(true);
            setMessage("");

            const result = await login(formData);

            if (result?.ok) {
                setMessage("Acceso autorizado. Redirigiendo...");
                return { ok: true };
            } else {
                throw new Error(result?.error || "Credenciales inválidas");
            }
        } catch (error) {
            const errorMessage = error.message || "Error al iniciar sesión";

            Swal.fire({
                icon: "error",
                title: "Error de Autenticación",
                text: errorMessage,
                confirmButtonText: "Intentar nuevamente",
                background: "rgba(255, 255, 255, 0.9)",
                confirmButtonColor: "#4facfe"
            });

            setMessage(`Error: ${errorMessage}`);
            return { ok: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    return {
        formData,
        errors,
        loading,
        message,
        handleChange,
        handleBlur,
        handleSubmit
    };
}
