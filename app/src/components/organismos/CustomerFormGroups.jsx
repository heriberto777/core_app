import React from "react";
import { CustomerField } from "../../index";

export function CustomerFormGroups({
    groups,
    customerData,
    meta,
    loadingFields,
    onChange,
    onRefreshField
}) {
    return (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {groups.map((group, idx) => (
                <div key={idx} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col gap-8 hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-center gap-4">
                        <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] whitespace-nowrap">
                            {group.title}
                        </h4>
                        <div className="h-px bg-slate-100 flex-1" />
                    </div>
                    
                    <div className="flex flex-wrap gap-6">
                        {group.fields.map(fieldName => (
                            <CustomerField
                                key={fieldName}
                                fieldName={fieldName}
                                value={customerData[fieldName]}
                                meta={meta[fieldName] || {}}
                                loading={loadingFields[fieldName]}
                                onChange={onChange}
                                onRefresh={onRefreshField}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
