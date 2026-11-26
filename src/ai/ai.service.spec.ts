import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { DesglosarService, limpiarSubtareas } from './desglosar.service';

/** Servidor que imita la API /api/chat de Ollama. */
function fakeOllama(handler: (body: any) => { status?: number; content?: string; delayMs?: number }) {
  const recibidos: any[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      recibidos.push(body);
      const { status = 200, content = '', delayMs = 0 } = handler(body);
      setTimeout(() => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(status === 200 ? JSON.stringify({ message: { role: 'assistant', content } }) : '{"error":"model not found"}');
      }, delayMs);
    });
  });
  return new Promise<{ url: string; recibidos: any[]; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, recibidos, close: () => server.close() });
    }),
  );
}

describe('IA con Ollama', () => {
  const envOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('desglosa una meta y limpia la respuesta del modelo', async () => {
    const ollama = await fakeOllama(() => ({
      content: JSON.stringify({
        subtareas: [
          { nombre: '  Investigar   el tema ', descripcion: 'Buscar fuentes' },
          { nombre: 'Investigar el tema', descripcion: 'repetida' },
          { nombre: '', descripcion: 'vacía' },
          { nombre: 'Hacer diapositivas', descripcion: '' },
          { nombre: 'Ensayar', descripcion: 'Practicar en voz alta' },
        ],
      }),
    }));
    process.env.OLLAMA_URL = ollama.url;
    process.env.OLLAMA_MODEL = 'modelo-prueba';
    const svc = new DesglosarService(new AiService());

    const r = await svc.desglosar('Preparar la exposición de Cálculo', 3);

    expect(r).toEqual([
      { nombre: 'Investigar el tema', descripcion: 'Buscar fuentes' },
      { nombre: 'Hacer diapositivas', descripcion: 'Hacer diapositivas' },
      { nombre: 'Ensayar', descripcion: 'Practicar en voz alta' },
    ]);
    const enviado = ollama.recibidos[0];
    expect(enviado.model).toBe('modelo-prueba');
    expect(enviado.stream).toBe(false);
    expect(enviado.format.required).toEqual(['subtareas']);
    expect(enviado.messages[1].content).toContain('Preparar la exposición de Cálculo');
    expect(enviado.messages[1].content).toContain('exactamente 3');
    ollama.close();
  });

  it('rechaza metas vacías o muy largas sin llamar a la IA', async () => {
    const svc = new DesglosarService(new AiService());
    await expect(svc.desglosar('  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.desglosar('x'.repeat(301))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.desglosar(123 as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('da un error claro si Ollama no está encendido', async () => {
    process.env.OLLAMA_URL = 'http://127.0.0.1:1';
    await expect(new DesglosarService(new AiService()).desglosar('Estudiar para el parcial')).rejects.toThrow(
      /no está disponible/,
    );
  });

  it('da un error claro si el modelo no está descargado (404)', async () => {
    const ollama = await fakeOllama(() => ({ status: 404 }));
    process.env.OLLAMA_URL = ollama.url;
    process.env.OLLAMA_MODEL = 'no-existe:1b';
    await expect(new AiService().chatJson('s', 'u', {})).rejects.toThrow(/ollama pull no-existe:1b/);
    ollama.close();
  });

  it('da un error claro si la respuesta no es JSON', async () => {
    const ollama = await fakeOllama(() => ({ content: 'esto no es json' }));
    process.env.OLLAMA_URL = ollama.url;
    await expect(new AiService().chatJson('s', 'u', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    ollama.close();
  });

  it('corta por tiempo de espera', async () => {
    const ollama = await fakeOllama(() => ({ content: '{}', delayMs: 500 }));
    process.env.OLLAMA_URL = ollama.url;
    await expect(new AiService().chatJson('s', 'u', {}, { timeoutMs: 100 })).rejects.toThrow(/tardó demasiado/);
    ollama.close();
  });

  it('con AI_PROVIDER=none no llama a la IA', async () => {
    process.env.AI_PROVIDER = 'none';
    const ai = new AiService();
    expect(ai.enabled).toBe(false);
    await expect(ai.chatJson('s', 'u', {})).rejects.toThrow(/desactivada/);
  });

  it('atiende las peticiones de a una (en fila)', async () => {
    let activas = 0;
    let maxActivas = 0;
    const ollama = await fakeOllama(() => {
      activas++;
      maxActivas = Math.max(maxActivas, activas);
      setTimeout(() => activas--, 80);
      return { content: '{"ok":true}', delayMs: 80 };
    });
    process.env.OLLAMA_URL = ollama.url;
    const ai = new AiService();
    await Promise.all([ai.chatJson('s', '1', {}), ai.chatJson('s', '2', {}), ai.chatJson('s', '3', {})]);
    expect(maxActivas).toBe(1);
    ollama.close();
  });

  it('limpiarSubtareas tolera respuestas raras', () => {
    expect(limpiarSubtareas(null, 5)).toEqual([]);
    expect(limpiarSubtareas([{ nombre: 'A' }, 'texto', { nombre: 'B', descripcion: 'b' }], 5)).toEqual([
      { nombre: 'A', descripcion: 'A' },
      { nombre: 'B', descripcion: 'b' },
    ]);
  });
});
