import React, { useState } from "react";
import styled from "styled-components";
import { useAuth, usePermissions, useAuditLogs, AuditFiltersPanel, AuditDataTable } from "../../index";
import { Container } from "../index";

const AuditLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
`;

const WelcomeSection = styled.div`
  margin-bottom: 20px;
  
  h1 {
    font-size: 28px;
    font-weight: 900;
    margin-bottom: 8px;
    color: inherit;
  }
  
  p {
    opacity: 0.7;
    font-size: 16px;
  }
`;

export function AuditCenter() {
    const { accessToken } = useAuth();
    const { hasPermission, isAdmin } = usePermissions();

    const canExportAudit = hasPermission("history", "update") || isAdmin;

    const {
        logs,
        meta,
        loading,
        logType,
        filters,
        pagination,
        actions
    } = useAuditLogs(accessToken);

    return (
        <Container>
            <main style={{ padding: '40px 20px' }}>
                <AuditLayout>
                    <WelcomeSection>
                        <h1>Central de Auditoría</h1>
                        <p>Supervisión integral de eventos del sistema y transferencias logísticas.</p>
                    </WelcomeSection>

                    <AuditFiltersPanel
                        logType={logType}
                        setLogType={actions.setLogType}
                        filters={filters}
                        onFilterChange={actions.updateFilters}
                        onRefresh={actions.refreshLogs}
                        onExport={actions.exportCSV}
                        loading={loading}
                    />

                    <AuditDataTable
                        data={logs}
                        type={logType}
                        pagination={meta}
                        onPageChange={actions.changePage}
                        loading={loading}
                    />
                </AuditLayout>
            </main>
        </Container>
    );
}
