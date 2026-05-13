import React from "react";
import { FaSync, FaInfoCircle } from "react-icons/fa";

/**
 * Corporate CustomerField (Tailwind Edition)
 */
export function CustomerField({
    fieldName,
    value,
    meta,
    loading,
    onChange,
    onRefresh,
    className = ""
}) {
    const isReadOnly = meta.isEditable === false && !meta.dynamicQuery;
    const displayName = meta.displayName || fieldName;
    const type = meta.fieldType || "text";

    const baseInputClasses = `
        flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all duration-200
        ${isReadOnly 
            ? "bg-slate-50/50 border-slate-200/40 text-slate-500" 
            : "border-slate-200 bg-white text-slate-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"}
        placeholder:text-slate-400/60
    `;

    const renderInput = () => {
        if (type === "boolean" || typeof value === "boolean") {
            return (
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-slate-50/50 rounded-xl border border-slate-200/40">
                    <input
                        type="checkbox"
                        name={fieldName}
                        checked={Boolean(value)}
                        onChange={onChange}
                        disabled={loading || isReadOnly}
                        className="w-4.5 h-4.5 accent-primary-500"
                    />
                    <span className="text-sm font-bold">{displayName}</span>
                </label>
            );
        }

        if (type === "textarea") {
            return (
                <textarea
                    name={fieldName}
                    value={value || ""}
                    onChange={onChange}
                    disabled={loading || isReadOnly}
                    readOnly={isReadOnly}
                    className={`${baseInputClasses} min-h-20 resize-y`}
                />
            );
        }

        if (type === "select") {
            return (
                <select
                    name={fieldName}
                    value={value || ""}
                    onChange={onChange}
                    disabled={loading || isReadOnly}
                    className={baseInputClasses}
                >
                    <option value="">-- Seleccione --</option>
                    {meta.options?.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
                </select>
            );
        }

        return (
            <input
                type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                name={fieldName}
                value={value || ""}
                onChange={onChange}
                disabled={loading || isReadOnly}
                readOnly={isReadOnly}
                placeholder={displayName}
                className={baseInputClasses}
            />
        );
    };

    return (
        <div className={`flex flex-col gap-2 flex-1 basis-[250px] min-w-[250px] ${className}`}>
            <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    {displayName}
                    {meta.isRequired && <span className="text-red-500">*</span>}
                </label>
            </div>

            <div className="flex gap-2 items-stretch">
                {renderInput()}
                {meta.dynamicQuery && (
                    <button
                        onClick={() => onRefresh(fieldName)}
                        disabled={loading}
                        title="Sincronizar valor dinámico"
                        className={`
                            w-11 flex items-center justify-center bg-primary-500 text-white border-none rounded-xl cursor-pointer
                            transition-all duration-200 hover:scale-105 hover:brightness-110
                            ${loading ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                    >
                        <FaSync className={loading ? "animate-spin" : ""} />
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-0.5">
                {meta.originalField && (
                    <div className="text-[10px] font-extrabold text-slate-400/60 flex items-center gap-1">
                        <FaInfoCircle size={10} /> Mapeado de: <strong>{meta.originalField}</strong>
                    </div>
                )}
                {meta.queryType === "sequence" && meta.currentValue !== undefined && (
                    <div className="text-[10px] font-extrabold text-slate-400/60">
                        Val. Actual Seq: {meta.currentValue}
                    </div>
                )}
            </div>
        </div>
    );
}