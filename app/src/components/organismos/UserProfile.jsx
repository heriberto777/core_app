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

      if (result && result.success) {
        const updatedUser = await userApi.getMe(accessToken);
        Swal.fire("¡Éxito!", "Perfil actualizado correctamente", "success");
        setEditing(false);
        setSelectedAvatar(null);
        setPreviewAvatar(null);
        if (updateUser) updateUser(updatedUser);
      } else {
        throw new Error(result?.msg || "Error al actualizar perfil");
      }
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  };

  const handleChangePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      Swal.fire("Error", "Las contraseñas no coinciden", "error");
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
        Swal.fire("¡Éxito!", "Contraseña actualizada", "success");
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        throw new Error(result?.msg || "Error al cambiar contraseña");
      }
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  };

  const getAvatarSrc = () => {
    if (previewAvatar) return previewAvatar;
    if (user?.avatar) {
      if (user.avatar.startsWith("http")) return user.avatar;
      return `${ENV.BASE_PATH}/${user.avatar.startsWith("uploads/") ? "" : "uploads/avatar/"}${user.avatar}`;
    }
    return "/default-avatar.png";
  };

  return (
    <ProfileWrapper>
      <GlassProfile>
        <Sidebar>
          <AvatarWrapper>
            <div className="img-container">
              <AvatarImage src={getAvatarSrc()} alt="Avatar" />
              {editing && (
                <div className="overlay" onClick={() => fileInputRef.current?.click()}>
                  <FaCamera />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              style={{ display: "none" }}
            />
            <div className="user-info">
              <h2>{user?.name} {user?.lastname}</h2>
              <Badge>{user?.role?.join(", ") || "Usuario"}</Badge>
            </div>
          </AvatarWrapper>

          <NavMenu>
            <NavItem $active={!editing} onClick={() => setEditing(false)}>
              <FaUser /> Datos Personales
            </NavItem>
            <NavItem $active={false} style={{ opacity: 0.5, cursor: "not-allowed" }}>
              <FaShieldAlt /> Seguridad y Accesos
            </NavItem>
          </NavMenu>
        </Sidebar>

        <ContentArea>
          <Section>
            <div className="section-header">
              <h3><FaUser /> Información del Perfil</h3>
              <ActionButton onClick={() => (editing ? setEditing(false) : setEditing(true))}>
                {editing ? <FaTimes /> : <FaEdit />}
                <span>{editing ? "Cancelar" : "Editar"}</span>
              </ActionButton>
            </div>

            <FormGrid>
              <FormGroup>
                <label>Nombres</label>
                <div className="input-box">
                  <FaUser className="icon" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!editing}
                  />
                </div>
              </FormGroup>
              <FormGroup>
                <label>Apellidos</label>
                <div className="input-box">
                  <FaUser className="icon" />
                  <input
                    name="lastname"
                    value={formData.lastname}
                    onChange={handleInputChange}
                    disabled={!editing}
                  />
                </div>
              </FormGroup>
              <FormGroup>
                <label>Correo Electrónico</label>
                <div className="input-box">
                  <FaEnvelope className="icon" />
                  <input
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!editing}
                  />
                </div>
              </FormGroup>
              <FormGroup>
                <label>Teléfono</label>
                <div className="input-box">
                  <FaPhone className="icon" />
                  <input
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    disabled={!editing}
                  />
                </div>
              </FormGroup>
            </FormGrid>

            {editing && (
              <SaveButton onClick={handleUpdateProfile}>
                <FaSave /> Guardar Cambios
              </SaveButton>
            )}
          </Section>

          <Section>
            <div className="section-header">
              <h3><FaLock /> Gestión de Seguridad</h3>
            </div>
            <FormGrid>
              <FormGroup>
                <label>Contraseña Actual</label>
                <div className="input-box">
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    name="current"
                    value={passwords.current}
                    onChange={handlePasswordChange}
                    placeholder="••••••••"
                  />
                </div>
              </FormGroup>
              <FormGroup>
                <label>Nueva Contraseña</label>
                <div className="input-box">
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    name="new"
                    value={passwords.new}
                    onChange={handlePasswordChange}
                    placeholder="Mín. 6 caracteres"
                  />
                </div>
              </FormGroup>
              <FormGroup>
                <label>Confirmar Nueva</label>
                <div className="input-box">
                  <FaLock className="icon" />
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    name="confirm"
                    value={passwords.confirm}
                    onChange={handlePasswordChange}
                    placeholder="Repita contraseña"
                  />
                </div>
              </FormGroup>
            </FormGrid>
            <SaveButton
              onClick={handleChangePassword}
              disabled={!passwords.current || !passwords.new}
            >
              <FaShieldAlt /> Actualizar Seguridad
            </SaveButton>
          </Section>
        </ContentArea>
      </GlassProfile>
    </ProfileWrapper>
  );
}

// --- ESTILOS GLASSMORPHISM ---

const ProfileWrapper = styled.div`
  padding: 40px;
  min-height: calc(100vh - 80px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  animation: fadeIn 0.6s ease;

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }
`;

const GlassProfile = styled.div`
  width: 100%;
  max-width: 1100px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 30px;
  display: grid;
  grid-template-columns: 320px 1fr;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  background: rgba(21, 28, 132, 0.15);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 40px;
`;

const AvatarWrapper = styled.div`
  text-align: center;
  
  .img-container {
    position: relative;
    width: 160px;
    height: 160px;
    margin: 0 auto 20px;
    border-radius: 40px;
    overflow: hidden;
    border: 3px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: white;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
    }

    &:hover .overlay { opacity: 1; }
  }

  h2 {
    font-size: 1.5rem;
    color: white;
    margin-bottom: 8px;
  }
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const Badge = styled.span`
  background: ${({ theme }) => theme.primary};
  padding: 4px 15px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const NavMenu = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const NavItem = styled.div`
  padding: 15px 20px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  gap: 15px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: 0.3s;
  background: ${props => props.$active ? 'rgba(255,255,255,0.08)' : 'transparent'};
  border: 1px solid ${props => props.$active ? 'rgba(255,255,255,0.1)' : 'transparent'};

  &:hover { background: rgba(255,255,255,0.05); }
`;

const ContentArea = styled.div`
  padding: 50px;
  display: flex;
  flex-direction: column;
  gap: 40px;
`;

const Section = styled.section`
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    
    h3 {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.3rem;
      color: #fff;
    }
  }
`;

const ActionButton = styled.button`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 8px 18px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: 0.3s;

  &:hover { background: rgba(255, 255, 255, 0.1); transform: scale(1.05); }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;

  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;

  label {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
    text-transform: uppercase;
  }

  .input-box {
    position: relative;
    display: flex;
    align-items: center;

    .icon {
      position: absolute;
      left: 15px;
      color: rgba(255, 255, 255, 0.3);
    }

    input {
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 15px 12px 45px;
      color: white;
      font-size: 1rem;
      transition: 0.3s;

      &:focus {
        border-color: ${({ theme }) => theme.primary};
        background: rgba(255, 255, 255, 0.06);
        outline: none;
      }

      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }
  }
`;

const SaveButton = styled.button`
  margin-top: 20px;
  background: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 4px 15px rgba(21, 28, 132, 0.4);

  &:hover { transform: translateY(-3px); box-shadow: 0 8px 25px rgba(21, 28, 132, 0.5); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;
