import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../../ai/ai.service';
import { TaskPersonal } from '../../task/Entities/task-personal.entity';
import { TaskProyect } from '../../task/Entities/task-proyect.entity';
import { TaskHistory } from '../../task_history/task-history.entity';
import { PetService } from './pet.service';

/** Datos reales del usuario con los que el perro arma su mensaje. */
export interface PetHechos {
  estado: string; // MUERTO | HAMBRIENTO | FELIZ
  hechasHoy: number;
  comidasHoy: number;
  comidaDisponible: number;
  pendientes: { backlog: number; todo: number; doing: number };
  primeraTodo?: string;
  atascada?: { nombre: string; dias: number };
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_ATASCADA = 2;
const CACHE_MS = 30 * 60 * 1000;

const SCHEMA = {
  type: 'object',
  properties: { mensaje: { type: 'string' } },
  required: ['mensaje'],
};

const SYSTEM = `Eres el perrito mascota de WOOF, una app de tareas Kanban. Hablas en primera persona,
en español correcto, con cariño y energía de perro.
Te dan HECHOS sobre las tareas de la persona que te cuida y un MENSAJE BASE.
Reescribe el mensaje base con tu personalidad en máximo 2 frases cortas (menos de 180 caracteres).
Reglas:
- Háblale de "tú". No uses palabras con género para referirte a la persona (nada de guapo/guapa,
  amigo/amiga, campeón/campeona, chico/chica): no sabes su género.
- Usa solo los hechos dados: no inventes tareas, números ni nombres. Si el mensaje base nombra una
  tarea o un número, consérvalos tal cual.
- Usa solo estos emojis: 🐾 🦴 🐶 👻 🎾 ❤️
- Revisa la ortografía. Ejemplos bien escritos: "¡Guau! Aliméntame, por favor 🦴",
  "Termina una tarea y dame de comer 🐾", "¡Qué bien lo estás haciendo! 🐶"`;

@Injectable()
export class PetMensajeService {
  private readonly logger = new Logger(PetMensajeService.name);
  private readonly cache = new Map<number, { clave: string; mensaje: string; hasta: number }>();

  constructor(
    private readonly petService: PetService,
    private readonly ai: AiService,
    @InjectRepository(TaskPersonal) private readonly personalRepo: Repository<TaskPersonal>,
    @InjectRepository(TaskProyect) private readonly proyectRepo: Repository<TaskProyect>,
    @InjectRepository(TaskHistory) private readonly historyRepo: Repository<TaskHistory>,
  ) {}

  async getMensaje(userId: number): Promise<{ mensaje: string; fuente: 'ia' | 'plantilla'; estado: string }> {
    const hechos = await this.getHechos(userId);
    const base = mensajeBase(hechos);
    const clave = JSON.stringify(hechos);

    const enCache = this.cache.get(userId);
    if (enCache && enCache.clave === clave && enCache.hasta > Date.now()) {
      return { mensaje: enCache.mensaje, fuente: 'ia', estado: hechos.estado };
    }

    if (this.ai.enabled) {
      try {
        const { mensaje } = await this.ai.chatJson<{ mensaje?: string }>(
          SYSTEM,
          `HECHOS: ${describirHechos(hechos)}\nMENSAJE BASE: ${base}`,
          SCHEMA,
          { timeoutMs: 45_000, temperature: 0.5, maxTokens: 150 },
        );
        const limpio = validarMensajeIA(mensaje, base, hechos);
        if (limpio) {
          this.cache.set(userId, { clave, mensaje: limpio, hasta: Date.now() + CACHE_MS });
          return { mensaje: limpio, fuente: 'ia', estado: hechos.estado };
        }
      } catch (err: any) {
        this.logger.warn(`Mensaje del perro sin IA: ${err?.message ?? err}`);
        return { mensaje: base, fuente: 'plantilla', estado: hechos.estado };
      }
      this.logger.warn('El mensaje de la IA no pasó el filtro; se usa la plantilla.');
    }
    return { mensaje: base, fuente: 'plantilla', estado: hechos.estado };
  }

  async getHechos(userId: number): Promise<PetHechos> {
    const { state, doneCount, fedCount } = await this.petService.getState(userId);

    const personales = await this.personalRepo.find({
      where: { user: { id: userId } },
      relations: ['state'],
    });
    const deProyecto = await this.proyectRepo.find({
      where: { userProyect: { user: { id: userId } } },
      relations: ['state'],
    });

    const tareas = [
      ...personales.map((t) => ({ tipo: 'personal' as const, id: t.id, nombre: t.name, estado: t.state?.name })),
      ...deProyecto.map((t) => ({ tipo: 'proyect' as const, id: t.id, nombre: t.name, estado: t.state?.name })),
    ];
    const pendientes = {
      backlog: tareas.filter((t) => t.estado === 'BACKLOG').length,
      todo: tareas.filter((t) => t.estado === 'TO_DO').length,
      doing: tareas.filter((t) => t.estado === 'DOING').length,
    };

    // Tarea que lleva más días en DOING (según el último cambio de estado registrado).
    let atascada: PetHechos['atascada'];
    for (const t of tareas.filter((x) => x.estado === 'DOING')) {
      const ultimo = await this.historyRepo.findOne({
        where: t.tipo === 'personal' ? { taskPersonal: { id: t.id } } : { taskProyect: { id: t.id } },
        order: { changedAt: 'DESC' },
      });
      if (!ultimo) continue;
      const dias = Math.floor((Date.now() - new Date(ultimo.changedAt).getTime()) / DIA_MS);
      if (dias >= DIAS_ATASCADA && (!atascada || dias > atascada.dias)) {
        atascada = { nombre: t.nombre, dias };
      }
    }

    return {
      estado: state,
      hechasHoy: doneCount,
      comidasHoy: fedCount,
      comidaDisponible: Math.max(0, doneCount - fedCount),
      pendientes,
      primeraTodo: tareas.find((t) => t.estado === 'TO_DO')?.nombre,
      ...(atascada ? { atascada } : {}),
    };
  }
}

function elegir(opciones: string[]): string {
  return opciones[Math.floor(Math.random() * opciones.length)];
}

/** Mensaje del perro sin IA: siempre funciona. Se elige el aviso más importante. */
export function mensajeBase(h: PetHechos): string {
  if (h.comidaDisponible > 0) {
    const s = h.comidaDisponible === 1 ? '' : 's';
    return elegir([
      `¡Guau! Tienes ${h.comidaDisponible} comida${s} para darme 🦴 ¡Ve a alimentarme!`,
      `¡Completaste tareas! Me debes ${h.comidaDisponible} premio${s} 🦴🐾`,
    ]);
  }
  if (h.estado === 'MUERTO') {
    return elegir([
      'Soy un fantasmita 👻 Pasa una tarea a DONE y dame de comer para volver a la vida.',
      'Uuuh... hoy no he comido 👻 Termina una tarea y aliméntame, ¡por favor!',
    ]);
  }
  if (h.atascada) {
    return elegir([
      `"${h.atascada.nombre}" lleva ${h.atascada.dias} días en DOING 🐾 ¿La terminamos hoy?`,
      `Olfateo una tarea atascada: "${h.atascada.nombre}" lleva ${h.atascada.dias} días en DOING 🐶`,
    ]);
  }
  if (h.estado === 'FELIZ') {
    return elegir([
      `¡Estoy feliz! 🐶 Hoy completaste ${h.hechasHoy} tareas. ¡Eres el mejor dueño!`,
      `¡Guau guau! ${h.hechasHoy} tareas hoy y la pancita llena 🦴 ¡Qué buen equipo somos!`,
    ]);
  }
  if (h.pendientes.todo > 0 && h.primeraTodo) {
    return elegir([
      `Tienes ${h.pendientes.todo} tareas en TO DO. ¿Empezamos con "${h.primeraTodo}"? 🐾`,
      `¡Vamos a jugar a terminar tareas! "${h.primeraTodo}" te espera en TO DO 🎾`,
    ]);
  }
  if (h.pendientes.doing + h.pendientes.backlog > 0) {
    return elegir([
      'Tengo hambre 🦴 Termina una tarea y pásala a DONE para darme de comer.',
      '¡Guau! Cada tarea en DONE es una galletita para mí 🐶',
    ]);
  }
  return elegir([
    'No tienes tareas pendientes. ¡Crea una y juguemos! 🎾',
    'Todo tranquilo por aquí 🐶 ¿Agregamos una meta nueva?',
  ]);
}

function describirHechos(h: PetHechos): string {
  const partes = [
    `estado del perro: ${h.estado}`,
    `tareas completadas hoy: ${h.hechasHoy}`,
    `comidas que te dieron hoy: ${h.comidasHoy}`,
    `comidas que todavía te pueden dar: ${h.comidaDisponible}`,
    `tareas en BACKLOG: ${h.pendientes.backlog}, en TO DO: ${h.pendientes.todo}, en DOING: ${h.pendientes.doing}`,
  ];
  if (h.atascada) partes.push(`tarea atascada: "${h.atascada.nombre}" lleva ${h.atascada.dias} días en DOING`);
  return partes.join('; ');
}

const EMOJIS_PERMITIDOS = new Set(['🐾', '🦴', '🐶', '🐕', '👻', '🎾', '❤', '💙', '✨']);

// Palabras con género para referirse a la persona: el modelo no sabe su género.
const CON_GENERO = /(?<!\p{L})(guap[oa]s?|lind[oa]s?|bonit[oa]s?|amig[oa]s?|chic[oa]s?|campe[oó]n|campeona|reina|rey|princes[ao]|señor(?:a|ita)?|niñ[oa]|herman[oa]|querid[oa]|precios[oa]|bell[oa]|hermos[oa]|dueña)(?!\p{L})/iu;

// Errores de ortografía que el modelo pequeño ya cometió.
const ERRORES_CONOCIDOS = /(?<!\p{L})(al[ií]mate|alimentáme|alimentáte)(?!\p{L})/iu;

/**
 * Revisa lo que escribió la IA antes de mostrárselo a la persona.
 * Devuelve el mensaje limpio, o null si hay que usar la plantilla.
 */
export function validarMensajeIA(raw: unknown, base: string, h: PetHechos): string | null {
  // Quita emojis que no son de perro (por ejemplo 🍎 o 😭) y espacios de más.
  let m = Array.from(String(raw ?? ''))
    .filter((c) => !/\p{Extended_Pictographic}/u.test(c) || EMOJIS_PERMITIDOS.has(c))
    .join('')
    .replace(/(^|[^\p{Extended_Pictographic}])[️‍]+/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

  if (m.length < 5 || m.length > 200) return null;
  if (CON_GENERO.test(m) || ERRORES_CONOCIDOS.test(m)) return null;

  // Si el mensaje base nombra una tarea, la IA debe conservarla.
  for (const nombre of [h.atascada?.nombre, h.primeraTodo]) {
    if (nombre && base.includes(nombre) && !m.toLowerCase().includes(nombre.toLowerCase())) return null;
  }

  // No se aceptan números inventados: solo los de los hechos.
  const permitidos = new Set(
    [h.hechasHoy, h.comidasHoy, h.comidaDisponible, h.pendientes.backlog, h.pendientes.todo, h.pendientes.doing, h.atascada?.dias]
      .filter((n) => n !== undefined)
      .map(String),
  );
  for (const nombre of [h.atascada?.nombre, h.primeraTodo]) {
    for (const n of nombre?.match(/\d+/g) ?? []) permitidos.add(n);
  }
  for (const n of m.match(/\d+/g) ?? []) {
    if (!permitidos.has(n)) return null;
  }
  // Y los números del mensaje base deben seguir ahí.
  for (const n of base.match(/\d+/g) ?? []) {
    if (!m.includes(n)) return null;
  }

  return m;
}
