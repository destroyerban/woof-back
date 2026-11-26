import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserProyect } from '../user_Proyetc/userProyect.entity';
import { RealtimeGateway } from './realtime.gateway';

// Global: cualquier servicio puede inyectar RealtimeGateway sin importar el módulo.
@Global()
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([UserProyect])],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
