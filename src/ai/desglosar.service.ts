import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';

export interface Subtarea {
  nombre: string;
  descripcion: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    subtareas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
        },
        required: ['nombre', 'descripcion'],
      },
    },
  },
  required: ['subtareas'],
};

const SYSTEM = `Eres el asistente de WOOF, una app Kanban para estudiantes y equipos.
Tu trabajo es dividir una meta en subtareas concretas que se puedan poner en un tablero.
Reglas:
- Escribe en español.
- Cada "nombre" empieza con un verbo y tiene como máximo 6 palabras.
- Cada "descripcion" es una sola frase corta que explica qué hacer.
- Las subtareas van en el orden en que conviene hacerlas.
- No repitas la meta como subtarea y no inventes datos que no estén en la meta.`;

@Injectable()
export class DesglosarService {
  constructor(private readonly ai: AiService) {}

  async desglosar(metaRaw: unknown, cantidadRaw?: unknown): Promise<Subtarea[]> {
    const meta = typeof metaRaw === 'string' ? metaRaw.trim() : '';
    if (meta.length < 3 || meta.length > 300) {
      throw new BadRequestException('Escribe una meta de entre 3 y 300 caracteres.');
    }
    const n = Number(cantidadRaw ?? 5);
    const cantidad = Number.isFinite(n) ? Math.min(8, Math.max(3, Math.round(n))) : 5;

    const { subtareas } = await this.ai.chatJson<{ subtareas?: unknown }>(
      SYSTEM,
      `Meta: "${meta}"\nDivide esta meta en exactamente ${cantidad} subtareas.`,
      SCHEMA,
      { timeoutMs: 120_000, temperature: 0.3 },
    );

    const limpias = limpiarSubtareas(subtareas, cantidad);
    if (limpias.length === 0) {
      throw new ServiceUnavailableException('La IA no generó subtareas. Intenta escribir la meta de otra forma.');
    }
    return limpias;
  }
}

/** Normaliza lo que devuelve el modelo: recorta, quita vacías y repetidas, y limita la cantidad. */
export function limpiarSubtareas(raw: unknown, max: number): Subtarea[] {
  if (!Array.isArray(raw)) return [];
  const vistas = new Set<string>();
  const out: Subtarea[] = [];
  for (const item of raw) {
    const nombre = String((item as any)?.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const descripcion = String((item as any)?.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 250);
    const clave = nombre.toLowerCase();
    if (!nombre || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push({ nombre, descripcion: descripcion || nombre });
    if (out.length >= max) break;
  }
  return out;
}
