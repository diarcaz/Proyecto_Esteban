# 🐳 Sistema Enterprise de Gestión de Asistencia y Personal (NexuStaff Monorepo)

Monorepo organizado con separación estricta entre el **Backend** (NestJS), **Frontend** (Next.js 14 App Router) y **Base de Datos** (PostgreSQL 16).

---

## 📁 Estructura del Proyecto

```
Proyecto_Esteban/
├── docker-compose.yml                   # Orquestador Docker Compose (PostgreSQL + Backend + Frontend)
├── backend/                             # Aplicación Backend en NestJS (API REST, WebSockets, Prisma)
│   ├── Dockerfile                       # Contenedor Docker para NestJS
│   ├── prisma/                          # Esquema y migraciones de PostgreSQL
│   │   └── schema.prisma
│   ├── src/                             # Código fuente NestJS
│   │   ├── adapters/                    # Controladores REST, Guards, Interceptores, DTOs
│   │   ├── application/                 # Servicios de aplicación y casos de uso
│   │   ├── domain/                      # Entidades de dominio e interfaces de repositorios
│   │   ├── infrastructure/              # Base de datos (Prisma), Redis, Auth (JWT) y WebSockets
│   │   ├── app.module.ts                # Módulo principal NestJS con Rate Limiting (@nestjs/throttler)
│   │   └── main.ts                      # Bootstrap de NestJS
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                            # Aplicación Frontend en Next.js 14
    ├── Dockerfile                       # Contenedor Docker para Next.js
    ├── src/
    │   ├── app/                         # App Router (/admin, /kiosk, /admin/reports, etc.)
    │   ├── components/                  # Componentes UI (PinPad, Calendario Drag&Drop, Notificaciones)
    │   ├── lib/                         # Utilidades (PDF Generator, Payroll LFT Rules, Offline IndexedDB)
    │   └── store/                       # Tiendas Zustand (Location y Punch Stores)
    ├── next.config.js
    ├── package.json
    └── tsconfig.json
```

---

## 🐳 Despliegue con Docker y Docker Compose

### 1. Iniciar el Sistema Completo en Contenedores

Ejecuta el siguiente comando en la raíz del proyecto para compilar e iniciar PostgreSQL, Backend NestJS y Frontend Next.js:

```bash
docker compose up --build
```

### 2. Detener los Contenedores

Para detener todos los servicios y liberar los contenedores:

```bash
docker compose down
```

### 3. Ver Logs en Tiempo Real

```bash
docker compose logs -f
```

---

## 🌐 Puertos y Accesos del Sistema

Una vez levantado con Docker Compose, puedes acceder a las distintas partes de la plataforma:

- 📱 **Quiosco Tablet (Touch Kiosk)**: [http://localhost:3000/kiosk](http://localhost:3000/kiosk)
- 📊 **Portal Administrativo**: [http://localhost:3000/admin](http://localhost:3000/admin)
- 📑 **Reportes y Nómina (PDF LFT)**: [http://localhost:3000/admin/reports](http://localhost:3000/admin/reports)
- 🗓️ **Planificador de Turnos (Drag & Drop)**: [http://localhost:3000/admin/schedules](http://localhost:3000/admin/schedules)
- 🛡️ **Ajustes y Logs de Auditoría**: [http://localhost:3000/admin/settings](http://localhost:3000/admin/settings)
- ⚡ **Documentación API Swagger (Backend)**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- 🐘 **Base de Datos PostgreSQL**: `localhost:5432` (`nexustaff_db` | User: `postgres` | Pass: `postgres`)

---

## 🛠️ Ejecución Local en Desarrollo (Sin Docker)

Si prefieres ejecutar los servicios en modo desarrollo local:

- **Backend**:
  ```bash
  cd backend
  npm run start:dev
  ```

- **Frontend**:
  ```bash
  cd frontend
  npm run dev
  ```
