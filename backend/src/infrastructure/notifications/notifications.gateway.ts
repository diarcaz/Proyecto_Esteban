import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { allowedOrigins } from '../security/deployment-config';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy, JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { resolvePropertyReadScope } from '@domain/security/property-read-scope';
import { Permission } from '@domain/permissions/permission.enum';

export interface AlertNotificationPayload {
  id: string;
  type: 'LATE_ATTENDANCE' | 'OVERTIME_ALERT' | 'ANTI_TAMPER_LOCKOUT' | 'OFFLINE_SYNC';
  title: string;
  message: string;
  locationId: string;
  locationCode: string;
  employeeName?: string;
  timestamp: string;
}

@Injectable()
@WebSocketGateway({ cors: { origin: (origin, callback) => callback(null, !origin || allowedOrigins().includes(origin)), credentials: true }, namespace: '/events' })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly jwt = new JwtService();
  private readonly sessions = new Map<Socket, { token: string; properties: string[]; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly config: ConfigService, private readonly strategy: JwtStrategy, private readonly prisma: PrismaService) {}

  private async authenticate(token: unknown) {
    if (typeof token !== 'string' || !token) throw new Error('Authentication required');
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('Authentication unavailable');
    const payload = await this.jwt.verifyAsync<JwtPayload & { exp: number }>(token, { secret, algorithms: ['HS256'] });
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new Error('Invalid token');
    const user = await this.strategy.validate(payload);
    if (!['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(user.role)) throw new Error('Admin access required');
    return { user, expires: payload.exp * 1000 };
  }

  afterInit(server: Server) {
    // Middleware completes authentication before connection/subscription handlers run.
    server.use(async (client, next) => {
      try {
        const origin = client.handshake.headers.origin;
        if (origin && !allowedOrigins().includes(origin)) throw new Error('Origin denied');
        const token = client.handshake.auth?.token;
        const { expires } = await this.authenticate(token);
        const timer = setTimeout(() => client.disconnect(true), Math.min(expires - Date.now(), 2147483647));
        timer.unref();
        this.sessions.set(client, { token, properties: [], timer });
        next();
      } catch { next(new Error('Alert authentication required.')); }
    });
  }

  handleConnection(client: Socket) { this.logger.log(`Authenticated alert client connected: ${client.id}`); }
  handleDisconnect(client: Socket) {
    const session = this.sessions.get(client);
    if (session) clearTimeout(session.timer);
    this.sessions.delete(client);
  }

  @SubscribeMessage('subscribeSupervisorAlerts')
  async handleSubscribeAlerts(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    const session = client && this.sessions.get(client);
    if (!session) return { status: 'DENIED' };
    // Replace, never accumulate, subscriptions; an invalid replacement leaves no data access.
    session.properties = [];
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid payload');
      const payload = data as Record<string, unknown>;
      if (Object.keys(payload).some(k => k !== 'propertyId')) throw new Error('Invalid context');
      if (payload.propertyId !== undefined && (typeof payload.propertyId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.propertyId))) throw new Error('Invalid property');
      const { user } = await this.authenticate(session.token);
      const properties = await resolvePropertyReadScope(this.prisma, user, payload.propertyId ? { property_id: payload.propertyId } : {}, {}, Permission.TIME_VIEW);
      if (!client.connected || this.sessions.get(client) !== session) return { status: 'DENIED' };
      session.properties = properties.map(p => p.id);
      client.emit('subscribed', { status: 'OK', propertyIds: session.properties });
      return { status: 'OK' };
    } catch { return { status: 'DENIED' }; }
  }

  async emitRealtimeAlert(alert: AlertNotificationPayload) {
    if (!alert?.locationId) return; // Never broadcast on an ambiguous code or globally.
    for (const [client, session] of this.sessions) {
      if (!session.properties.includes(alert.locationId)) continue;
      try {
        const { user } = await this.authenticate(session.token);
        await resolvePropertyReadScope(this.prisma, user, { property_id: alert.locationId }, {}, Permission.TIME_VIEW);
        if (client.connected && this.sessions.get(client) === session && session.properties.includes(alert.locationId)) client.emit('attendanceAlert', alert);
      } catch { session.properties = []; }
    }
  }
}
