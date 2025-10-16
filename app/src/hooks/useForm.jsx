import { useState } from "react";

export function useForm(initialState, validate) {
  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleBlur = () => {
    setErrors(validate(formData)); // 🔹 Valida cuando el usuario sale del input
  };

  return { formData, errors, handleChange, handleBlur, setErrors };
}
