import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { JwtTokenService } from '../auth/jwt.service';
import { UserProyect } from '../user_Proyetc/userProyect.entity';

/**
 * Tiempo real de WOOF (Socket.IO).
 *
 * Al conectarse, el cliente envía su token JWT (handshake.auth.token).
 * El servidor lo valida y mete el socket en:
 *   - "user:<id>"       → avisos solo para ese usuario
 *   - "proyect:<id>"    → un room por cada proyecto al que pertenece
 *
 * Eventos que recibe el cliente:
 *   - "tareas:cambio"     { proyectId? , personal? }  → volver a cargar tareas
 *   - "proyectos:cambio"  { proyectId }               → volver a cargar proyectos/integrantes
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    @InjectRepository(UserProyect)
    private readonly userProyectRepository: Repository<UserProyect>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        client.handshake.auth?.token ?? client.handshake.headers?.authorization ?? '';
      const token = String(raw).replace(/^Bearer\s+/i, '');
      const payload = this.jwtTokenService.verifyToken(token);
      const userId = Number(payload.id);

      client.data.userId = userId;
      await client.join(this.userRoom(userId));

      const relations = await this.userProyectRepository.find({
        where: { user: { id: userId } },
        relations: ['proyect'],
      });
      await client.join(relations.map((r) => this.proyectRoom(r.proyect.id)));
      client.emit('conectado', { userId });
    } catch {
      // Token ausente o inválido: no se permite la conexión.
      client.emit('error', { message: 'No autorizado' });
      client.disconnect(true);
    }
  }

  // ---------- Avisos que usan los servicios ----------

  /** Cambió una tarea (crear/editar/mover/borrar) de un proyecto. */
  tareasDeProyecto(proyectId: number) {
    this.server?.to(this.proyectRoom(proyectId)).emit('tareas:cambio', { proyectId });
  }

  /** Cambió una tarea personal: se avisa a los otros dispositivos del mismo usuario. */
  tareasPersonales(userId: number) {
    this.server?.to(this.userRoom(userId)).emit('tareas:cambio', { personal: true });
  }

  /** Se agregó un integrante (o se creó el proyecto): entra al room y se avisa a todos. */
  integranteAgregado(userId: number, proyectId: number) {
    if (!this.server) return;
    this.server.in(this.userRoom(userId)).socketsJoin(this.proyectRoom(proyectId));
    this.server.to(this.proyectRoom(proyectId)).emit('proyectos:cambio', { proyectId });
  }

  /** Se quitó un integrante: se avisa al proyecto y a esa persona, y sale del room. */
  integranteEliminado(userId: number, proyectId: number) {
    if (!this.server) return;
    this.server
      .to([this.proyectRoom(proyectId), this.userRoom(userId)])
      .emit('proyectos:cambio', { proyectId });
    this.server.in(this.userRoom(userId)).socketsLeave(this.proyectRoom(proyectId));
  }

  /** Cambió el proyecto (nombre, categoría, roles de integrantes). */
  proyectoActualizado(proyectId: number) {
    this.server?.to(this.proyectRoom(proyectId)).emit('proyectos:cambio', { proyectId });
  }

  /** Se borró el proyecto: se avisa y se vacía el room. */
  proyectoEliminado(proyectId: number) {
    if (!this.server) return;
    const room = this.proyectRoom(proyectId);
    this.server.to(room).emit('proyectos:cambio', { proyectId });
    this.server.in(room).socketsLeave(room);
  }

  private userRoom(userId: number) {
    return `user:${userId}`;
  }

  private proyectRoom(proyectId: number) {
    return `proyect:${proyectId}`;
  }
}
