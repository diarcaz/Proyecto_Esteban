import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { encryptPin } from '../src/infrastructure/security/pin-encryption.util';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO LIMPIEZA Y PURGA TOTAL DE LA BASE DE DATOS ---');

  // Purge existing data
  try {
    await prisma.attendanceLog.deleteMany({});
    await prisma.shiftSchedule.deleteMany({});
    await prisma.userLocationAssignment.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.company.deleteMany({});
  } catch (e) {
    console.log('Aviso: Purgando datos iniciales.');
  }

  console.log('--- INSERTANDO EMPRESA Y SUCURSALES REALISTAS ---');

  // 1. Company
  const company = await prisma.company.create({
    data: {
      name: 'NexuStaff Enterprise S.A. de C.V.',
      taxId: 'ESE901020-K12',
    },
  });

  // 2. Locations (Mérida, Cancún, Monterrey)
  const locMerida = await prisma.location.create({
    data: {
      companyId: company.id,
      name: 'Sucursal Centro - MÉRIDA',
      address: 'Calle 60 #450 x 53, Centro Histórico',
      timezone: 'America/Merida',
      locationCode: 'MID-1001',
    },
  });

  const locCancun = await prisma.location.create({
    data: {
      companyId: company.id,
      name: 'Plaza Marina - CANCÚN',
      address: 'Blvd. Kukulcan Km 12.5, Zona Hotelera',
      timezone: 'America/Cancun',
      locationCode: 'CUN-1002',
    },
  });

  const locMonterrey = await prisma.location.create({
    data: {
      companyId: company.id,
      name: 'Corporativo Norte - MONTERREY',
      address: 'Av. Constitución 2000, Obiepado',
      timezone: 'America/Monterrey',
      locationCode: 'MTY-1003',
    },
  });

  console.log('--- INSERTANDO EMPLEADOS Y PINS DE 6 DÍGITOS ---');

  const defaultPasswordHash = await bcrypt.hash('admin123', 10);

  // 2.5 Admin user for system management
  const adminUser = await prisma.user.create({
    data: {
      employeeNumber: 'ADM-0001',
      firstName: 'Arthur',
      lastName: 'Pendelton',
      email: 'admin@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'SUPER_ADMIN',
      jobPositionCode: 'SUPER_ADMIN',
      hourlyRate: 50.0,
      pinCodeHash: await bcrypt.hash('999999', 10),
      pinCodeEncrypted: encryptPin('999999'),
      preferredLanguage: 'es',
      status: 'ACTIVE',
    },
  });

  // Assign admin to all locations
  await prisma.userLocationAssignment.createMany({
    data: [
      { userId: adminUser.id, locationId: locMerida.id },
      { userId: adminUser.id, locationId: locCancun.id },
      { userId: adminUser.id, locationId: locMonterrey.id },
    ],
  });

  // 3. Employees with 6-Digit PINs & i18n Languages
  const employeesData = [
    {
      employeeNumber: 'EMP-1001',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      email: 'carlos.mendoza@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'LOCATION_ADMIN' as const,
      jobPositionCode: 'SUPERVISOR',
      hourlyRate: 18.5,
      rawPinCode: '100100',
      preferredLanguage: 'es',
      status: 'ACTIVE' as const,
      locationId: locMerida.id,
    },
    {
      employeeNumber: 'EMP-1002',
      firstName: 'Sofia',
      lastName: 'Ramírez',
      email: 'sofia.ramirez@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'RECEPT',
      hourlyRate: 14.0,
      rawPinCode: '100200',
      preferredLanguage: 'es',
      status: 'ACTIVE' as const,
      locationId: locMerida.id,
    },
    {
      employeeNumber: 'EMP-1003',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'IT_SPEC',
      hourlyRate: 25.0,
      rawPinCode: '100300',
      preferredLanguage: 'en',
      status: 'ACTIVE' as const,
      locationId: locCancun.id,
    },
    {
      employeeNumber: 'EMP-1004',
      firstName: 'Ana',
      lastName: 'Torres',
      email: 'ana.torres@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'OP_MNT',
      hourlyRate: 15.5,
      rawPinCode: '100400',
      preferredLanguage: 'es',
      status: 'ACTIVE' as const,
      locationId: locCancun.id,
    },
    {
      employeeNumber: 'EMP-1005',
      firstName: 'David',
      lastName: 'Miller',
      email: 'david.miller@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'LOCATION_ADMIN' as const,
      jobPositionCode: 'SUPERVISOR',
      hourlyRate: 20.0,
      rawPinCode: '100500',
      preferredLanguage: 'en',
      status: 'ACTIVE' as const,
      locationId: locMonterrey.id,
    },
    {
      employeeNumber: 'EMP-1006',
      firstName: 'Maria Elena',
      lastName: 'Lopez',
      email: 'maria.lopez@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'CAJERO',
      hourlyRate: 13.5,
      rawPinCode: '100600',
      preferredLanguage: 'es',
      status: 'ACTIVE' as const,
      locationId: locMonterrey.id,
    },
    {
      employeeNumber: 'EMP-1007',
      firstName: 'Alejandro',
      lastName: 'Silva',
      email: 'alejandro.silva@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'LOGISTICA',
      hourlyRate: 16.0,
      rawPinCode: '100700',
      preferredLanguage: 'es',
      status: 'ACTIVE' as const,
      locationId: locMerida.id,
    },
    {
      employeeNumber: 'EMP-1008',
      firstName: 'Emily',
      lastName: 'Davis',
      email: 'emily.davis@nexustaff.com',
      passwordHash: defaultPasswordHash,
      role: 'WORKER' as const,
      jobPositionCode: 'EVENTOS',
      hourlyRate: 17.0,
      rawPinCode: '100800',
      preferredLanguage: 'en',
      status: 'ACTIVE' as const,
      locationId: locCancun.id,
    },
  ];

  const createdUsers: any[] = [];

  for (const empData of employeesData) {
    const locId = empData.locationId;
    const { locationId, rawPinCode, ...userData } = empData;
    const pinCodeHash = await bcrypt.hash(rawPinCode, 10);
    const pinCodeEncrypted = encryptPin(rawPinCode);

    const user = await prisma.user.create({
      data: {
        ...userData,
        pinCodeHash,
        pinCodeEncrypted,
      },
    });

    await prisma.userLocationAssignment.create({
      data: {
        userId: user.id,
        locationId: locId,
      },
    });

    createdUsers.push({ ...user, locationId: locId });
  }

  console.log('--- INSERTANDO FICHAJES DE ASISTENCIA Y DEMOSTRACIÓN ---');

  // 4. Attendance Logs
  const today = new Date();

  for (const user of createdUsers) {
    await prisma.attendanceLog.create({
      data: {
        userId: user.id,
        locationId: user.locationId,
        timestamp: today,
        punchType: 'CLOCK_IN',
        punchMethod: 'KIOSK_PIN',
        actualTimestamp: new Date(),
        status: 'ON_TIME',
        takenLunch: true,
        calculatedHours: 8.0,
        isOvertime: false,
      },
    });
  }

  console.log('--- SEED COMPLETADO EXITOSAMENTE CON DATOS REALISTAS ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
