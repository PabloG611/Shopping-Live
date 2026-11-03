from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# Crear documento
doc = Document()

# Configurar márgenes
sections = doc.sections
for section in sections:
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)

# Título principal
title = doc.add_paragraph()
title_run = title.add_run("Arquitectura de Enrutamiento del Proyecto")
title_run.font.size = Pt(24)
title_run.font.bold = True
title_run.font.color.rgb = RGBColor(0, 51, 102)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Subtítulo
subtitle = doc.add_paragraph()
subtitle_run = subtitle.add_run("API Gateway - Comunicación Backend y Frontend")
subtitle_run.font.size = Pt(12)
subtitle_run.font.italic = True
subtitle_run.font.color.rgb = RGBColor(100, 100, 100)
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_paragraph()  # Espaciador

# Sección 1: Capas de Seguridad
heading1 = doc.add_heading("1. Capas de Seguridad (Middleware)", level=1)

doc.add_paragraph(
    "El sistema implementa múltiples capas de seguridad que se aplican secuencialmente a cada solicitud:"
)

# Tabla de capas
table = doc.add_table(rows=6, cols=2)
table.style = 'Light Grid Accent 1'
hdr_cells = table.rows[0].cells
hdr_cells[0].text = 'Capa'
hdr_cells[1].text = 'Función'

layers = [
    ("SecureRequestMiddleware", "Valida origen/referer, verifica JWT Bearer, valida firma HMAC, gestiona token interno (B2B)"),
    ("@jwt_required", "Valida integridad y autenticidad del token JWT"),
    ("@rate_limit", "Aplica límites de tasa por usuario para prevenir abuso"),
    ("proxy()", "Función principal del gateway que enruta solicitudes"),
    ("Sanitización de Path", "Previene path traversal y ataques SSRF"),
]

for i, (layer, func) in enumerate(layers, 1):
    row_cells = table.rows[i].cells
    row_cells[0].text = layer
    row_cells[1].text = func

doc.add_paragraph()

# Sección 2: Flujo de Enrutamiento
heading2 = doc.add_heading("2. Flujo de Enrutamiento en el Gateway", level=1)

doc.add_paragraph(
    "El siguiente diagrama muestra el flujo secuencial de una solicitud a través del gateway:"
)

flow_steps = [
    "Solicitud HTTP llega al gateway",
    "Se extrae el header BK-Service",
    "Se valida que el backend existe en el diccionario BK_API",
    "Se extrae la identidad del usuario del token JWT",
    "Se busca el usuario en la base de datos",
    "Se obtiene el ID único del usuario (Pato-ID)",
    "Se analiza la estructura de la URL (/dependencia/grupo/rol/recurso)",
    "Se valida que el usuario tiene acceso al rol especificado",
    "Se construye la URL del backend destino",
    "Se agregan headers internos (Pato-ID, X-Internal-Token)",
    "Se reenvía la solicitud al backend correspondiente",
    "Se retorna la respuesta al cliente"
]

for i, step in enumerate(flow_steps, 1):
    p = doc.add_paragraph(step, style='List Number')

doc.add_paragraph()

# Sección 3: Configuración de Backends
heading3 = doc.add_heading("3. Configuración de Backends", level=1)

doc.add_paragraph(
    "Los backends se definen mediante variables de entorno. El sistema soporta los siguientes backends:"
)

backends = [
    ("api-svc", "Servicios a la ciudadanía"),
    ("api-gsc", "Gestión de servicios y consultas (GSC/UNP)"),
    ("api-doc", "Gestión documental"),
    ("api-ser", "Sistema de Evaluación de Recursos (SER)"),
    ("api-sesp", "Sistema de Evaluación de Solicitudes y Procesos"),
    ("api-data", "Datos geográficos"),
    ("api-pdf", "Generación y procesamiento de PDF"),
    ("api-auth", "Autenticación centralizada"),
    ("api-noti", "Gestión de notificaciones"),
    ("api-sgai", "Sistema de Gestión de Asuntos Internos"),
    ("api-tools", "Herramientas generales"),
    ("api-hei", "Histórico del ecosistema de información"),
]

table2 = doc.add_table(rows=len(backends) + 1, cols=2)
table2.style = 'Light Grid Accent 1'
hdr_cells2 = table2.rows[0].cells
hdr_cells2[0].text = 'Backend'
hdr_cells2[1].text = 'Descripción'

for i, (backend, desc) in enumerate(backends, 1):
    row_cells = table2.rows[i].cells
    row_cells[0].text = backend
    row_cells[1].text = desc

doc.add_paragraph()

# Sección 4: Estructura de URLs
heading4 = doc.add_heading("4. Estructura de URLs y Validación de Roles", level=1)

doc.add_paragraph(
    "Las URLs del sistema siguen un patrón específico que permite validar permisos granulares:"
)

url_pattern = doc.add_paragraph()
url_pattern.add_run("/dependencia/grupo/rol/recurso").font.bold = True

doc.add_paragraph(
    "Cada componente se extrae y valida:",
    style='List Bullet'
)

url_components = [
    ("dependencia", "Nivel organizacional principal (ej: 'sg' para Sistema de Gestión)"),
    ("grupo", "Subunidad dentro de la dependencia (ej: 'gag' para Gestión de Activos)"),
    ("rol", "Función o área específica (ej: 'viaticos', 'bienes', 'transferencia')"),
    ("recurso", "Recurso específico dentro del rol"),
]

for component, desc in url_components:
    p = doc.add_paragraph(style='List Bullet')
    p.add_run(component).bold = True
    p.add_run(f": {desc}")

doc.add_paragraph()

# Sección 5: Headers
heading5 = doc.add_heading("5. Headers de Comunicación", level=1)

doc.add_paragraph(
    "La comunicación utiliza los siguientes headers críticos para identificación y enrutamiento:"
)

table3 = doc.add_table(rows=9, cols=4)
table3.style = 'Light Grid Accent 1'
hdr_cells3 = table3.rows[0].cells
hdr_cells3[0].text = 'Header'
hdr_cells3[1].text = 'Propósito'
hdr_cells3[2].text = 'Origen'
hdr_cells3[3].text = 'Ejemplo'

headers_data = [
    ("Authorization", "JWT del usuario", "Cliente (frontend/móvil)", "Bearer eyJhbGc..."),
    ("BK-Service", "Identifica backend destino", "Frontend", "api-auth"),
    ("X-Internal-Token", "Autenticación backend-to-backend", "Backend", "[token-encriptado]"),
    ("Pato-ID", "ID del usuario (agregado por gateway)", "Gateway", "12345"),
    ("X-Signature", "Firma HMAC de request (solo móvil)", "Aplicación móvil", "[hash-sha256]"),
    ("X-Timestamp", "Timestamp del request (solo móvil)", "Aplicación móvil", "[epoch-time]"),
    ("Origin / Referer", "Validación de origen", "Cliente (navegador)", "https://frontend.com"),
    ("x-request-source", "Identifica solicitud móvil", "Cliente (móvil)", "mobile_app"),
]

for i, (header, purpose, origin, example) in enumerate(headers_data, 1):
    row_cells = table3.rows[i].cells
    row_cells[0].text = header
    row_cells[1].text = purpose
    row_cells[2].text = origin
    row_cells[3].text = example

doc.add_paragraph()

# Sección 6: Tipos de Autenticación
heading6 = doc.add_heading("6. Tipos de Autenticación", level=1)

doc.add_paragraph(
    "El middleware SecureRequestMiddleware maneja tres escenarios de autenticación diferentes:"
)

# 6.1 Móviles
doc.add_heading("6.1 Clientes Móviles", level=2)
mobile_points = [
    "Header requerido: x-request-source: mobile_app",
    "Validación de User-Agent: application-unp/1.0",
    "Método de firma: HMAC-SHA256 en body JSON",
    "Headers necesarios: X-Signature y X-Timestamp",
    "Protección adicional contra tampering de requests",
]
for point in mobile_points:
    doc.add_paragraph(point, style='List Bullet')

# 6.2 Backend-to-Backend
doc.add_heading("6.2 Comunicación Backend-to-Backend", level=2)
b2b_points = [
    "Header de autenticación: X-Internal-Token",
    "Token de servicio previamente configurado",
    "Sin validación de Origin/Referer",
    "Permite bypass de validaciones web",
    "Usado para comunicación interna entre servicios",
]
for point in b2b_points:
    doc.add_paragraph(point, style='List Bullet')

# 6.3 Clientes Web
doc.add_heading("6.3 Clientes Web (Navegadores)", level=2)
web_points = [
    "Header requerido: Authorization: Bearer <token>",
    "Validación de Origin/Referer contra lista configurada",
    "En desarrollo: bypass automático si no es producción",
    "Protección contra CSRF implícita",
    "Compatible con navegadores estándar",
]
for point in web_points:
    doc.add_paragraph(point, style='List Bullet')

doc.add_paragraph()

# Sección 7: Sanitización y Seguridad
heading7 = doc.add_heading("7. Sanitización y Seguridad de Paths", level=1)

doc.add_paragraph(
    "El sistema implementa sanitización de paths para prevenir ataques comunes:"
)

security_items = [
    ("Path Traversal", "Bloquea intentos de acceso a directorios superiores (../../)"),
    ("SSRF (Server-Side Request Forgery)", "Rechaza paths absolutos (/)"),
    ("Path Traversal Inverso", "Detecta .. tras normalización POSIX"),
    ("Normalización", "Convierte paths a formato POSIX estándar"),
    ("Validación de Caracteres", "Permite Unicode y caracteres válidos en URLs"),
]

for attack, protection in security_items:
    p = doc.add_paragraph(style='List Bullet')
    p.add_run(attack).bold = True
    p.add_run(f": {protection}")

doc.add_paragraph()

# Sección 8: Validación de Permisos
heading8 = doc.add_heading("8. Proceso de Validación de Permisos", level=1)

doc.add_paragraph(
    "La validación de permisos se realiza consultando la estructura de roles del usuario:"
)

permission_steps = [
    "Se obtiene la dependencia, grupo y rol del URL solicitado",
    "Si el endpoint está bloqueado o inactivo: se rechaza",
    "Si el endpoint tiene rolRequired=False en el catálogo: se salta la validación de rol",
    "Si no:",
    "   • Se busca un perfil del usuario con esa dependencia.url",
    "   • Se valida que grupo.url coincida",
    "   • Se valida que rol.url contenga la ruta solicitada",
    "Si todas las condiciones se cumplen: la solicitud se reenvía",
    "Si alguna falla: se retorna HTTP 404 Not Found",
]

for step in permission_steps:
    if step.startswith("   "):
        doc.add_paragraph(step, style='List Bullet 2')
    elif step.startswith("Si"):
        doc.add_paragraph(step, style='List Bullet')
    else:
        doc.add_paragraph(step, style='List Number')

doc.add_paragraph()

# Sección 9: Rate Limiting
heading9 = doc.add_heading("9. Rate Limiting", level=1)

doc.add_paragraph(
    "El sistema aplica limitación de tasa a nivel de usuario para proteger contra abuso:"
)

rate_limit_table = doc.add_table(rows=6, cols=2)
rate_limit_table.style = 'Light Grid Accent 1'
rl_hdr = rate_limit_table.rows[0].cells
rl_hdr[0].text = 'Parámetro'
rl_hdr[1].text = 'Valor'

rl_data = [
    ("Scope", "gateway-proxy"),
    ("Límite de intentos", "120 solicitudes"),
    ("Ventana de tiempo", "60 segundos"),
    ("Tiempo de bloqueo", "300 segundos (5 minutos)"),
    ("Identificación", "Por username extraído del JWT"),
]

for i, (param, value) in enumerate(rl_data, 1):
    row = rate_limit_table.rows[i].cells
    row[0].text = param
    row[1].text = value

doc.add_paragraph()

# Sección 10: Resumen
heading10 = doc.add_heading("10. Resumen Arquitectónico", level=1)

summary_text = (
    "La arquitectura de enrutamiento del proyecto implementa un patrón de proxy inverso "
    "centralizado con validación multinivel. El API Gateway actúa como puerta de entrada única "
    "para todos los backends del ecosistema, proporcionando:\n\n"
)

doc.add_paragraph(summary_text)

summary_points = [
    "Enrutamiento dinámico basado en headers (BK-Service)",
    "Control de acceso granular a nivel de URL y roles",
    "Seguridad centralizada (autenticación, validación de firma, sanitización)",
    "Trazabilidad completa de solicitudes mediante Pato-ID",
    "Protección contra ataques comunes (path traversal, SSRF, CSRF)",
    "Soporte para múltiples tipos de clientes (navegador, móvil, backend)",
    "Rate limiting por usuario para prevenir abuso",
    "Validación y transformación de solicitudes",
]

for point in summary_points:
    doc.add_paragraph(point, style='List Bullet')

# Pie de página
doc.add_paragraph()
footer_para = doc.add_paragraph()
footer_run = footer_para.add_run("Documento generado automáticamente | Proyecto bk-login")
footer_run.font.size = Pt(9)
footer_run.font.italic = True
footer_run.font.color.rgb = RGBColor(150, 150, 150)
footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Guardar documento
output_path = "ARQUITECTURA_ENRUTAMIENTO.docx"
doc.save(output_path)
print(f"✅ Documento creado exitosamente: {output_path}")
