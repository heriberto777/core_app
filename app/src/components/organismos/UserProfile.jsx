import React, { useState, useRef } from "react";
import styled from "styled-components";
import { useAuth, LoadingUI } from "../../index";
import { User } from "../../api/index";
import { ENV } from "../../utils/index";
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
  FaShieldAlt,
} from "react-icons/fa";

const userApi = new User();

export function UserProfile() {
  const { user, accessToken, updateUser, loading } = useAuth();
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
  const [changingPassword, setChangingPassword] = useState(false);
  const fileInputRef = useRef(null);

  if (loading) return <LoadingUI message="Cargando perfil..." />;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswords((prev) => ({ ...prev, [name]: value }));
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
      if (!accessToken) {
        Swal.fire("Error", "No hay sesión activa.", "error");
        return;
      }

      Swal.fire({
        title: "Actualizando perfil...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const updateData = { ...formData };
      if (selectedAvatar) updateData.fileAvatar = selectedAvatar;

      const result = await userApi.updateUser(accessToken, user._id, updateData);
      console.log("Resultado updateUser:", result);

      if (result && (result.success !== false)) {
        Swal.fire("¡Éxito!", "Perfil actualizado correctamente", "success");
        setEditing(false);
        setSelectedAvatar(null);
        setPreviewAvatar(null);
        if (updateUser && result.data) {
          updateUser(result.data);
        } else if (updateUser && result) {
          updateUser(result);
        }
      } else {
        throw new Error(result?.message || result?.msg || "Error al actualizar perfil");
      }
    } catch (error) {
      console.error("Error actualizando perfil:", error);
      Swal.fire("Error", error.message, "error");
    }
  };

  const handleChangePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      Swal.fire("Error", "Las contraseñas no coinciden", "error");
      return;
    }

    if (passwords.new.length < 6) {
      Swal.fire("Error", "La nueva contraseña debe tener al menos 6 caracteres", "error");
      return;
    }

    setChangingPassword(true);
    try {
      Swal.fire({
        title: "Cambiando contraseña...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await userApi.changePassword(
        accessToken, 
        user._id, 
        passwords.current, 
        passwords.new
      );

      if (result && result.success) {
        Swal.fire("¡Éxito!", "Contraseña actualizada correctamente", "success");
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        throw new Error(result?.message || "Error al cambiar contraseña");
      }
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    } finally {
      setChangingPassword(false);
    }
  };

  const getAvatarSrc = () => {
    if (previewAvatar) return previewAvatar;
    if (user?.avatar) {
      if (user.avatar.startsWith("http")) return user.avatar;
      return `${ENV.BASE_API}/uploads/avatar/${user.avatar.replace('uploads/avatar/', '')}`;
    }
    return null;
  };

  const getInitials = () => {
    const name = user?.name || "";
    const lastname = user?.lastname || "";
    const initials = `${name.charAt(0)}${lastname.charAt(0)}`.toUpperCase();
    return initials || "U";
  };

  return (
    <ProfileWrapper>
      <ProfileCard>
        <CardHeader>
          <AvatarSection>
            <AvatarContainer>
              {getAvatarSrc() ? (
                <>
                  <AvatarImage src={getAvatarSrc()} alt="Avatar" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                  <InitialsAvatar style={{ display: 'none' }}>{getInitials()}</InitialsAvatar>
                </>
              ) : (
                <InitialsAvatar>{getInitials()}</InitialsAvatar>
              )}
              {editing && (
                <AvatarOverlay onClick={() => fileInputRef.current?.click()}>
                  <FaCamera />
                </AvatarOverlay>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                style={{ display: "none" }}
              />
            </AvatarContainer>
            <div className="user-info">
              <h2>{user?.name} {user?.lastname}</h2>
              <p className="user-email">{user?.email}</p>
              {user?.isAdmin && <AdminBadge>Administrador</AdminBadge>}
            </div>
          </AvatarSection>
          <HeaderActions>
            {!editing && (
              <ActionButton onClick={() => setEditing(true)}>
                <FaEdit /> Editar Perfil
              </ActionButton>
            )}
          </HeaderActions>
        </CardHeader>

        <CardContent>
          <Section>
            <SectionHeader>
              <h3><FaUser /> Información Personal</h3>
              {editing && <span className="editing-badge">Modo edición</span>}
            </SectionHeader>

            <FormGrid>
              <FormGroup>
                <label>Nombres</label>
                <InputWrapper>
                  <FaUser className="icon" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!editing}
                    placeholder="Nombres"
                  />
                </InputWrapper>
              </FormGroup>

              <FormGroup>
                <label>Apellidos</label>
                <InputWrapper>
                  <FaUser className="icon" />
                  <input
                    name="lastname"
                    value={formData.lastname}
                    onChange={handleInputChange}
                    disabled={!editing}
                    placeholder="Apellidos"
                  />
                </InputWrapper>
              </FormGroup>

              <FormGroup>
                <label>Correo Electrónico</label>
                <InputWrapper>
                  <FaEnvelope className="icon" />
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!editing}
                    placeholder="correo@ejemplo.com"
                  />
                </InputWrapper>
              </FormGroup>

              <FormGroup>
                <label>Teléfono</label>
                <InputWrapper>
                  <FaPhone className="icon" />
                  <input
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    disabled={!editing}
                    placeholder="999 999 999"
                  />
                </InputWrapper>
              </FormGroup>
            </FormGrid>

            {editing && (
              <FormActions>
                <CancelButton onClick={() => {
                  setEditing(false);
                  setFormData({
                    name: user?.name || "",
                    lastname: user?.lastname || "",
                    email: user?.email || "",
                    telefono: user?.telefono || "",
                  });
                  setSelectedAvatar(null);
                  setPreviewAvatar(null);
                }}>
                  <FaTimes /> Cancelar
                </CancelButton>
                <SaveButton onClick={handleUpdateProfile}>
                  <FaSave /> Guardar Cambios
                </SaveButton>
              </FormActions>
            )}
          </Section>

          <Divider />

          <Section>
            <SectionHeader>
              <h3><FaShieldAlt /> Seguridad</h3>
            </SectionHeader>
            <p className="section-description">
              Cambia tu contraseña para mantener tu cuenta segura.
            </p>

            <PasswordForm>
              <FormGroup>
                <label>Contraseña Actual</label>
                <PasswordInputWrapper>
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    name="current"
                    value={passwords.current}
                    onChange={handlePasswordChange}
                    placeholder="Contraseña actual"
                  />
                  <TogglePassword onClick={() => setShowPasswords(p => ({...p, current: !p.current}))}>
                    {showPasswords.current ? <FaEyeSlash /> : <FaEye />}
                  </TogglePassword>
                </PasswordInputWrapper>
              </FormGroup>

              <FormGroup>
                <label>Nueva Contraseña</label>
                <PasswordInputWrapper>
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    name="new"
                    value={passwords.new}
                    onChange={handlePasswordChange}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <TogglePassword onClick={() => setShowPasswords(p => ({...p, new: !p.new}))}>
                    {showPasswords.new ? <FaEyeSlash /> : <FaEye />}
                  </TogglePassword>
                </PasswordInputWrapper>
              </FormGroup>

              <FormGroup>
                <label>Confirmar Nueva</label>
                <PasswordInputWrapper>
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    name="confirm"
                    value={passwords.confirm}
                    onChange={handlePasswordChange}
                    placeholder="Repite la contraseña"
                  />
                  <TogglePassword onClick={() => setShowPasswords(p => ({...p, confirm: !p.confirm}))}>
                    {showPasswords.confirm ? <FaEyeSlash /> : <FaEye />}
                  </TogglePassword>
                </PasswordInputWrapper>
              </FormGroup>
            </PasswordForm>

            <FormActions>
              <ChangePasswordButton 
                onClick={handleChangePassword}
                disabled={!passwords.current || !passwords.new || !passwords.confirm || changingPassword}
              >
                <FaShieldAlt /> {changingPassword ? "Cambiando..." : "Cambiar Contraseña"}
              </ChangePasswordButton>
            </FormActions>
          </Section>
        </CardContent>
      </ProfileCard>
    </ProfileWrapper>
  );
}

// --- ESTILOS ---

const ProfileWrapper = styled.div`
  padding: 24px;
  min-height: calc(100vh - 80px);
  background: ${({ theme }) => theme.contentBg};
`;

const ProfileCard = styled.div`
  max-width: 900px;
  margin: 0 auto;
  background: ${({ theme }) => theme.cardBg};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows?.medium || "0 4px 12px rgba(0, 0, 0, 0.1)"};
  border: 1px solid ${({ theme }) => theme.border};
  overflow: hidden;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, ${({ theme }) => theme.primary}15 0%, ${({ theme }) => theme.primary}05 100%);
  border-bottom: 1px solid ${({ theme }) => theme.border};

  @media (max-width: 600px) {
    flex-direction: column;
    gap: 16px;
  }
`;

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  .user-info {
    h2 {
      margin: 0;
      font-size: 1.4rem;
      color: ${({ theme }) => theme.titleColor};
      font-weight: 700;
    }

    .user-email {
      margin: 4px 0 0 0;
      font-size: 0.9rem;
      color: ${({ theme }) => theme.textSecondary};
    }
  }
`;

const AvatarContainer = styled.div`
  position: relative;
  width: 80px;
  height: 80px;
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid ${({ theme }) => theme.primary};
`;

const InitialsAvatar = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.primary};
  color: white;
  font-size: 1.8rem;
  font-weight: 700;
  border-radius: 50%;
  border: 3px solid ${({ theme }) => theme.primary};
`;

const AvatarOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;

  ${AvatarContainer}:hover & {
    opacity: 1;
  }
`;

const AdminBadge = styled.span`
  display: inline-block;
  margin-top: 8px;
  padding: 4px 12px;
  background: ${({ theme }) => theme.warning};
  color: #000;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 20px;
  text-transform: uppercase;
`;

const HeaderActions = styled.div``;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.primaryDark || theme.primary};
    transform: translateY(-1px);
  }
`;

const CardContent = styled.div`
  padding: 24px;
`;

const Section = styled.section``;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 1.1rem;
    color: ${({ theme }) => theme.titleColor};
    display: flex;
    align-items: center;
    gap: 10px;

    svg {
      color: ${({ theme }) => theme.primary};
    }
  }

  .editing-badge {
    font-size: 0.75rem;
    padding: 4px 10px;
    background: ${({ theme }) => theme.warning};
    color: #000;
    border-radius: 12px;
    font-weight: 600;
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: ${({ theme }) => theme.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  .icon {
    position: absolute;
    left: 14px;
    color: ${({ theme }) => theme.muted || "#9ca3af"};
  }

  input {
    width: 100%;
    padding: 12px 12px 12px 42px;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    background: ${({ theme }) => theme.inputBg};
    color: ${({ theme }) => theme.text};
    font-size: 0.95rem;
    transition: all 0.2s;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20;
    }

    &:disabled {
      background: ${({ theme }) => theme.hoverBg};
      cursor: not-allowed;
      opacity: 0.7;
    }

    &::placeholder {
      color: ${({ theme }) => theme.muted || "#9ca3af"};
    }
  }
`;

const PasswordInputWrapper = styled(InputWrapper)`
  input {
    padding-right: 45px;
  }
`;

const TogglePassword = styled.button`
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted || "#9ca3af"};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${({ theme }) => theme.primary};
  }
`;

const PasswordForm = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  max-width: 400px;
`;

const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
`;

const SaveButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.primaryDark || theme.primary};
    transform: translateY(-1px);
  }
`;

const CancelButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: transparent;
  color: ${({ theme }) => theme.textSecondary};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.hoverBg};
  }
`;

const ChangePasswordButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: ${({ theme, disabled }) => disabled ? theme.muted || "#9ca3af" : theme.success};
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: ${({ disabled }) => disabled ? "not-allowed" : "pointer"};
  transition: all 0.2s;
  opacity: ${({ disabled }) => disabled ? 0.6 : 1};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.successHover || theme.success};
    transform: translateY(-1px);
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.border};
  margin: 24px 0;
`;

const SectionDescription = styled.p`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.9rem;
  margin-bottom: 16px;
`;
