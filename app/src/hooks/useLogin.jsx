import { useState } from "react";
import { useAuth } from "../index";
import { validateForm } from "../utils/index";

export function useLogin() {
    const { login } = useAuth();
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null); // { type: "error" | "success", text: string }

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
            setStatus({ type: "error", text: "Completa todos los campos requeridos." });
            return { ok: false };
        }

        try {
            setLoading(true);
            setStatus(null);

            const result = await login(formData);

            if (result?.ok) {
                setStatus({ type: "success", text: "Acceso autorizado. Redirigiendo..." });
                return { ok: true };
            } else {
                throw new Error(result?.error || "Credenciales inválidas");
            }
        } catch (error) {
            const errorMessage = error.message || "Error al iniciar sesión";
            setStatus({ type: "error", text: errorMessage });
            return { ok: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    return {
        formData,
        errors,
        loading,
        status,
        handleChange,
        handleBlur,
        handleSubmit
    };
}
