import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

export interface AlertNotificationPayload {
  id: string;
  type: 'LATE_ATTENDANCE' | 'OVERTIME_ALERT' | 'ANTI_TAMPER_LOCKOUT' | 'OFFLINE_SYNC';
  title: string;
  message: string;
  locationCode: string;
  employeeName?: string;
  timestamp: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/events',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Supervisor Web Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Supervisor Web Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeSupervisorAlerts')
  handleSubscribeAlerts(client: Socket, @MessageBody() data: { locationCode?: string }) {
    this.logger.log(`Client ${client.id} subscribed to alerts for branch: ${data.locationCode || 'ALL'}`);
    client.emit('subscribed', { status: 'OK', locationCode: data.locationCode || 'ALL' });
  }

  /**
   * Broadcast real-time alert (e.g. Tardiness, Overtime spike, Kiosk Lockout) to connected supervisor dashboards.
   */
  emitRealtimeAlert(alert: AlertNotificationPayload) {
    this.logger.log(`Broadcasting alert [${alert.type}]: ${alert.title}`);
    if (this.server) {
      this.server.emit('attendanceAlert', alert);
    }
  }
}
