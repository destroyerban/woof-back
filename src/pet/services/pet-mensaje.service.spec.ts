import { mensajeBase, PetHechos, validarMensajeIA } from './pet-mensaje.service';

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

describe('Filtro de los mensajes de la IA', () => {
  const muerto: PetHechos = { ...base, estado: 'MUERTO' };
  const baseMuerto = 'Uuuh... hoy no he comido 👻 Termina una tarea y aliméntame, ¡por favor!';

  it('rechaza el mensaje real con "guapa" y "alímate"', () => {
    expect(validarMensajeIA('😭 Hoy no comí 🍎 Termina una tarea y alímate, guapa! 🐶', baseMuerto, muerto)).toBeNull();
  });

  it('rechaza palabras con género aunque el resto esté bien', () => {
    for (const p of ['¡Vamos, campeón! Aliméntame 🦴', 'Hola amiga, tengo hambre 🐾', '¡Eres el mejor, guapo!']) {
      expect(validarMensajeIA(p, baseMuerto, muerto)).toBeNull();
    }
  });

  it('no confunde palabras que solo contienen esas letras', () => {
    // "amigable" contiene "amig" pero no es "amigo/amiga"
    expect(validarMensajeIA('Soy un fantasma amigable 👻 Aliméntame, por favor 🦴', baseMuerto, muerto)).toBe(
      'Soy un fantasma amigable 👻 Aliméntame, por favor 🦴',
    );
  });

  it('quita emojis que no son de perro', () => {
    expect(validarMensajeIA('😭 Hoy no comí 🍎 ¡Aliméntame, por favor! 🐶', baseMuerto, muerto)).toBe(
      'Hoy no comí ¡Aliméntame, por favor! 🐶',
    );
  });

  it('exige conservar el nombre de la tarea y los números', () => {
    const h: PetHechos = { ...base, atascada: { nombre: 'Informe de física', dias: 3 } };
    const b = '"Informe de física" lleva 3 días en DOING 🐾 ¿La terminamos hoy?';
    expect(validarMensajeIA('¡Guau! "Informe de física" lleva 3 días en DOING 🐾', b, h)).not.toBeNull();
    expect(validarMensajeIA('¡Guau! Tu informe lleva 3 días en DOING 🐾', b, h)).toBeNull();
    expect(validarMensajeIA('¡Guau! "Informe de física" lleva 5 días en DOING 🐾', b, h)).toBeNull();
  });

  it('rechaza números inventados', () => {
    expect(validarMensajeIA('Llevo 10 horas sin comer 👻 aliméntame', baseMuerto, muerto)).toBeNull();
  });

  it('rechaza mensajes vacíos o larguísimos', () => {
    expect(validarMensajeIA('', baseMuerto, muerto)).toBeNull();
    expect(validarMensajeIA('guau '.repeat(60), baseMuerto, muerto)).toBeNull();
  });
});
