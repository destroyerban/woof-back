import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { DesglosarService } from './desglosar.service';

@Controller('/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly desglosarService: DesglosarService,
  ) {}

  /** Indica si la IA está activada en el servidor (para mostrar u ocultar botones). */
  @Get('/estado')
  estado() {
    return { activa: this.ai.enabled };
  }

  /**
   * Divide una meta en subtareas sugeridas. No crea nada: la app muestra las
   * sugerencias y el usuario elige cuáles agregar.
   * Body: { meta: string, cantidad?: number (3-8, por defecto 5) }
   */
  @Post('/desglosar')
  async desglosar(@Body() body: { meta?: unknown; cantidad?: unknown }) {
    const subtareas = await this.desglosarService.desglosar(body?.meta, body?.cantidad);
    return { subtareas };
  }
}
