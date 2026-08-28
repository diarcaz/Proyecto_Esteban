import { UserRole, UserStatus } from '@prisma/client';

export { UserRole, UserStatus };

export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly companyId: string,
    public readonly employeeNumber: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly role: UserRole,
    public readonly status: UserStatus,
    public readonly jobPositionCode?: string,
    public readonly hourlyRate?: number,
    public readonly departmentId?: string,
    public readonly pinCodeHash?: string,
    public readonly assignedLocationIds: string[] = [],
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {}

  public isSuperAdmin(): boolean {
    return this.role === UserRole.SUPER_ADMIN;
  }

  public hasAccessToLocation(locationId: string): boolean {
    if (this.isSuperAdmin()) return true;
    return this.assignedLocationIds.includes(locationId);
  }
}
