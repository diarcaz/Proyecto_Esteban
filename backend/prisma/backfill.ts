import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO BACKFILL CONTROLADO DE DATOS (FASE 1) ---');

  // 1. Obtener o crear empresa predeterminada para vincular datos existentes sin asignación
  let defaultCompany = await prisma.company.findFirst();
  if (!defaultCompany) {
    defaultCompany = await prisma.company.create({
      data: {
        name: 'NexuStaff Enterprise S.A. de C.V.',
        taxId: 'ESE901020-K12',
      },
    });
    console.log(`[Backfill] Empresa predeterminada creada: ${defaultCompany.name} (${defaultCompany.id})`);
  } else {
    console.log(`[Backfill] Empresa existente vinculada: ${defaultCompany.name} (${defaultCompany.id})`);
  }

  // 2. Vincular usuarios sin company_id a la empresa predeterminada
  const unlinkedUsers = await prisma.user.findMany({
    where: { companyId: null },
  });

  if (unlinkedUsers.length > 0) {
    await prisma.user.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    });
    console.log(`[Backfill] ${unlinkedUsers.length} usuarios existentes vinculados a la empresa ${defaultCompany.name}.`);
  } else {
    console.log('[Backfill] Todos los usuarios ya contaban con empresa asignada.');
  }

  // 3. Crear configuraciones operativas predeterminadas para sucursales/locations que no tengan una
  const locations = await prisma.location.findMany({
    include: { operationalConfig: true },
  });

  let configsCreated = 0;
  for (const loc of locations) {
    if (!loc.operationalConfig) {
      await prisma.propertyOperationalConfig.create({
        data: {
          locationId: loc.id,
          weekStartDay: 'MONDAY',
          payrollFrequency: 'WEEKLY',
          invoiceFrequency: 'WEEKLY',
          maxShiftDurationMinutes: 960, // 16 horas (960 min)
        },
      });
      configsCreated++;
    }
  }

  console.log(`[Backfill] ${configsCreated} configuraciones operativas de propiedad creadas.`);

  // 4. Identificar usuarios sin asignaciones explícitas de posición (requieren configuración manual)
  const usersRequiringConfig = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      employeeAssignments: { none: {} },
    },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, email: true },
  });

  console.log('--- RESULTADO DEL BACKFILL DE DATOS ---');
  console.log(`- Usuarios vinculados a Company: ${unlinkedUsers.length}`);
  console.log(`- Configuraciones operativas creadas: ${configsCreated}`);
  console.log(`- Usuarios activos que requieren configuración manual de Posición/Tarifa: ${usersRequiringConfig.length}`);
  if (usersRequiringConfig.length > 0) {
    usersRequiringConfig.forEach((u) => {
      console.log(`   • [${u.employeeNumber}] ${u.firstName} ${u.lastName} (${u.email})`);
    });
  }

  console.log('--- BACKFILL CONTROLADO COMPLETADO EXITOSAMENTE ---');
}

main()
  .catch((e) => {
    console.error('[Backfill Error]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
