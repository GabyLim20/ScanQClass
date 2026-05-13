# 📷 ScanQClass 👾  

ScanQClass es un sistema web para el control de asistencia mediante códigos QR en entornos educativos.

La plataforma permite a administradores, docentes y estudiantes gestionar clases, registrar asistencia de forma rápida y segura, y consultar información en tiempo real como historial, justificaciones y estadísticas.

Está diseñado para simplificar el proceso de asistencia, evitar errores manuales y facilitar el seguimiento del rendimiento académico a través de métricas como asistencia y niveles de riesgo.

---

## 🎯🚀 Skills
- JavaScript
- NodeJS
- Express
- Sequelize
- MySQL
- JWT (Autenticación)
- Middleware
- Programación Asíncrona
- MVC
- Git & GitHub

---

## 📁 Estructura del Proyecto ✨🤓

#### 📁 ScanQClass
| Estructura | Descripción |
|----------|------------|
| 📁 assets | Contiene frontend, controladores, modelos y lógica principal |
| └─ 📁 controllers | Lógica del sistema (admin, teacher, student) |
| └─ 📁 models | Modelos Sequelize (User, Course, Attendance, etc.) |
| └─ 📁 routes | Definición de rutas del backend |
| └─ 📁 middleware | Autenticación y validaciones |
| └─ 📁 services | Lógica adicional (ej: importación Excel) |
| └─ 📁 utils | Funciones auxiliares |
| └─ 📁 views | HTML del sistema |
| └─ 📁 css | Estilos del sistema |
| 📄 app.js | Archivo principal del servidor |
| 📄 package.json | Configuración del proyecto |
| 📄 .env | Variables de entorno |
| 📄 README.md | Documentación del proyecto |

---


## ▶️ Cómo ejecutar el proyecto

### 1. Clonar el repositorio
```bash
git clone https://github.com/GabyLim20/ScanQClass.git
cd scanqclass
```

### 2. Instalar dependencias

```bash
npm install
```
### 3. Configurar variables de entorno

Crear un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=ScanQClass
JWT_SECRET=tu_clave_secreta
PORT=3000
```

### 4. Ejecutar el servidor

```bash
node app.js
```

### 5. Abrir el sistema en el navegador

```text
http://localhost:3000
```
---

## ⚠️ Requisitos

- Node.js (v18 o superior recomendado)
- MySQL activo
- Base de datos creada (ScanQClass)
- Configuración correcta del archivo `.env`


---


## 📱 Funcionalidades principales

### 👨‍💼 Admin
- Gestión de alumnos, maestros y clases.
- Importación de alumnos vía Excel.
- Visualización de estadísticas de asistencia y riesgo.
- Control de secciones y cursos.

---

### 👩‍🏫 Docente
- Escaneo QR de alumnos.
- Apertura y cierre de sesiones de asistencia.
- Visualización de historial.
- Gestión de justificaciones.

---

### 👨‍🎓 Estudiante
- Generación de QR personal.
- Envío de justificaciones.
- Consulta de historial.

---

### 📊 Módulo de asistencia
- Registro por QR en tiempo real.
- Validación de horario activo.
- Prevención de duplicados.
- Manejo de sesiones (OPEN / CLOSED).

---

### 📈 Estadísticas
- Riesgo alto / medio / bajo.
- Asistencia promedio.
- Distribución por sección.
- Análisis mensual.

---

### 🔐 Seguridad
- Autenticación con JWT.
- Protección de rutas por rol.
- Validación de acceso a recursos.
- Registro público limitado (solo alumnos).

## 🌐 Endpoints Disponibles

### 🔑 Auth
- POST /login – Iniciar sesión y obtener token JWT.
- POST /auth/change-password – Cambiar contraseña.

---

### 👨‍💼 Admin
- GET /admin/dashboard – Obtener datos del dashboard.
- GET /admin/getTeacher – Obtener lista de maestros.
- GET /admin/subjects – Obtener catálogo de materias.
- POST /admin/subjects – Crear nueva materia.
- GET /admin/statistics/attendance-risk – Obtener estadísticas de asistencia.
- POST /admin/createClass – Crear nueva clase.

---

### 👩‍🏫 Docente
- GET /teacher/classes – Obtener clases del docente.
- GET /teacher/attendance-sessions/today – Obtener sesión activa del día.
- POST /teacher/attendance/scan – Registrar asistencia con QR.
- POST /teacher/attendance/close – Cerrar sesión de asistencia.
- GET /teacher/classes/:id/history – Obtener historial de asistencia.

---

### 👨‍🎓 Estudiante
- GET /student/qr – Obtener QR del alumno.
- POST /student/justification – Enviar justificación.
- GET /student/history – Obtener historial de asistencia.