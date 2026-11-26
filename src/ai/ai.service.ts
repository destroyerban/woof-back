import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Cliente mínimo de Ollama (IA local, gratis): https://ollama.com
 *
 * Variables de entorno (todas opcionales):
 *   AI_PROVIDER   "ollama" (por defecto) o "none" para apagar la IA
 *   OLLAMA_URL    por defecto http://localhost:11434
 *   OLLAMA_MODEL  por defecto qwen2.5:3b
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  // En un PC de 8 GB el modelo responde de a una petición: se ponen en fila.
  private queue: Promise<unknown> = Promise.resolve();

  get enabled(): boolean {
    return (process.env.AI_PROVIDER ?? 'ollama').toLowerCase() !== 'none';
  }

  private get url(): string {
    return (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  }

  private get model(): string {
    return process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
  }

  /**
   * Pide al modelo una respuesta en JSON que cumpla `schema` y la devuelve ya parseada.
   * Lanza ServiceUnavailableException si la IA está apagada, no responde o
   * devuelve algo que no es JSON.
   */
  async chatJson<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    opts: { timeoutMs?: number; temperature?: number; maxTokens?: number } = {},
  ): Promise<T> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('La IA está desactivada (AI_PROVIDER=none).');
    }
    const run = () => this.request<T>(system, user, schema, opts);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async request<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    { timeoutMs = 60_000, temperature = 0.4, maxTokens = 600 }: { timeoutMs?: number; temperature?: number; maxTokens?: number },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: schema,
          options: { temperature, num_predict: maxTokens },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError' ? 'tardó demasiado en responder' : 'no está disponible';
      this.logger.warn(`Ollama ${reason}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(
        `La IA ${reason}. Revisa que Ollama esté abierto y que el modelo "${this.model}" esté descargado.`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Ollama respondió ${res.status}: ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException(
        res.status === 404
          ? `El modelo "${this.model}" no está descargado. Ejecuta: ollama pull ${this.model}`
          : 'La IA respondió con un error.',
      );
    }

    const data: any = await res.json();
    const content: string = data?.message?.content ?? '';
    try {
      return JSON.parse(content) as T;
    } catch {
      this.logger.warn(`Respuesta de la IA que no es JSON: ${content.slice(0, 200)}`);
      throw new ServiceUnavailableException('La IA devolvió una respuesta inválida. Intenta de nuevo.');
    }
  }
}
