import React, { useState } from "react";
import styled from "styled-components";
import { useForm,  useAuth } from "../../index";
import { AuthApi } from "../../api/index";
import { validateForm } from "../../utils/index";
import Swal from "sweetalert2";
import { Helmet } from "react-helmet-async";

const authController = new AuthApi();

export function LoginForm() {
  const { login } = useAuth();
  const { formData, errors, handleChange, handleBlur, setErrors } = useForm(
    { email: "", password: "" },
    validateForm
  );

  console.log(formData);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      Swal.fire({
        icon: "warning",
        title: "Formulario Incompleto",
        text: "Por favor, completa todos los campos requeridos.",
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(""); // Limpiar mensajes previos

      console.log("🎯 Iniciando login desde formulario...");

      // ⭐ USAR LA FUNCIÓN LOGIN DEL CONTEXTO Y VERIFICAR RESULTADO ⭐
      const result = await login(formData);

      if (result?.success) {
        console.log("✅ Login exitoso desde formulario");
        setMessage("Acceso autorizado. Redirigiendo...");
        // El usuario será redirigido automáticamente por el AdminRouter
      } else {
        // ⭐ MANEJAR CASO DONDE NO HAY EXCEPCIÓN PERO EL LOGIN FALLÓ ⭐
        throw new Error(result?.error || "Error desconocido en el login");
      }
    } catch (error) {
      console.error("❌ Error en login desde formulario:", error);

      // ⭐ MOSTRAR ERROR ESPECÍFICO AL USUARIO ⭐
      Swal.fire({
        icon: "error",
        title: "Error de Autenticación",
        text: error.message || "Error al iniciar sesión",
        confirmButtonText: "Intentar nuevamente",
      });

      // ⭐ TAMBIÉN MOSTRAR EN INTERFAZ PARA MEJOR UX ⭐
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Helmet>
        <title>Login - Sistema Core ERP </title>
      </Helmet>
      <FormWrapper>
        <Title>Iniciar Sesión</Title>
        {message && (
          <Message error={message.startsWith("Error:")}>{message}</Message>
        )}
        <Form onSubmit={handleSubmit}>
          <Label>Email</Label>
          <Input
            type="email"
            name="email"
            placeholder="Ingrese su correo"
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.email && <ErrorText>{errors.email}</ErrorText>}

          <Label>Contraseña</Label>
          <Input
            type="password"
            name="password"
            placeholder="Ingrese su contraseña"
            value={formData.password}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.password && <ErrorText>{errors.password}</ErrorText>}

          <Button type="submit" disabled={loading}>
            {loading ? "Cargando..." : "Iniciar Sesión"}
          </Button>
        </Form>
      </FormWrapper>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: linear-gradient(to right, #4facfe, #00f2fe);
`;

const FormWrapper = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 10px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 400px;
  text-align: center;
`;

const Title = styled.h2`
  color: #333;
  margin-bottom: 1rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  text-align: left;
  margin-top: 10px;
  font-weight: bold;
`;

const Input = styled.input`
  padding: 10px;
  margin: 5px 0 15px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 16px;
  width: 100%;

  @media (max-width: 480px) {
    padding: 12px; /* Inputs más grandes en móviles pequeños */
    margin: 4px 0 12px;
  }
`;

const Button = styled.button`
  background: #4facfe;
  color: white;
  padding: 10px;
  border: none;
  border-radius: 5px;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.3s;

  &:hover {
    background: #00c6fb;
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    padding: 12px; /* Botones más grandes en móviles */
    font-size: 16px; /* Texto más grande para mejor tap target */
  }
`;

const ErrorText = styled.p`
  color: red;
  font-size: 14px;
  margin: -10px 0 10px;
`;

const Message = styled.div`
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;

  ${(props) =>
    props.error
      ? `
    background-color: #fee;
    color: #c53030;
    border: 1px solid #fc8181;
  `
      : `
    background-color: #f0fff4;
    color: #2f855a;
    border: 1px solid #9ae6b4;
  `}
`;
