export function validateForm(formData) {
  let errors = {};

  if (!formData.email) {
    errors.email = "El email es obligatorio";
  } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
    errors.email = "Formato de email inválido";
  }

  if (!formData.password) {
    errors.password = "La contraseña es obligatoria";
  } else if (formData.password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres";
  }

  return errors;
}
