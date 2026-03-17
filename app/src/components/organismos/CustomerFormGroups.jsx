import React from "react";
import styled from "styled-components";
import { CustomerField } from "../../index";

const Container = styled.div` display: flex; flex-direction: column; gap: 32px; `;

const GroupCard = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; box-shadow: ${({ theme }) => theme.shadows.medium};
  display: flex; flex-direction: column; gap: 20px;
`;

const GroupTitle = styled.h4`
  margin: 0; font-size: 15px; font-weight: 800; color: ${({ theme }) => theme.primary};
  display: flex; align-items: center; gap: 10px; text-transform: uppercase; letter-spacing: 1px;
  &::after { content: ''; flex: 1; height: 1px; background: ${({ theme }) => theme.border}40; }
`;

const FieldsGrid = styled.div`
  display: flex; flex-wrap: wrap; gap: 20px;
`;

export function CustomerFormGroups({
    groups,
    customerData,
    meta,
    loadingFields,
    onChange,
    onRefreshField
}) {
    return (
        <Container>
            {groups.map((group, idx) => (
                <GroupCard key={idx}>
                    <GroupTitle>{group.title}</GroupTitle>
                    <FieldsGrid>
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
                    </FieldsGrid>
                </GroupCard>
            ))}
        </Container>
    );
}
