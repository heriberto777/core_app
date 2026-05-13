import React from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";

const COLORS = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b"];

const ChartCard = ({ title, children }) => (
    <div className="bg-white/70 backdrop-blur-xl border border-slate-200 rounded-[32px] p-8 min-h-[450px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 group">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 border-b border-slate-50 pb-4 group-hover:text-slate-600 transition-colors">
            {title}
        </h3>
        <div className="w-full h-[300px]">
            {children}
        </div>
    </div>
);

export const ExecutionLineChart = ({ data }) => (
    <ChartCard title="Tendencia de Ejecuciones (7 días)">
        <ResponsiveContainer>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 800 }} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 800 }} />
                <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 800, fontSize: '12px' }}
                />
                <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="#10b981"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorComp)"
                    name="Exitosas"
                />
                <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#ef4444"
                    strokeWidth={4}
                    fillOpacity={0}
                    name="Fallidas"
                />
            </AreaChart>
        </ResponsiveContainer>
    </ChartCard>
);

export const SuccessDonutChart = ({ data }) => (
    <ChartCard title="Tasa de Éxito Global">
        <ResponsiveContainer>
            <PieChart>
                <Pie
                    data={data}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 800 }}
                />
                <Legend 
                    iconType="circle" 
                    verticalAlign="bottom" 
                    align="center"
                    wrapperStyle={{ paddingTop: '30px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }} 
                />
            </PieChart>
        </ResponsiveContainer>
    </ChartCard>
);

export const LatencyBarChart = ({ data }) => (
    <ChartCard title="Latencia de Servidores (ms)">
        <ResponsiveContainer>
            <BarChart data={data} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 800 }} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 800 }} />
                <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 800 }}
                />
                <Bar dataKey="server1" fill="#3b82f6" radius={[6, 6, 0, 0]} name="SQL Server Central" />
                <Bar dataKey="server2" fill="#6366f1" radius={[6, 6, 0, 0]} name="Réplica Logística" />
            </BarChart>
        </ResponsiveContainer>
    </ChartCard>
);

export const IntelligenceGrids = ({ stats }) => {
    if (!stats) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 mt-8 animate-in fade-in duration-700 slide-in-from-bottom-4">
            <ExecutionLineChart data={stats.transfersByDay} />
            <SuccessDonutChart data={stats.successRate} />
            <LatencyBarChart data={stats.serverResponseTimes} />
        </div>
    );
};
