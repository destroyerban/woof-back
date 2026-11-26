import { mensajeBase, PetHechos } from './pet-mensaje.service';

const base: PetHechos = {
  estado: 'HAMBRIENTO',
  hechasHoy: 0,
  comidasHoy: 0,
  comidaDisponible: 0,
  pendientes: { backlog: 0, todo: 0, doing: 0 },
};

describe('Mensaje del perro (plantillas)', () => {
  it('avisa primero si hay comida disponible', () => {
    const m = mensajeBase({ ...base, estado: 'MUERTO', hechasHoy: 2, comidaDisponible: 2 });
    expect(m).toMatch(/2/);
    expect(m).toMatch(/🦴/);
  });

  it('como fantasma pide completar una tarea', () => {
    expect(mensajeBase({ ...base, estado: 'MUERTO' })).toMatch(/👻/);
  });

  it('menciona la tarea atascada en DOING', () => {
    const m = mensajeBase({ ...base, atascada: { nombre: 'Informe de física', dias: 3 } });
    expect(m).toContain('Informe de física');
    expect(m).toContain('3 días');
  });

  it('feliz celebra las tareas del día', () => {
    expect(mensajeBase({ ...base, estado: 'FELIZ', hechasHoy: 7, comidasHoy: 7 })).toContain('7');
  });

  it('sugiere empezar por una tarea en TO DO', () => {
    const m = mensajeBase({ ...base, pendientes: { backlog: 0, todo: 2, doing: 0 }, primeraTodo: 'Leer capítulo 3' });
    expect(m).toContain('Leer capítulo 3');
  });

  it('sin tareas invita a crear una', () => {
    expect(mensajeBase(base)).toMatch(/tarea|meta/);
  });
});
