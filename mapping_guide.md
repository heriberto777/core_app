# Guía de Configuración de Mapeos (Mappings)

Esta guía detalla las pestañas y propiedades disponibles en el editor de mapeos, su propósito y el efecto que tienen en el proceso de transferencia.

---

## 1. Tab: General
Esta pestaña define la identidad del mapeo y los parámetros globales de conexión y control.

| Propiedad | Propósito | Efecto |
| :--- | :--- | :--- |
| **Nombre** | Identificador humano del mapeo. | Facilita la búsqueda y selección en la lista de tareas. |
| **Tipo de Entidad** | Categoriza el mapeo (Pedidos, Facturas, Clientes). | Organiza la lógica interna y filtros predeterminados. |
| **Servidor Origen/Destino** | Define los nodos entre los que viaja la data. | Determina qué pools de conexión usará el sistema. |
| **Configuración Activa** | Interruptor maestro. | Si está desactivado, el motor de transferencia ignorará este mapeo por completo. |
| **Campo/Valor Marcado** | Mecanismo de control de duplicados. | Tras una transferencia exitosa, el sistema actualizará este campo en la BD origen para marcar que el registro ya fue procesado. |
| **Configuración Consecutivos** | Lógica de numeración secuencial. | Permite generar IDs automáticos basados en patrones (ej: "PED-{YEAR}-{00001}") en el destino. |
| **Configuración Promociones** | Lógica comercial (opcional). | Aplica descuentos o bonificaciones automáticamente durante la transferencia basándose en reglas detectadas. |

---

## 2. Tab: Tipos Docto (Reglas de Documento)
Se utiliza para aplicar lógica condicional basada en los datos de origen.

* **Propósito**: Segmentar el flujo de datos.
* **Efecto**: Permite que un mismo mapeo se comporte de forma distinta (o aplique filtros extra) según un valor específico en la base de datos origen. Por ejemplo, procesar solo registros de tipo "VENTA" y omitir "DEVOLUCION".

---

## 3. Tab: Dependencias FK (Foreign Key)
Asegura la integridad referencial en la base de datos de destino.

| Propiedad | Propósito | Efecto |
| :--- | :--- | :--- |
| **Campo de Origen** | El campo que contiene una referencia foránea. | Indica al sistema qué valor debe validar o asegurar. |
| **Tabla Dependiente** | La tabla donde debe existir el registro relacionado. | Especifica el destino de la validación. |
| **Insertar si no existe** | Acción proactiva de integridad. | Si el ID referenciado no existe en el destino, el sistema intentará crearlo primero con valores mínimos o por defecto. |
| **Orden de Ejecución** | Prioridad de validación. | Las dependencias con menor número se validan/insertan primero. |

---

## 4. Tab: Tablas y Campos
Es el núcleo técnico donde se define el "puente" real entre bases de datos.

### Estructura de Tablas
* **Tabla Origen vs Destino**: Mapea nombres de tablas físicas.
* **Tabla de Detalle**: Indica si es una relación 1:N (ej: líneas de un pedido).
* **Join Type**: Define cómo se unen los detalles con la tabla padre.

### Mapeo de Campos
* **Origen / Destino**: Relación columna a columna.
* **Valor por Defecto**: Valor que se usará si el origen viene nulo o vacío.
* **Lookup en Destino**: En lugar de copiar el valor, realiza una consulta SQL en la BD destino para obtener un ID real (muy útil para llaves foráneas complejas).
* **Mapeo de Valores (Transforms)**: Permite traducir valores específicos (ej: Origen "A" -> Destino "ACTIVO").
* **Validar Existencia**: El proceso fallará si el registro referenciado no se encuentra en el destino.
* **Conversión de Unidades**: Aplica factores matemáticos (multiplicar/dividir) si las unidades de medida difieren entre sistemas.

---

## 5. Efectos Técnicos (Backend)
Cuando se ejecuta una tarea de transferencia usando un mapeo, el servicio [DynamicTransferService](file:///d:/proyectos/app/core_app/server/services/DynamicTransferService.js#14-6496) realiza las siguientes acciones automáticas:

1.  **Resolución de Lookups**: Si un campo tiene activado "Lookup en Destino", el sistema pausa la inserción, consulta el servidor de destino con el SQL configurado, y reemplaza el valor de origen por el resultado obtenido (ej: cambiar un nombre de cliente por su ID interno en el destino).
2.  **Integridad Activa**: Antes de insertar el registro principal, se escanean las **Dependencias FK**. Si falta un padre (ej: un Vendedor o un Artículo), se crea en caliente para evitar errores de base de datos.
3.  **Procesamiento de Promociones**: Si está habilitado, el sistema analiza las líneas de detalle buscando artículos bonificados. Si los encuentra, recalcula totales y marcas de bonificación basándose en las reglas de la pestaña General.
4.  **Marcado de Control**: Al terminar, se ejecuta un `UPDATE` en la tabla origen usando el `markProcessedField` para que el registro no se vuelva a transferir.
