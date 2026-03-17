import React from "react";
import styled from "styled-components";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 24px;
  margin-top: 24px;
`;

const ChartCard = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  padding: 24px;
  min-height: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);

  h3 {
    font-size: 16px;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 24px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const COLORS = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b"];

export const ExecutionLineChart = ({ data }) => (
    <ChartCard>
        <h3>Tendencia de Ejecuciones (7 días)</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="completed"
                        stroke="#10b981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorComp)"
                        name="Exitosas"
                    />
                    <Area
                        type="monotone"
                        dataKey="failed"
                        stroke="#ef4444"
                        strokeWidth={3}
                        fillOpacity={0}
                        name="Fallidas"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    </ChartCard>
);

export const SuccessDonutChart = ({ data }) => (
    <ChartCard>
        <h3>Tasa de Éxito Global</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={data}
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    </ChartCard>
);

export const LatencyBarChart = ({ data }) => (
    <ChartCard>
        <h3>Latencia de Servidores (ms)</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none' }}
                    />
                    <Bar dataKey="server1" fill="#3b82f6" radius={[4, 4, 0, 0]} name="SQL Server Central" />
                    <Bar dataKey="server2" fill="#6366f1" radius={[4, 4, 0, 0]} name="Réplica Logística" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </ChartCard>
);

export const IntelligenceGrids = ({ stats }) => {
    if (!stats) return null;

    return (
        <Grid>
            <ExecutionLineChart data={stats.transfersByDay} />
            <SuccessDonutChart data={stats.successRate} />
            <LatencyBarChart data={stats.serverResponseTimes} />
        </Grid>
    );
};
