import React from "react";
import styled from "styled-components";
import { useLogin, Input, Button } from "../../index";
import { Helmet } from "react-helmet-async";
import LogoCatelli from "../../assets/LogoCatelli_Sin_Fondo.png";

export function LoginForm() {
  const {
    formData,
    errors,
    loading,
    message,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useLogin();

  const isError = message?.startsWith("Error:");

  return (
    <Container>
      <Helmet>
        <title>Login - Catelli Core ERP</title>
      </Helmet>

      <GlassCard>
        <LogoWrapper>
          <Logo src={LogoCatelli} alt="Catelli Logo" />
        </LogoWrapper>

        <Title>Bienvenido</Title>
        <Subtitle>Ingresa tus credenciales para continuar</Subtitle>

        {message && (
          <StatusMessage error={isError}>
            {message}
          </StatusMessage>
        )}

        <Form onSubmit={handleSubmit}>
          <Input
            label="Correo Electrónico"
            type="email"
            name="email"
            placeholder="ejemplo@catelli.com"
            value={formData.email}
            error={errors.email}
            onChange={handleChange}
            onBlur={handleBlur}
            required
          />

          <Input
            label="Contraseña"
            type="password"
            name="password"
            placeholder="••••••••"
            value={formData.password}
            error={errors.password}
            onChange={handleChange}
            onBlur={handleBlur}
            required
          />

          <SubmitButton
            type="submit"
            variant="primary"
            disabled={loading}
          >
            {loading ? "Verificando..." : "Iniciar Sesión"}
          </SubmitButton>
        </Form>

        <Footer>
          &copy; {new Date().getFullYear()} Catelli Hermanos S.A.
        </Footer>
      </GlassCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    width: 140%;
    height: 140%;
    background: radial-gradient(circle at 0% 0%, rgba(52, 131, 235, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 100% 100%, rgba(144, 70, 255, 0.1) 0%, transparent 50%);
    top: -20%;
    left: -20%;
    z-index: 0;
  }
`;

const GlassCard = styled.div`
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 32px;
  padding: 3.5rem 2.8rem;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6),
              inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1rem;
  z-index: 1;
`;

const LogoWrapper = styled.div`
  margin-bottom: 1.5rem;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
`;

const Logo = styled.img`
  width: 140px;
  height: auto;
  object-fit: contain;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.5rem;
  letter-spacing: -0.5px;
`;

const Subtitle = styled.p`
  color: rgba(255, 255, 255, 0.6);
  font-size: 15px;
  margin-bottom: 2rem;
  text-align: center;
`;

const Form = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const SubmitButton = styled(Button)`
  margin-top: 1rem;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  border-radius: 14px;
  width: 100%;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px -10px rgba(79, 172, 254, 0.5);
  }
`;

const StatusMessage = styled.div`
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  margin-bottom: 1.5rem;
  text-align: center;
  font-weight: 500;
  border: 1px solid ${props => props.error ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'};
  background: ${props => props.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'};
  color: ${props => props.error ? '#f87171' : '#4ade80'};
`;

const Footer = styled.div`
  margin-top: 2.5rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
`;
