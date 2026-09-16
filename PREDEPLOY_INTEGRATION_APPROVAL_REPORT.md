# NEXUSTAFF PRE-DEPLOY INTEGRATION & APPROVAL REPORT

Estado al 2026-09-16. Corte solicitado por el usuario para conservar tokens. Trabajo detenido; no se desplegó ni se accedió a Render.

## 1. Entorno de pruebas

Se creó únicamente `nexustaff_test` en PostgreSQL local del contenedor existente. Redis de integración utiliza DB 15 en localhost:6379. La aplicación integrada se ejecutó en frontend 3100 / backend 3101; no se sustituyeron los servicios existentes en 3000/3001. El helper local valida que DATABASE_URL apunte exclusivamente a localhost/127.0.0.1 y nexustaff_test. Reutiliza TEST PIN_ENCRYPTION_KEY y genera una PIN_LOOKUP_KEY independiente, persistida en un archivo local ignorado por Git.

## 2. Migraciones

Las ocho migraciones se aplicaron correctamente a la base de pruebas recién creada, incluida `20260916000100_indexed_kiosk_pin` y la nueva `20260916000200_timesheet_review_version`. Esta última añade `review_snapshot` JSONB y `version` a Timesheet. No se utilizó db push, reset ni se editó el historial de migraciones existentes.

## 3. Backfill/enrollment

Pruebas reales de inicialización del fingerprint, incorporación del digest y conservación del hash. También se ejecutó el CLI en secuencia dry-run → apply → dry-run sobre dos trabajadores desechables: 2 indexables, 0 resets necesarios, 0 registros cifrados inválidos, 0 conflictos. No se reconstruyeron PINs bcrypt-only ni se cambiaron automáticamente PINs.

## 4. PostgreSQL

26 pruebas nuevas de integración PostgreSQL/Redis aprobadas. Verifican migraciones, enrollment, onboarding duplicado con rollback, sincronización hash/cifrado/digest, colisiones al añadir asignaciones o reactivar cuentas, múltiples propiedades, reutilización en ventanas no superpuestas, usuarios hash-only, clave equivocada, transición concurrente con exactamente un ganador, orden de pasos, correcciones, invalidación de aprobaciones de compañeros del periodo y fechas con DST. También pasaron las 14 pruebas existentes de onboarding con PostgreSQL real.

## 5. Redis

Probados con Redis real: presupuesto por cliente, conservación del presupuesto tras autenticación correcta, bloqueo por propiedad/digest, bloqueo canónico por empleado, continuidad de usuarios no afectados y fallo seguro al desconectar realmente el cliente Redis. Se preservó el diseño indexado; no se relajaron sus límites.

## 6. Workflow Timesheet implementado

Se reutilizan Timesheet, TimesheetPeriod, ApprovalWorkflow, ApprovalStep y TimesheetApprovalHistory.

- Resolver periodos semanales/quincenales por propiedad, con límites en su zona horaria y rechazo de solapamientos.
- Revisar membresía y minutos canónicos de WorkShift, turnos incompletos y correcciones pendientes.
- Enviar periodos de calendario finalizados usando un token de revisión; cambios posteriores a la lectura rechazan el envío.
- DRAFT/REJECTED/CORRECTION_REQUIRED → SUBMITTED; pasos intermedios → IN_REVIEW; último paso → APPROVED.
- REJECT y CORRECTION_REQUIRED requieren notas y devuelven el periodo para revisión.
- Actor, fecha, notas, paso y estados anterior/nuevo quedan registrados.
- Se conserva una copia de la configuración de pasos por envío, evidencia de membresía/digest y totales. Cambiar el workflow no altera un envío existente.
- Versión optimista más bloqueo transaccional PostgreSQL impiden doble aprobación y transiciones obsoletas.
- Cada paso exige el usuario y/o rol configurado, además de TIME_APPROVE y alcance real. SUPER_ADMIN tampoco salta el orden de pasos.
- Cuando todas las hojas están aprobadas, el periodo queda CLOSED.

Endpoints bajo `/api/v1/period-approvals`: listado por propiedad, resolve, review por id, submit, transición de Timesheet y configuración de workflow. Reports contiene la interfaz de revisión, envío, acciones e historial. La interfaz de configuración ofrece un workflow sencillo de un paso; el API acepta hasta diez pasos ordenados.

## 7. Correcciones y reaprobación

Política conservadora: aprobar una corrección invalida los periodos enviados/en revisión/aprobados del trabajador en esa propiedad, incluidos los compañeros que participan en esos periodos. Se registran transiciones a CORRECTION_REQUIRED y se reabren los periodos. Es necesario revisar y reenviar el periodo completo; todos los pasos comienzan de nuevo. Puede reabrir periodos históricos adicionales del mismo trabajador/propiedad: se prioriza no conservar una aprobación potencialmente obsoleta.

La invalidación y la corrección se confirman en la misma transacción. Se añadió resolución del WorkShift canónico para correcciones que llegan enlazadas solo a AttendanceLog; se rechazan relaciones inconsistentes y registros sin WorkShift reconciliado. Se conserva la evidencia de timestamps originales.

## 8. TIME_APPROVE

PermissionsGuard resuelve el registro TimeCorrectionRequest real y su propiedad/compañía antes de evaluar permisos. Rechaza claims de propiedad contradictorios, objetivos inexistentes y WORKER incluso si declara permisos. Los servicios approve/reject pasan propertyId y companyId obtenidos del registro. El nuevo servicio de periodos resuelve el contexto desde Period/Timesheet persistidos. No se autoriza por un companyId enviado por el cliente.

## 9. Aislamiento de roles

Pruebas de contexto real para SUPER_ADMIN, OWNER, ADMIN, MANAGER, LOCATION_ADMIN, SUPERVISOR y WORKER, con rechazo de propiedades/compañías ajenas. Se mantiene la política existente: ADMIN requiere las propiedades concedidas dentro de su compañía; su rol por sí solo no concede todas las propiedades.

Cuatro pruebas HTTP contra Nest en ejecución aprobaron: SUPER_ADMIN agregado/seleccionado, LOCATION_ADMIN y SUPERVISOR limitados a North, y WORKER autenticado rechazado en reportes/aprobaciones. El login genérico puede autenticar WORKER; el portal Admin rechaza ese rol y los endpoints administrativos aplican sus guards.

## 10. Aceptación en navegador realizada

Con datos sintéticos en localhost:3100:

- SUPER_ADMIN: ambas propiedades, agregado y seleccionado, downloads de CSV y aprobación final.
- LOCATION_ADMIN: solo North en selector, personal y asistencia de North; export autorizado.
- SUPERVISOR: solo North; revisión de 480 minutos, envío y aprobación del primer paso. El siguiente paso quedó reservado al administrador configurado.
- WORKER: intento de entrar por Admin rechazado visualmente.
- Clock: pairing North y South, dos identidades de trabajadores, PIN incorrecto rechazado, colisión artificial rechazada sin escoger identidad, CLOCK_IN, LUNCH_START, LUNCH_END, CLOCK_OUT y retorno automático al teclado sin identidad.
- Reports: export semanal, quincenal y personalizado; detalle/resumen; periodo final CLOSED/APPROVED; historial visible con Supervisor y SUPER_ADMIN, pasos y notas.
- Se detectó y corrigió una fecha de periodo que usaba la zona del navegador. La nueva versión mostró correctamente 2026-01-05 en la propiedad New York.

La colisión artificial se retiró. Las pruebas no constituyen aceptación remota.

## 11. Exports

Se conservó el diseño existente sin cálculos financieros. Integración real con 600 turnos y 1,200 eventos: detalle de 601 líneas incluyendo cabecera, independiente de límites de pantalla y del lote de 500. Los estados APPROVED y CORRECTION_REQUIRED se reflejaron desde Timesheet en los CSV. Aislamiento comprobado mediante HTTP. El navegador descargó el resumen del periodo aprobado.

## 12. Archivos de este pase

- `backend/prisma/schema.prisma` y nueva migración `20260916000200_timesheet_review_version/migration.sql`.
- Nuevos `period-approval.service.ts`, `period-review-state.ts`, `period-approval.controller.ts`.
- `time-correction.service.ts`, `time-correction.controller.ts`, `permissions.guard.ts`, `app.module.ts`.
- Frontend: nuevo `period-review.tsx`, integración en `reports-view.tsx`, API client y `period-review.test.cjs`.
- Helpers/tests: `local-test-env.cjs`, `predeploy.integration.test.cjs`, `predeploy-http.test.cjs`, `local-browser-fixture.cjs`, `local-browser-collision.cjs`.
- Fixtures de pruebas existentes actualizados en phase46, phase32-security-audit y work-shift-service.
- `.gitignore` para datos locales desechables y `docker-compose.yml` para exigir PIN_LOOKUP_KEY al iniciar el backend.

Los cambios anteriores del UX Recovery se conservaron. No se creó commit ni se descartaron cambios existentes.

## 13. Validaciones al corte

| Validación | Resultado |
| --- | --- |
| Backend Node suites relevantes | 82/82 |
| Nueva integración PostgreSQL/Redis | 26/26 |
| Integración previa onboarding | 14/14 |
| HTTP contra backend integrado | 4/4 |
| Suite previa authorization/security | Aprobada |
| Frontend | 66/66 |
| Backend build | Aprobado |
| Frontend production build | Aprobado; advertencias no fatales de caché webpack |
| TypeScript noEmit backend/frontend | Aprobado |
| Prisma validate / generate | Aprobado |
| git diff --check final de este pase | Pendiente al detenerse |

Hubo fallos iniciales corregidos en fixtures que no simulaban el nuevo bloqueo transaccional, en una expectativa HTTP de login (200, no 201) y en una ruta de importación. Las ejecuciones finales indicadas arriba pasaron. No hay fallos finales conocidos en esas suites.

## 14. Pendientes exactos

1. Revisión final del diff y `git diff --check`; retirar el cambio generado de `frontend/tsconfig.tsbuildinfo` si procede. No se ejecutaron tras la petición de detenerse.
2. Actualizar el runbook operativo y marcar los reportes anteriores como históricos respecto del workflow ya implementado.
3. Limpiar la fixture de navegador y cerrar los procesos de prueba 3100/3101 cuando se termine de inspeccionar. Actualmente quedan en la base aislada; los archivos `.local-browser-fixture.json` y `.local-integration-secrets.json` están ignorados por Git. No trasladar cuentas, claves ni fixture al despliegue.
4. Revisión final de cambios/migración antes de autorizar deploy. No se verificaron topología de proxy Render, concurrencia real de terminales detrás del proxy, secretos remotos, backups/persistencia ni smoke tests remotos. El presupuesto por IP puede agrupar terminales detrás de NAT/proxy; esta limitación del despliegue sigue pendiente.

## 15. Veredicto al corte

**NOT READY FOR REMOTE BETA DEPLOYMENT**

Las funcionalidades principales y las validaciones locales indicadas están implementadas y aprobadas. La revisión final y los pendientes operativos anteriores no se han cerrado. El trabajo se detuvo por petición del usuario; no se inició Phase 5 ni se desplegó ni modificó Render.
