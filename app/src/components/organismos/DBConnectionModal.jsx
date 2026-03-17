import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaDatabase, FaServer, FaUser, FaLock, FaNetworkWired, FaCheckCircle, FaTimesCircle, FaTrash, FaShieldAlt } from "react-icons/fa";
import { Button, Input, Select } from "../index";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.cardBg || "white"};
  width: 100%;
  max-width: 600px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.premium};
  border: 1px solid ${({ theme }) => theme.border};
`;

const Header = styled.div`
  background: ${({ theme }) => theme.bg2 || "#f8fafc"};
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#e2e8f0"};

  h2 {
    font-size: 20px;
    font-weight: 900;
    color: ${({ theme }) => theme.titleColor || "#1e293b"};
    display: flex;
    align-items: center;
    gap: 12px;
  }
`;

const Form = styled.form`
  padding: 24px;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const Footer = styled.div`
  padding: 24px;
  background: ${({ theme }) => theme.bg2 || "#f8fafc"};
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid ${({ theme }) => theme.border || "#e2e8f0"};
`;

export const DBConnectionModal = ({ isOpen, onClose, onSave, onTest, initialData = null }) => {
    const [formData, setFormData] = useState({
        serverName: "",
        host: "",
        user: "",
        password: "",
        database: "",
        port: "1433",
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000,
        type: "mssql"
    });

    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        if (initialData) setFormData(initialData);
        else setFormData({
            serverName: "", host: "", user: "", password: "", database: "",
            port: "1433", encrypt: true, trustServerCertificate: true,
            connectTimeout: 30000, type: "mssql"
        });
        setTestResult(null);
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await onTest(formData);
            setTestResult({ success: res.success, message: res.message });
        } catch (e) {
            setTestResult({ success: false, message: e.message || "Error de conexión" });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(formData);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Overlay>
            <Modal>
                <Header>
                    <h2><FaDatabase /> {initialData ? "Editar Conexión" : "Nueva Conexión"}</h2>
                    <Button variant="ghost" onClick={onClose}>✕</Button>
                </Header>

                <Form>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Input
                            label="Nombre Identificador"
                            icon={FaDatabase}
                            placeholder="Ej: Produccion_Z"
                            value={formData.serverName}
                            onChange={e => setFormData({ ...formData, serverName: e.target.value })}
                            disabled={initialData}
                        />

                        <Select
                            label="Tipo de BD"
                            icon={FaShieldAlt}
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                        >
                            <option value="mssql">SQL Server</option>
                            <option value="mysql">MySQL</option>
                            <option value="postgres">PostgreSQL</option>
                        </Select>
                    </div>

                    <Input
                        label="Host / IP del Servidor"
                        icon={FaServer}
                        placeholder="192.168.1.100"
                        value={formData.host}
                        onChange={e => setFormData({ ...formData, host: e.target.value })}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px' }}>
                        <Input
                            label="Puerto"
                            icon={FaNetworkWired}
                            value={formData.port}
                            onChange={e => setFormData({ ...formData, port: e.target.value })}
                        />
                        <Input
                            label="Base de Datos"
                            icon={FaDatabase}
                            value={formData.database}
                            onChange={e => setFormData({ ...formData, database: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Input
                            label="Usuario"
                            icon={FaUser}
                            value={formData.user}
                            onChange={e => setFormData({ ...formData, user: e.target.value })}
                        />
                        <Input
                            label="Contraseña"
                            icon={FaLock}
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    {testResult && (
                        <div style={{
                            padding: '12px',
                            borderRadius: '12px',
                            background: testResult.success ? '#ecfdf5' : '#fef2f2',
                            color: testResult.success ? '#065f46' : '#991b1b',
                            fontSize: '13px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            {testResult.success ? <FaCheckCircle /> : <FaTimesCircle />}
                            {testResult.message}
                        </div>
                    )}
                </Form>

                <Footer>
                    <Button variant="outline" onClick={handleTest} loading={testing}>
                        Probar Conexión
                    </Button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave} loading={saving}>
                            Guardar Configuración
                        </Button>
                    </div>
                </Footer>
            </Modal>
        </Overlay>
    );
};
