import React, { useState, useEffect, useMemo } from "react";
import {
    FaTimes, FaArrowRight, FaArrowLeft, FaCheck, FaDatabase,
    FaTruckLoading, FaExchangeAlt, FaFileAlt, FaSearch, FaInfoCircle
} from "react-icons/fa";
import { Button, LoadingUI, StatusBadge } from "../../index";

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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[2000] p-5 animate-in fade-in duration-300" onClick={onClose}>
            <div className="w-full max-w-[800px] max-h-[90vh] bg-white rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-extrabold text-slate-900 leading-tight">Proceso de Carga de Camiones</h3>
                        <p className="text-[13px] font-bold text-blue-600 flex items-center gap-2 mt-1">
                            <FaDatabase className="text-[10px]" /> {loadId || "Generando consecutivo..."}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <FaTimes />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                    {/* Step Indicator */}
                    <div className="flex gap-2 justify-center mb-2">
                        {[1, 2, 3, 4, 5, 6].map(s => (
                            <div
                                key={s}
                                className={`h-2.5 rounded-full transition-all duration-300 ${
                                    step === s ? "w-8 bg-blue-500" : step > s ? "w-2.5 bg-emerald-500" : "w-2.5 bg-slate-200"
                                }`}
                            />
                        ))}
                    </div>

                    {loading && <LoadingUI overlay message="Procesando datos... por favor espere." />}

                    {/* PASO 2: BUSQUEDA DE VENTAS */}
                    {step === 2 && (
                        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex gap-3 items-start">
                                <FaSearch className="text-blue-500 mt-1" />
                                <div className="text-sm text-blue-800 leading-relaxed">
                                    <strong className="block font-extrabold mb-1">Paso 2: Filtros de Búsqueda</strong>
                                    Ingrese la fecha y los códigos de los vendedores que desea consolidar para esta carga.
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wide">Fecha de Ventas</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all bg-slate-50 font-semibold"
                                        value={searchParams.date}
                                        onChange={e => setSearchParams({ ...searchParams, date: e.target.value })}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wide">Vendedores (Separados por coma)</label>
                                    <input
                                        placeholder="Ej: 001, 002, 003"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all bg-slate-50 font-semibold"
                                        value={searchParams.vendors}
                                        onChange={e => setSearchParams({ ...searchParams, vendors: e.target.value })}
                                    />
                                </div>
                            </div>

                            <Button variant="primary" className="w-full py-4 text-base shadow-lg shadow-blue-500/20" onClick={handleSearchSales}>
                                <FaSearch className="mr-2" /> Buscar Ventas Pendientes
                            </Button>

                            {salesData.length > 0 && (
                                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-3 text-emerald-700 font-bold animate-bounce-short">
                                    <FaCheck /> Se han encontrado {salesData.length} registros listos para procesar.
                                </div>
                            )}
                        </div>
                    )}

                    {/* PASO 3: CONFIRMACION ORDERS */}
                    {step === 3 && (
                        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-xl flex gap-3 items-start">
                                <FaDatabase className="text-emerald-500 mt-1" />
                                <div className="text-sm text-emerald-800 leading-relaxed">
                                    <strong className="block font-extrabold mb-1">Paso 3: Integración de Datos</strong>
                                    Confirme el volcado de las ventas seleccionadas hacia la tabla de órdenes interna.
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 border border-slate-200 p-8 rounded-2xl text-center">
                                <div className="text-4xl font-black text-slate-900 mb-2">{salesData.length}</div>
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Registros de Venta</div>
                                <div className="mt-6 flex items-center justify-center gap-2 text-blue-600 font-bold">
                                    <FaFileAlt /> Load ID: {loadId}
                                </div>
                            </div>

                            <p className="text-center text-sm text-slate-500 px-10">
                                Esta acción es irreversible y preparará los registros para la asignación definitiva del repartidor.
                            </p>
                        </div>
                    )}

                    {/* PASO 4: PARAMETROS CARGA */}
                    {step === 4 && (
                        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl flex gap-3 items-start">
                                <FaTruckLoading className="text-amber-500 mt-1" />
                                <div className="text-sm text-amber-800 leading-relaxed">
                                    <strong className="block font-extrabold mb-1">Paso 4: Asignación Operativa</strong>
                                    Seleccione el repartidor responsable y verifique la bodega de despacho.
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wide">Repartidor / Vendedor</label>
                                    <select
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-semibold appearance-none"
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
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2 opacity-60 grayscale">
                                    <label className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wide">Bodega de Salida (Automática)</label>
                                    <div className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-100 font-bold text-slate-600 flex items-center gap-2">
                                        <FaDatabase className="text-[10px]" /> {loadParams.bodega}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PASO 5: TRASPASO ERP */}
                    {step === 5 && (
                        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-purple-50 border-l-4 border-purple-500 rounded-r-xl flex gap-3 items-start">
                                <FaExchangeAlt className="text-purple-500 mt-1" />
                                <div className="text-sm text-purple-800 leading-relaxed">
                                    <strong className="block font-extrabold mb-1">Paso 5: Finalización y Sincronización</strong>
                                    La carga local se ha completado. ¿Desea iniciar la sincronización inmediata con el ERP?
                                </div>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl text-center flex flex-col items-center">
                                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-5 text-emerald-600 text-3xl shadow-inner animate-bounce-short">
                                    <FaCheck />
                                </div>
                                <h4 className="text-lg font-black text-slate-900 mb-1">¡Carga Registrada con Éxito!</h4>
                                <p className="text-sm text-slate-500 max-w-[300px]">
                                    Los datos han sido insertados correctamente para el lote <strong>{loadId}</strong>.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Cancelar Proceso
                    </Button>
                    <div className="flex gap-3">
                        {step === 2 && salesData.length > 0 && (
                            <Button variant="success" className="px-8 shadow-lg shadow-emerald-500/20" onClick={() => setStep(3)}>
                                Continuar <FaArrowRight className="ml-2" />
                            </Button>
                        )}
                        {step === 3 && (
                            <>
                                <Button variant="ghost" onClick={() => setStep(2)}>
                                    <FaArrowLeft className="mr-2" /> Atrás
                                </Button>
                                <Button variant="primary" className="px-8 shadow-lg shadow-blue-500/20" onClick={handleConfirmOrders}>
                                    Confirmar y Generar <FaDatabase className="ml-2" />
                                </Button>
                            </>
                        )}
                        {step === 4 && (
                            <Button variant="primary" className="px-10 shadow-lg shadow-blue-500/20" onClick={handleConfirmLoadDetail} disabled={!loadParams.route}>
                                Finalizar y Guardar <FaCheck className="ml-2" />
                            </Button>
                        )}
                        {step === 5 && (
                            <>
                                <Button variant="ghost" onClick={() => handleExecuteTraspaso(false)}>
                                    Solo Guardar Local
                                </Button>
                                <Button variant="primary" className="px-8 bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/20" onClick={() => handleExecuteTraspaso(true)}>
                                    Sincronizar con ERP <FaExchangeAlt className="ml-2" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
