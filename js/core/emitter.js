/** Emisor de eventos mínimo para desacoplar servicios, dominio e interfaz. */
export class Emitter {
  #handlers = new Map();

  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.#handlers.get(type)?.delete(fn);
  }

  emit(type, data) {
    for (const fn of [...(this.#handlers.get(type) ?? [])]) {
      try {
        fn(data);
      } catch (err) {
        console.error(`Error en un manejador de "${type}"`, err);
      }
    }
  }
}
