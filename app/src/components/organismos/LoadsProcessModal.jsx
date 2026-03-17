import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
import {
    FaTimes, FaArrowRight, FaArrowLeft, FaCheck, FaDatabase,
    FaTruckLoading, FaExchangeAlt, FaFileAlt, FaSearch
} from "react-icons/fa";
import { Button, LoadingUI, StatusBadge } from "../../index";

// === ESTILOS MODAL (Glaas) ===
const Overlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center;
  z-index: 2000; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease-out;
`;

const Container = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 800px; max-height: 90vh;
  border-radius: 16px; display: flex; flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.premium};
  border: 1px solid ${({ theme }) => theme.border};
  overflow: hidden;
`;

const Header = styled.div`
  padding: 20px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}40;
`;

const Content = styled.div`
  padding: 30px; overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 20px;
`;

const Footer = styled.div`
  padding: 20px; border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; background: ${({ theme }) => theme.bg2}20;
`;

const StepIndicator = styled.div`
  display: flex; gap: 8px; margin-bottom: 20px; justify-content: center;
`;

const StepDot = styled.div`
  width: 10px; height: 10px; border-radius: 50%;
  background: ${({ active, completed, theme }) =>
        active ? theme.primary : completed ? theme.success : theme.border};
  transition: all 0.3s ease;
`;

const InfoBox = styled.div`
  padding: 15px; background: ${({ theme }) => theme.bg2};
  border-radius: 10px; border-left: 4px solid ${({ color, theme }) => color || theme.primary};
  font-size: 14px; line-height: 1.6;
`;

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 15px;
`;

const Label = styled.label`
  font-size: 12px; font-weight: 700; color: ${({ theme }) => theme.textSecondary};
  text-transform: uppercase; margin-bottom: 4px; display: block;
`;

const Input = styled.input`
  width: 100%; padding: 12px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  &:focus { border-color: ${({ theme }) => theme.primary}; outline: none; }
`;

const Select = styled.select`
  width: 100%; padding: 12px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
`;

// === COMPONENTE PRINCIPAL ===
export const LoadsProcessModal = ({
    isOpen,
    onClose,
    task,
    vendedores,
    onComplete,
    getConsecutivo,
    getSalesData,
    insertOrders,
    insertLoadsDetail,
    executeTraspaso
}) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadId, setLoadId] = useState("");
    const [searchParams, setSearchParams] = useState({ date: "", vendors: "" });
    const [salesData, setSalesData] = useState([]);
    const [loadParams, setLoadParams] = useState({ route: "", bodega: "02" });

    // PASO 1: Obtener Consecutivo
    useEffect(() => {
        if (isOpen && step === 1) {
            const init = async () => {
                setLoading(true);
                try {
                    const id = await getConsecutivo();
                    setLoadId(id);
                    setStep(2);
                } catch (err) {
                    console.error("Error consecutivo:", err);
                } finally {
                    setLoading(false);
                }
            };
            init();
        }
    }, [isOpen, step, getConsecutivo]);

    const handleSearchSales = async () => {
        if (!searchParams.date || !searchParams.vendors) return alert("Fecha y vendedores requeridos");
        setLoading(true);
        try {
            const data = await getSalesData(searchParams.date, searchParams.vendors, task.name);
            setSalesData(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmOrders = async () => {
        setLoading(true);
        try {
            // Asignar loadId a cada registro
            const dataWithLoadId = salesData.map(item => ({ ...item, Code_load: loadId }));
            await insertOrders(dataWithLoadId, loadId);
            setStep(4);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmLoadDetail = async () => {
        setLoading(true);
        try {
            await insertLoadsDetail(loadParams.route, loadId, salesData, loadParams.bodega);
            setStep(5);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteTraspaso = async (confirm) => {
        if (!confirm) {
            onComplete();
            return onClose();
        }
        setLoading(true);
        try {
            await executeTraspaso(loadParams.route, loadId, salesData, loadParams.bodega);
            onComplete();
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Overlay onClick={onClose}>
            <Container onClick={e => e.stopPropagation()}>
                <Header>
                    <div>
                        <h3 style={{ margin: 0 }}>Proceso de Carga de Camiones</h3>
                        <small style={{ color: '#1565C0', fontWeight: 'bold' }}>{loadId || "Generando consecutivo..."}</small>
                    </div>
                    <FaTimes style={{ cursor: 'pointer', opacity: 0.5 }} onClick={onClose} />
                </Header>

                <Content>
                    <StepIndicator>
                        {[1, 2, 3, 4, 5, 6].map(s => (
                            <StepDot key={s} active={step === s} completed={step > s} />
                        ))}
                    </StepIndicator>

                    {loading && <LoadingUI overlay message="Procesando... por favor espere." />}

                    {/* PASO 2: BUSQUEDA DE VENTAS */}
                    {step === 2 && (
                        <>
                            <InfoBox>
                                <FaSearch style={{ marginRight: '10px' }} />
                                <strong>Paso 2:</strong> Ingrese la fecha y los códigos de vendedores para obtener las ventas pendientes.
                            </InfoBox>
                            <Grid>
                                <div>
                                    <Label>Fecha de Ventas</Label>
                                    <Input
                                        type="date"
                                        value={searchParams.date}
                                        onChange={e => setSearchParams({ ...searchParams, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label>Vendedores (Cod. separados por coma)</Label>
                                    <Input
                                        placeholder="Ej: 001,002,003"
                                        value={searchParams.vendors}
                                        onChange={e => setSearchParams({ ...searchParams, vendors: e.target.value })}
                                    />
                                </div>
                            </Grid>
                            <Button variant="primary" style={{ width: '100%' }} onClick={handleSearchSales}>
                                <FaSearch /> Buscar Ventas
                            </Button>
                            {salesData.length > 0 && (
                                <StatusBadge status="active" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
                                    Se han encontrado {salesData.length} ventas para procesar.
                                </StatusBadge>
                            )}
                        </>
                    )}

                    {/* PASO 3: CONFIRMACION ORDERS */}
                    {step === 3 && (
                        <>
                            <InfoBox color="#2E7D32">
                                <FaDatabase style={{ marginRight: '10px' }} />
                                <strong>Paso 3:</strong> Confirmar carga a la tabla de órdenes interna ERP.
                            </InfoBox>
                            <StatusBadge status="active">
                                {salesData.length} Ventas listas para ser insertadas con el Load ID: {loadId}
                            </StatusBadge>
                            <p style={{ textAlign: 'center', opacity: 0.7, fontSize: '14px' }}>
                                Esta acción preparará los registros para la carga oficial de camiones.
                            </p>
                        </>
                    )}

                    {/* PASO 4: PARAMETROS CARGA */}
                    {step === 4 && (
                        <>
                            <InfoBox color="#F57C00">
                                <FaTruckLoading style={{ marginRight: '10px' }} />
                                <strong>Paso 4:</strong> Seleccione el repartidor y la bodega de origen.
                            </InfoBox>
                            <Grid>
                                <div>
                                    <Label>Repartidor / Vendedor</Label>
                                    <Select
                                        value={loadParams.route}
                                        onChange={e => {
                                            const v = vendedores.find(v => v.VENDEDOR === e.target.value);
                                            setLoadParams({
                                                route: e.target.value,
                                                bodega: v?.U_BODEGA || "02"
                                            });
                                        }}
                                    >
                                        <option value="">-- Seleccione Repartidor --</option>
                                        {vendedores.map(v => (
                                            <option key={v.VENDEDOR} value={v.VENDEDOR}>
                                                {v.VENDEDOR} - {v.NOMBRE}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                                <div style={{ opacity: 0.7 }}>
                                    <Label>Bodega Sugerida (Bloqueado)</Label>
                                    <Input value={loadParams.bodega} readOnly />
                                </div>
                            </Grid>
                        </>
                    )}

                    {/* PASO 5: TRASPASO ERP */}
                    {step === 5 && (
                        <>
                            <InfoBox color="#6A1B9A">
                                <FaExchangeAlt style={{ marginRight: '10px' }} />
                                <strong>Paso 5:</strong> Carga finalizada localmente. ¿Deseas ejecutar el traspaso en el ERP?
                            </InfoBox>
                            <div style={{ padding: '20px', background: '#F3E5F5', borderRadius: '12px', textAlign: 'center' }}>
                                <FaCheck size={40} color="#2E7D32" style={{ marginBottom: '15px' }} />
                                <h4 style={{ margin: 0 }}>¡Datos insertados en Detail!</h4>
                                <p style={{ fontSize: '14px', opacity: 0.8 }}>
                                    El proceso local ha concluido satisfactoriamente para el LOAD: <strong>{loadId}</strong>.
                                </p>
                            </div>
                        </>
                    )}
                </Content>

                <Footer>
                    <Button variant="ghost" onClick={onClose} disabled={loading}>Cerrar</Button>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {step === 2 && salesData.length > 0 && (
                            <Button variant="success" onClick={() => setStep(3)}>Siguiente <FaArrowRight /></Button>
                        )}
                        {step === 3 && (
                            <>
                                <Button variant="ghost" onClick={() => setStep(2)}><FaArrowLeft /> Regresar</Button>
                                <Button variant="primary" onClick={handleConfirmOrders}>Generar Carga <FaDatabase /></Button>
                            </>
                        )}
                        {step === 4 && (
                            <Button variant="primary" onClick={handleConfirmLoadDetail} disabled={!loadParams.route}>
                                Finalizar Carga <FaCheck />
                            </Button>
                        )}
                        {step === 5 && (
                            <>
                                <Button variant="ghost" onClick={() => handleExecuteTraspaso(false)}>No, terminar</Button>
                                <Button variant="primary" onClick={() => handleExecuteTraspaso(true)}>Sí, Traspasar al ERP <FaExchangeAlt /></Button>
                            </>
                        )}
                    </div>
                </Footer>
            </Container>
        </Overlay>
    );
};
