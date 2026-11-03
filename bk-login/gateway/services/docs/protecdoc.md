# ProtecDoc — Endpoints del Gateway

Base URL: `/api-gateway/protecdoc/`

Los endpoints de trazabilidad, documentos y descarga requieren JWT en el header `Authorization: Bearer <token>`.  
El endpoint de radicación no requiere autenticación (flujo exclusivo de back-end a back-end).

---

## 1. Radicar documento

**`POST /api-gateway/protecdoc/radicado/`**

Crea un nuevo radicado en ProtecDoc. Recibe los datos del remitente y los archivos por separado; el gateway construye internamente el payload completo que ProtecDoc espera.

### Cómo enviarlo

`Content-Type: multipart/form-data`

### Campos de texto — comunes a todos los tipos

| Campo | Requerido | Descripción |
|---|---|---|
| `dependencia` | Sí | Dependencia destino. Valores: `DER`, `SESP` |
| `asunto` | Sí | Descripción / asunto del radicado |
| `personType` | No | Tipo de persona del remitente. Valores: `natural` (default), `juridica`, `anonima` |

La `dependencia` determina automáticamente la sección y subsección:

| `dependencia` | `requestSubsection` | `requestSection` |
|---|---|---|
| `DER` | `1033` | `1030` |
| `SESP` | `1290` | `1200` |

### Campos según `personType`

#### `natural` (default)

| Campo | Requerido | Descripción |
|---|---|---|
| `numero_identificacion` | Sí | Número de identificación |
| `nombres` | Sí | Nombre completo |
| `direccion` | Sí | Dirección |
| `celular` | Sí | Celular |
| `email` | Sí | Correo electrónico |
| `departamento` | Sí | Código DIVIPOLA del departamento (ej. `"11"`) |
| `municipio` | Sí | Código DIVIPOLA del municipio (ej. `"11001"`) |
| `tipo_identificacion` | No | Tipo de documento. Default: `TP-DOCCC` |

#### `juridica`

Incluye todos los campos de `natural` más:

| Campo | Requerido | Descripción |
|---|---|---|
| `nit` | Sí | NIT con dígito de verificación (ej. `"900000000-0"`) |
| `razon_social` | Sí | Razón social de la empresa |

#### `anonima`

| Campo | Requerido | Descripción |
|---|---|---|
| `email` | Sí | Correo electrónico de contacto |

### Archivos

| Campo | Requerido | Descripción |
|---|---|---|
| `files` | Sí (uno o más) | Archivos a radicar. El **primer archivo** queda como documento principal (`principal: true`), los demás como secundarios. |

> Los nombres de los archivos se normalizan automáticamente antes de enviarlos: minúsculas, sin tildes, espacios reemplazados por `_`.  
> Ejemplo: `"Acreditación población.pdf"` → `"acreditacion_poblacion.pdf"`

Los siguientes campos se inyectan internamente sin necesidad de enviarlos:

| Campo | Valor fijo |
|---|---|
| `electronicDistribution` | `true` |
| `physicDistribution` | `true` |
| `receptionChannel` | `ME-RECESIS` |
| `documentType` | `TL-DOCCOM` |
| `radicationUser` | `radicacion.eco` |
| `comunicationType` | `EE` |
| `conEnCalidad` (jurídica) | `TP-ACCR` |
| `dateRequest` / `dateDocument` | Fecha y hora actual (UTC) |
| `country` | `COL` |
| `foliosNumber` | `1` (por documento) |
| `supportTypeCode` | `TP-SOPE` |
| `attachmentCode` | `ANE-OT` |

### Respuesta exitosa

```json
{
  "nro_radicado": "EXT-2026-00001234",
  "fecha_radicado": "2026-05-04T10:30:00.000Z"
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | `dependencia` inválida, campos requeridos ausentes, o no se enviaron archivos |
| `405` | Método distinto a POST |
| `502` | Error de comunicación con ProtecDoc |

### Ejemplo con curl

```bash
curl -X POST https://ecosistemapruebas.unp.gov.co/api-gateway/protecdoc/radicado/ \
  -F "requestSubsection=1033" \
  -F "requestSection=1030" \
  -F "description=Formulario de solicitud - Juan Perez - CC 1000100100" \
  -F "identificationNumber=1000100100" \
  -F "name=Juan Perez" \
  -F "address=Bogotá" \
  -F "cellphone=3000000000" \
  -F "email=juan@mail.com" \
  -F "department=11" \
  -F "municipality=11001" \
  -F "files=@/ruta/formulario.pdf" \
  -F "files=@/ruta/cedula.pdf"
```

---

## 2. Trazabilidad

**`GET /api-gateway/protecdoc/trazabilidad/`**

Consulta el historial de estados de un radicado.

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params

| Parámetro | Requerido | Descripción |
|---|---|---|
| `nro_radicado` | Sí | Número de radicado (ej. `EXT-2026-00001234`) |

### Respuesta exitosa

Retorna directamente el JSON de ProtecDoc con el historial de trazabilidad del radicado.

```json
{
  "objectId": "EXT-2026-00001234",
  "referred": [...],
  "status": [...]
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | `nro_radicado` ausente |
| `405` | Método distinto a GET |
| `502` | Error de comunicación con ProtecDoc |

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemapruebas.unp.gov.co/api-gateway/protecdoc/trazabilidad/?nro_radicado=EXT-2026-00001234" \
  -H "Authorization: Bearer <jwt>"
```

---

## 3. Consulta de documentos

**`GET /api-gateway/protecdoc/documentos/`**

Consulta los documentos asociados a un radicado. Internamente realiza dos llamadas a ProtecDoc: primero obtiene el listado de documentos y luego enriquece cada uno con su detalle completo.

El `tipo_comunicacion` se deriva automáticamente del prefijo del número de radicado, no es necesario enviarlo:

| Prefijo | tipo_comunicacion |
|---|---|
| `EXT` | `EE` |
| `MEM` | `SI` |
| `OFI` | `SE` |

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params

| Parámetro | Requerido | Descripción |
|---|---|---|
| `nro_radicado` | Sí | Número de radicado (ej. `EXT-2026-00001234`) |

### Respuesta exitosa

```json
{
  "documentos": [
    {
      "id_documento": "d00d65a2-dc92-45b4-91bd-c2aff062d7d5",
      "nombreDocumento": "EXT-2026-00000163.pdf",
      "tipoDocumento": "application/pdf"
    },
    {
      "id_documento": "3d833ae4-b2c9-40b7-be95-14925e84a271",
      "nombreDocumento": "EXT-2026-00000163anexo1.pdf",
      "tipoDocumento": "application/pdf"
    }
  ]
}
```

Si el radicado no tiene documentos asociados, `documentos` retorna como lista vacía `[]`.

> El `id_documento` de cada elemento es el que se debe usar en el endpoint de descarga.

### Errores

| Código | Causa |
|---|---|
| `400` | `nro_radicado` ausente o prefijo no reconocido (distinto a EXT, MEM, OFI) |
| `405` | Método distinto a GET |
| `502` | Error de comunicación con ProtecDoc |

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemapruebas.unp.gov.co/api-gateway/protecdoc/documentos/?nro_radicado=EXT-2026-00001234" \
  -H "Authorization: Bearer <jwt>"
```

---

## 4. Descarga de documento

**`GET /api-gateway/protecdoc/documentos/descargar/`**

Descarga el binario de un documento. El `id_documento` se obtiene del campo `id_documento` en la respuesta del endpoint de consulta de documentos.

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params

| Parámetro | Requerido | Descripción |
|---|---|---|
| `id_documento` | Sí | ID del documento a descargar |

### Respuesta exitosa

Retorna el binario del archivo con `Content-Type: application/pdf`.

### Errores

| Código | Causa |
|---|---|
| `400` | `id_documento` ausente |
| `405` | Método distinto a GET |
| `502` | Error de comunicación con ProtecDoc |

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemapruebas.unp.gov.co/api-gateway/protecdoc/documentos/descargar/?id_documento=abc123" \
  -H "Authorization: Bearer <jwt>" \
  --output documento.pdf
```
