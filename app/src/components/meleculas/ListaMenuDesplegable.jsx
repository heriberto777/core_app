import styled from "styled-components";
import { ItemsDesplegable} from "../../index";
import { v } from  '../../styles/index'

export function ListaMenuDesplegable({ data, top, funcion }) {
  return (
    <Container $top={top}>
      {data.map((item, index) => {
        return (
          <ItemsDesplegable
            key={index}
            item={item}
            funcion={() => funcion(item.tipo)}
          />
        );
      })}
    </Container>
  );
}
const Container = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  position: absolute;
  background-color: ${({ theme }) => theme.bg4};
  border-radius: 22px;
  top: ${(props) => props.$top};
  box-shadow: ${() => v.boxshadowGray};
`;
