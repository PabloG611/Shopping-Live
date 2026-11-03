# Frontend - Transferencias Almacén UNP

Sistema de gestión de transferencias de almacén y consulta de activos legacy desde Firebird.

**Stack:** React 19 + TypeScript + Vite + React Router

---

## 📋 Índice

1. [Descripción](#descripción)
2. [Instalación](#instalación)
3. [Configuración](#configuración)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Módulo: Consulta de Activos Firebird](#módulo-consulta-de-activos-firebird)
6. [Desarrollo](#desarrollo)
7. [Build y Despliegue](#build-y-despliegue)
8. [Troubleshooting](#troubleshooting)

---

## 📖 Descripción

Aplicación frontend para:
- Gestión de transferencias de activos entre funcionarios
- Consulta de activos asignados desde base de datos legacy Firebird
- Integración con backend Django

---

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Levantar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

---

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
# URL del backend Django
VITE_API_URL=http://localhost:8000
```

**Para producción:**
```env
VITE_API_URL=https://api.unp.gov.co
```

### Configuración de Rutas

El proyecto usa React Router con basename `/sg/gag`:

```typescript
// src/App.tsx
<BrowserRouter basename="/sg/gag">
  <Routes>
    <Route path="consulta-activos-firebird" element={<ConsultaActivosFirebirdPage />} />
  </Routes>
</BrowserRouter>
```

**URLs resultantes:**
- Desarrollo: `http://localhost:5173/sg/gag/consulta-activos-firebird`
- Producción: `https://dominio.com/sg/gag/consulta-activos-firebird`

---

## 📁 Estructura del Proyecto

```
ft-sg-gag-transferencias-almacen/
├── src/
│   ├── components/          # Componentes reutilizables
│   ├── hooks/              # Custom hooks
│   │   └── useActivosFirebird.ts    # Hook para consulta de activos
│   ├── pages/              # Páginas/vistas
│   │   ├── ConsultaActivosFirebirdPage.tsx
│   │   └── ConsultaActivosFirebirdPage.css
│   ├── routes/             # Configuración de rutas
│   │   └── appRoutes.tsx
│   ├── services/           # Servicios API
│   │   └── activosFirebirdService.ts
│   ├── App.tsx             # Componente principal
│   └── main.tsx            # Entry point
├── public/                 # Archivos estáticos
├── .env                    # Variables de entorno
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md              # Esta documentación
```

---

## 🔥 Módulo: Consulta de Activos Firebird

### Descripción

Permite consultar los activos físicos asignados a un funcionario desde la base de datos legacy Firebird.

### Archivos del Módulo

```
src/
├── services/
│   └── activosFirebirdService.ts    # Servicio API
├── hooks/
│   └── useActivosFirebird.ts        # Hook personalizado
└── pages/
    ├── ConsultaActivosFirebirdPage.tsx    # Componente página
    └── ConsultaActivosFirebirdPage.css    # Estilos
```

### Servicio API

**Archivo:** `src/services/activosFirebirdService.ts`

```typescript
export interface ActivoFirebird {
  cedula: string
  nombre_responsable: string
  placa: string
  descripcion: string
  serial: string | null
  grupo_trabajo: string | null
  grupo_bien: string | null
}

export async function consultarActivosFirebird(cedula: string): Promise<ActivoFirebird[]> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/almacen/consulta-activos/?cedula=${cedula}`
  )
  const data = await response.json()
  return data.data || []
}
```

### Hook Personalizado

**Archivo:** `src/hooks/useActivosFirebird.ts`

```typescript
export function useActivosFirebird(cedula: string | null) {
  const [activos, setActivos] = useState<ActivoFirebird[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lógica de consulta...

  return { activos, loading, error, refetch }
}
```

**Uso:**
```typescript
function MiComponente() {
  const { activos, loading, error } = useActivosFirebird('43875542')
  
  if (loading) return <p>Cargando...</p>
  if (error) return <p>Error: {error}</p>
  
  return (
    <ul>
      {activos.map(activo => (
        <li key={activo.placa}>{activo.descripcion}</li>
      ))}
    </ul>
  )
}
```

### Componente Página

**Archivo:** `src/pages/ConsultaActivosFirebirdPage.tsx`

Componente completo con:
- ✅ Formulario de búsqueda por cédula
- ✅ Tabla de resultados
- ✅ Información del funcionario
- ✅ Estados de carga y error
- ✅ Mensaje cuando no hay resultados
- ✅ Botón de limpiar búsqueda
- ✅ Diseño responsive

**Ruta:** `/sg/gag/consulta-activos-firebird`

### Funcionalidades

- **Búsqueda por cédula**: Ingresa la cédula y consulta los activos
- **Tabla de resultados**: Muestra placa, descripción, serial, grupo de trabajo y grupo del bien
- **Contador**: Muestra el total de activos encontrados
- **Loading spinner**: Indicador visual durante la carga
- **Manejo de errores**: Mensajes claros de error
- **Responsive**: Se adapta a móviles y tablets

### Casos de Uso

```typescript
// Caso 1: Cédula con datos
consultarActivosFirebird('43875542')
// Resultado: 337 activos de MARIN CARDONA NATALIA

// Caso 2: Cédula sin datos
consultarActivosFirebird('00000000')
// Resultado: Array vacío

// Caso 3: Error de red
// Resultado: Mensaje de error
```

---

## 💻 Desarrollo

### Levantar servidor de desarrollo

```bash
npm run dev
```

Abre: `http://localhost:5173/sg/gag/consulta-activos-firebird`

### Probar con backend local

1. Asegúrate de que el backend esté corriendo:
   ```bash
   cd ../bk-sgai
   python manage.py runserver
   ```

2. Verifica que `.env` tenga:
   ```env
   VITE_API_URL=http://localhost:8000
   ```

3. Prueba con cédula: **43875542**

### Hot Module Replacement (HMR)

Vite proporciona HMR automático. Los cambios se reflejan instantáneamente sin recargar la página.

### Linting

```bash
npm run lint
```

---

## 📦 Build y Despliegue

### Build para producción

```bash
npm run build
```

Genera la carpeta `dist/` con los archivos optimizados.

### Preview del build

```bash
npm run preview
```

### Despliegue

1. **Actualizar `.env` de producción:**
   ```env
   VITE_API_URL=https://api.unp.gov.co
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Desplegar carpeta `dist/`** en el servidor web

4. **Configurar servidor web** para servir `index.html` en todas las rutas (SPA)

**Ejemplo Nginx:**
```nginx
location /sg/gag {
  try_files $uri $uri/ /sg/gag/index.html;
}
```

---

## 🔧 Troubleshooting

### Error: "Failed to fetch"

**Causa:** Backend no está corriendo o URL incorrecta

**Solución:**
1. Verificar que backend esté en `http://localhost:8000`
2. Verificar `VITE_API_URL` en `.env`
3. Verificar CORS en backend

### Error: CORS

**Causa:** Backend no permite peticiones desde el frontend

**Solución:**
- Backend ya tiene `CORS_ALLOW_ALL_ORIGINS = True` en desarrollo
- En producción, configurar dominios específicos

### Página en blanco

**Causa:** Ruta incorrecta o basename mal configurado

**Solución:**
- Verificar que la URL incluya `/sg/gag/`
- Ejemplo: `http://localhost:5173/sg/gag/consulta-activos-firebird`

### Estilos no se aplican

**Causa:** CSS no importado correctamente

**Solución:**
- Verificar import en el componente:
  ```typescript
  import './ConsultaActivosFirebirdPage.css'
  ```

### Build falla

**Causa:** Errores de TypeScript o dependencias faltantes

**Solución:**
```bash
# Limpiar node_modules
rm -rf node_modules package-lock.json
npm install

# Verificar errores de TypeScript
npm run build
```

---

## 🛠️ Tecnologías

- **React 19**: Biblioteca UI
- **TypeScript 6**: Tipado estático
- **Vite 8**: Build tool y dev server
- **React Router 7**: Enrutamiento
- **Fetch API**: Peticiones HTTP (nativo, no requiere axios)

---

## 📝 Notas Importantes

- El proyecto usa **fetch nativo** (no requiere instalar axios)
- Los estilos son **independientes** por componente
- El hook `useActivosFirebird` es **reutilizable**
- La ruta está protegida por `AppLayout` (si tiene autenticación)
- El basename `/sg/gag` está configurado en `App.tsx`

---

## 🧪 Pruebas

### Prueba manual

1. Levantar backend y frontend
2. Abrir: `http://localhost:5173/sg/gag/consulta-activos-firebird`
3. Ingresar cédula: `43875542`
4. Verificar que muestra 337 activos

### Casos de prueba

| Caso | Cédula | Resultado Esperado |
|------|--------|-------------------|
| Con datos | 43875542 | 337 activos de MARIN CARDONA NATALIA |
| Sin datos | 00000000 | "No se encontraron activos" |
| Vacío | (vacío) | Error de validación |
| Limpiar | Click "Limpiar" | Formulario limpio |

---

## 📞 Contacto

Para dudas o problemas, contactar al equipo de desarrollo del ecosistema UNP.

---

## ⚠️ Configuración de Vite

### Plugins

- `@vitejs/plugin-react`: Usa Oxc para transformación rápida
- Alternativa: `@vitejs/plugin-react-swc` (usa SWC)

### ESLint

Configuración básica incluida. Para reglas más estrictas, ver documentación de Vite.

---

**Última actualización:** 14/04/2026
