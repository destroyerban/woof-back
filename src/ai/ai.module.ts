import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DesglosarService } from './desglosar.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, DesglosarService],
  exports: [AiService],
})
export class AiModule {}
