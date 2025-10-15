import React, { useState, useRef } from "react";
import styled from "styled-components";
import { useAuth, User, ENV } from "../../index";
import Swal from "sweetalert2";
import {
  FaUser,
  FaEnvelope,
  FaPhone,
  FaLock,
  FaCamera,
  FaEdit,
  FaSave,
  FaTimes,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

const userApi = new User();

export function UserProfile() {
  const { user, accessToken, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    name: user?.name || "",
    lastname: user?.lastname || "",
    email: user?.email || "",
    telefono: user?.telefono || "",
  });
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const fileInputRef = useRef(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswords((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire("Error", "El archivo no puede ser mayor a 5MB", "error");
        return;
      }

      setSelectedAvatar(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreviewAvatar(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      // ⭐ VERIFICAR TOKEN ANTES DE CONTINUAR ⭐
      if (!accessToken) {
        Swal.fire(
          "Error",
          "No hay sesión activa. Por favor, inicia sesión nuevamente.",
          "error"
        );
        return;
      }

      if (!user?._id) {
        Swal.fire("Error", "No se pudo identificar al usuario.", "error");
        return;
      }

      Swal.fire({
        title: "Actualizando perfil...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      // Preparar datos para enviar
      const updateData = { ...formData };

      // Si hay una imagen seleccionada, la agregamos al FormData
      if (selectedAvatar) {
        updateData.fileAvatar = selectedAvatar;
      }

      console.log("Datos a enviar:", {
        ...updateData,
        fileAvatar: selectedAvatar ? "archivo seleccionado" : "sin archivo",
      });

      const result = await userApi.updateUser(
        accessToken,
        user._id,
        updateData
      );

      console.log("Respuesta de la API:", result);

      // La API devuelve { success: true, msg: "..." } cuando es exitoso
      if (result && result.success) {
        // Recargar datos del usuario actualizado
        try {
          const updatedUser = await userApi.getMe(accessToken);

          Swal.fire("¡Éxito!", "Perfil actualizado correctamente", "success");

          // Limpiar estados de edición
          setEditing(false);
          setSelectedAvatar(null);
          setPreviewAvatar(null);

          // ⭐ USAR updateUser EN LUGAR DE login PARA NO PERDER TOKENS ⭐
          if (updateUser && typeof updateUser === "function") {
            updateUser(updatedUser);
          }

          // Actualizar formData con los nuevos datos
          setFormData({
            name: updatedUser?.name || "",
            lastname: updatedUser?.lastname || "",
            email: updatedUser?.email || "",
            telefono: updatedUser?.telefono || "",
          });

          // Si tienes una función para actualizar el contexto del usuario
          // updateUserContext(updatedUser);
        } catch (userError) {
          console.error("Error al recargar usuario:", userError);
          Swal.fire("¡Éxito!", "Perfil actualizado correctamente", "success");
          setEditing(false);
          setSelectedAvatar(null);
          setPreviewAvatar(null);
        }
      } else {
        // Si result.success es false o no existe
        const errorMessage =
          result?.msg || result?.message || "Error al actualizar perfil";
        console.error("Error de la API:", result);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error completo:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo actualizar el perfil",
        "error"
      );
    }
  };

  const handleChangePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      Swal.fire("Error", "Las contraseñas nuevas no coinciden", "error");
      return;
    }

    if (passwords.new.length < 6) {
      Swal.fire(
        "Error",
        "La nueva contraseña debe tener al menos 6 caracteres",
        "error"
      );
      return;
    }

    try {
      Swal.fire({
        title: "Cambiando contraseña...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await userApi.updateUser(accessToken, user._id, {
        currentPassword: passwords.current,
        password: passwords.new,
      });

      if (result && result.success) {
        Swal.fire("¡Éxito!", "Contraseña actualizada correctamente", "success");
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        const errorMessage =
          result?.msg || result?.message || "Error al cambiar contraseña";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo cambiar la contraseña",
        "error"
      );
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const getAvatarSrc = () => {
    // 1. Prioridad: preview de imagen seleccionada (antes de guardar)
    if (previewAvatar) return previewAvatar;

    console.log("Avatar del usuario:", user?.avatar);

    // 2. Avatar del usuario desde el servidor
    if (user?.avatar) {
      // Si la ruta ya incluye el dominio completo, usarla tal como está
      if (user.avatar.startsWith("http")) {
        return user.avatar;
      }

      // ⭐ CONSTRUIR URL PARA ARCHIVOS ESTÁTICOS ⭐
      // Si la ruta ya incluye 'uploads/', usarla directamente
      if (user.avatar.startsWith("uploads/")) {
        return `${ENV.BASE_PATH}/${user.avatar}`;
      }

      // Si no incluye 'uploads/', agregarla
      return `${ENV.BASE_PATH}/uploads/avatar/${user.avatar}`;
    }

    // 3. Avatar por defecto
    return "/default-avatar.png";
  };

  const cancelEdit = () => {
    setEditing(false);
    setSelectedAvatar(null);
    setPreviewAvatar(null);
    // Restaurar datos originales
    setFormData({
      name: user?.name || "",
      lastname: user?.lastname || "",
      email: user?.email || "",
      telefono: user?.telefono || "",
    });
  };

  return (
    <ProfileContainer>
      <Header>
        <h1>
          <FaUser /> Mi Perfil
        </h1>
        <p>Gestiona tu información personal y configuraciones de cuenta</p>
      </Header>

      <ProfileContent>
        {/* Sección de Avatar */}
        <AvatarSection>
          <AvatarContainer>
            <AvatarImage src={getAvatarSrc()} alt="Avatar" />
            {editing && (
              <AvatarOverlay onClick={() => fileInputRef.current?.click()}>
                <FaCamera />
                <span>Cambiar foto</span>
              </AvatarOverlay>
            )}
          </AvatarContainer>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarSelect}
            style={{ display: "none" }}
          />
          <UserInfo>
            <h2>
              {user?.name} {user?.lastname}
            </h2>
            <RoleBadge>{user?.role?.join(", ")}</RoleBadge>
          </UserInfo>
        </AvatarSection>

        {/* Información Personal */}
        <Section>
          <SectionHeader>
            <h3>Información Personal</h3>
            <EditButton
              onClick={() => (editing ? cancelEdit() : setEditing(true))}
            >
              {editing ? <FaTimes /> : <FaEdit />}
              {editing ? "Cancelar" : "Editar"}
            </EditButton>
          </SectionHeader>

          <FormGrid>
            <FormGroup>
              <label>Nombre</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                disabled={!editing}
                icon={<FaUser />}
                placeholder="Ingrese su nombre"
              />
            </FormGroup>

            <FormGroup>
              <label>Apellido</label>
              <Input
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                disabled={!editing}
                icon={<FaUser />}
                placeholder="Ingrese su apellido"
              />
            </FormGroup>

            <FormGroup>
              <label>Email</label>
              <Input
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={!editing}
                icon={<FaEnvelope />}
                placeholder="correo@ejemplo.com"
              />
            </FormGroup>

            <FormGroup>
              <label>Teléfono</label>
              <Input
                name="telefono"
                value={formData.telefono}
                onChange={handleInputChange}
                disabled={!editing}
                icon={<FaPhone />}
                placeholder="Número de teléfono"
              />
            </FormGroup>
          </FormGrid>

          {editing && (
            <ButtonGroup>
              <SaveButton onClick={handleUpdateProfile}>
                <FaSave /> Guardar Cambios
              </SaveButton>
            </ButtonGroup>
          )}
        </Section>

        {/* Cambiar Contraseña */}
        <Section>
          <SectionHeader>
            <h3>Seguridad</h3>
          </SectionHeader>

          <FormGrid>
            <FormGroup>
              <label>Contraseña Actual</label>
              <PasswordInputWrapper>
                <PasswordInputContainer>
                  <InputIcon>
                    <FaLock />
                  </InputIcon>
                  <PasswordField
                    type={showPasswords.current ? "text" : "password"}
                    name="current"
                    value={passwords.current}
                    onChange={handlePasswordChange}
                    placeholder="Ingrese su contraseña actual"
                  />
                  <PasswordToggle
                    onClick={() => togglePasswordVisibility("current")}
                  >
                    {showPasswords.current ? <FaEyeSlash /> : <FaEye />}
                  </PasswordToggle>
                </PasswordInputContainer>
              </PasswordInputWrapper>
            </FormGroup>

            <FormGroup>
              <label>Nueva Contraseña</label>
              <PasswordInputWrapper>
                <PasswordInputContainer>
                  <InputIcon>
                    <FaLock />
                  </InputIcon>
                  <PasswordField
                    type={showPasswords.new ? "text" : "password"}
                    name="new"
                    value={passwords.new}
                    onChange={handlePasswordChange}
                    placeholder="Ingrese su nueva contraseña"
                  />
                  <PasswordToggle
                    onClick={() => togglePasswordVisibility("new")}
                  >
                    {showPasswords.new ? <FaEyeSlash /> : <FaEye />}
                  </PasswordToggle>
                </PasswordInputContainer>
              </PasswordInputWrapper>
            </FormGroup>

            <FormGroup>
              <label>Confirmar Nueva Contraseña</label>
              <PasswordInputWrapper>
                <PasswordInputContainer>
                  <InputIcon>
                    <FaLock />
                  </InputIcon>
                  <PasswordField
                    type={showPasswords.confirm ? "text" : "password"}
                    name="confirm"
                    value={passwords.confirm}
                    onChange={handlePasswordChange}
                    placeholder="Confirme su nueva contraseña"
                  />
                  <PasswordToggle
                    onClick={() => togglePasswordVisibility("confirm")}
                  >
                    {showPasswords.confirm ? <FaEyeSlash /> : <FaEye />}
                  </PasswordToggle>
                </PasswordInputContainer>
              </PasswordInputWrapper>
            </FormGroup>
          </FormGrid>

          <ButtonGroup>
            <SaveButton
              onClick={handleChangePassword}
              disabled={
                !passwords.current || !passwords.new || !passwords.confirm
              }
            >
              <FaLock /> Cambiar Contraseña
            </SaveButton>
          </ButtonGroup>
        </Section>
      </ProfileContent>
    </ProfileContainer>
  );
}

// Componente de Input reutilizable
const InputComponent = ({ icon, disabled, ...props }) => (
  <InputWrapper $disabled={disabled}>
    <InputIcon>{icon}</InputIcon>
    <StyledInput disabled={disabled} {...props} />
  </InputWrapper>
);

// Estilos (los mismos que antes pero aquí están organizados)
const ProfileContainer = styled.div`
  padding: 20px;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h1 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
  }

  p {
    color: ${({ theme }) => theme.textSecondary};
    margin: 0;
  }
`;

const ProfileContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 30px;
`;

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 30px;
  background: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
  }
`;

const AvatarContainer = styled.div`
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;

  &:hover > div {
    opacity: 1;
  }
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const AvatarOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  color: white;
  gap: 5px;

  span {
    font-size: 12px;
  }
`;

const UserInfo = styled.div`
  h2 {
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
  }
`;

const RoleBadge = styled.span`
  background: ${({ theme }) => theme.primary};
  color: white;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
`;

const Section = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.title};
  }
`;

const EditButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background: ${({ theme }) => theme.primaryHover};
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-weight: 500;
    color: ${({ theme }) => theme.text};
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
`;

const InputIcon = styled.div`
  position: absolute;
  left: 12px;
  color: ${({ theme }) => theme.textSecondary};
  z-index: 1;
  pointer-events: none;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 12px 12px 12px 40px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme, disabled }) =>
    disabled ? theme.tableDisabled : theme.inputBg};
  color: ${({ theme }) => theme.text};
  transition: border-color 0.3s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const Input = InputComponent;

// Estilos específicos para campos de contraseña
const PasswordInputWrapper = styled.div`
  width: 100%;
`;

const PasswordInputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
`;

const PasswordField = styled.input`
  width: 100%;
  padding: 12px 45px 12px 40px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.text};
  transition: border-color 0.3s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.textSecondary};
  }
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.textSecondary};
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.3s, background-color 0.3s;

  &:hover {
    color: ${({ theme }) => theme.primary};
    background-color: rgba(0, 0, 0, 0.05);
  }

  svg {
    font-size: 16px;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 10px;
`;

const SaveButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background: ${({ theme }) => theme.primaryHover};
  }

  &:disabled {
    background: ${({ theme }) => theme.textSecondary};
    cursor: not-allowed;
    opacity: 0.6;
  }
`;
