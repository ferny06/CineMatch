/**
 * ColaService — CineMatch
 *
 * Responsabilidad principal:
 *  Proveer el único punto de entrada reutilizable para encolar operaciones
 *  de sincronización en `cola_sync` desde cualquier página o servicio.
 *
 * ─── Cómo usarlo en una página ──────────────────────────────────────────────
 *
 *  Patrón de dos pasos en cualquier operación que modifique datos:
 *
 *    // Paso 1: escribir en SQLite local (usando DatabaseService)
 *    const db = this.databaseService.obtenerConexion();
 *    await db.run(
 *      `INSERT INTO local_resena (local_id, usuario_id, ...) VALUES (?, ?, ...)`,
 *      [localId, usuarioId, ...]
 *    );
 *
 *    // Paso 2: encolar para sync con Supabase (usando ColaService)
 *    await this.colaService.encolar(DB_TABLES.RESENA, localId, 'INSERT');
 *    //  → Si hay red: sync inmediato a Supabase (fire-and-forget)
 *    //  → Si no hay red: queda en cola; se enviará cuando vuelva la red
 *                          o en el próximo arranque de la app
 *
 * ─── ¿Por qué este servicio y no escribir en cola_sync directamente? ────────
 *
 *  1. Centraliza la lógica: un solo lugar para cambiar el comportamiento
 *  2. Integra la detección de red: decide si sync es inmediato o diferido
 *  3. Evita código duplicado en cada página
 *  4. Si en el futuro se agrega prioridad, deduplicación o lógica de retry,
 *     se hace aquí sin tocar las páginas
 *
 * ─── Dependencias ────────────────────────────────────────────────────────────
 *
 *  ColaService → DatabaseService  (para escribir en cola_sync)
 *  ColaService → NetworkService   (para verificar conectividad)
 *  ColaService → SyncService      (para disparar sync inmediato)
 *
 *  No existe dependencia circular: ninguno de los tres servicios inyecta
 *  ColaService de vuelta.
 */

import { Injectable } from '@angular/core';
import { DatabaseService } from '../../database/services/database.service';
import { NetworkService } from './network.service';
import { SyncService } from './sync.service';
import { DB_TABLES, SYNC_COLA_STATUS, SYNC_OPERACION } from '../../database/database.constants';

// ─── Tipo auxiliar para restringir las operaciones válidas ───────────────────

/**
 * Tipo de operación DML permitida en la cola de sincronización.
 * Refleja los valores del CHECK constraint en cola_sync.operacion.
 */
export type OperacionSync =
  | typeof SYNC_OPERACION.INSERT
  | typeof SYNC_OPERACION.UPDATE
  | typeof SYNC_OPERACION.DELETE;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root', // Singleton automático — inyectable en cualquier página
})
export class ColaService {

  constructor(
    private databaseService: DatabaseService,
    private networkService: NetworkService,
    private syncService: SyncService,
  ) {}

  /**
   * Encola una operación pendiente de sincronización con Supabase.
   *
   * Flujo interno:
   *  1. Inserta un registro en `cola_sync` con status='pendiente'
   *  2. Si el dispositivo tiene red: dispara `SyncService.procesarCola()`
   *     de forma asíncrona (fire-and-forget, no bloquea la UI)
   *  3. Si no hay red: el ítem queda en cola hasta que:
   *     - El dispositivo recupere red (NetworkService lo detecta y dispara sync)
   *     - O la app se reinicie (AppComponent llama procesarCola() al arrancar)
   *
   * @param tabla      Nombre de la tabla local origen (usar constantes DB_TABLES).
   *                   Ej: DB_TABLES.RESENA, DB_TABLES.LISTA
   * @param registroId UUID del registro afectado (local_id para listas/reseñas/mensajes,
   *                   id para usuarios/películas)
   * @param operacion  Tipo de operación: 'INSERT' | 'UPDATE' | 'DELETE'
   *                   (usar constantes SYNC_OPERACION)
   *
   * @example — Guardar una nueva reseña offline-first:
   * ```typescript
   * // 1. Escribir en local
   * await db.run(`INSERT INTO local_resena (...) VALUES (...)`, [...]);
   *
   * // 2. Encolar para sync (una sola línea)
   * await this.colaService.encolar(DB_TABLES.RESENA, localId, SYNC_OPERACION.INSERT);
   * ```
   *
   * @example — Actualizar una entrada en la lista:
   * ```typescript
   * await db.run(`UPDATE local_lista SET estado=? WHERE local_id=?`, [nuevoEstado, localId]);
   * await this.colaService.encolar(DB_TABLES.LISTA, localId, SYNC_OPERACION.UPDATE);
   * ```
   *
   * @example — Eliminar un mensaje:
   * ```typescript
   * await db.run(`DELETE FROM local_mensaje WHERE local_id=?`, [localId]);
   * await this.colaService.encolar(DB_TABLES.MENSAJE, localId, SYNC_OPERACION.DELETE);
   * ```
   */
  async encolar(
    tabla: string,
    registroId: string,
    operacion: OperacionSync,
  ): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    // ── Paso 1: Persistir en cola_sync ────────────────────────────────────────
    // El registro queda en disco inmediatamente, incluso si el sync falla después.
    // intentos=0 indica que aún no se ha intentado enviar a Supabase.
    await db.run(
      `INSERT INTO ${DB_TABLES.COLA_SYNC}
         (tabla, registro_id, operacion, intentos, status, created_at)
       VALUES (?, ?, ?, 0, '${SYNC_COLA_STATUS.PENDIENTE}', ?)`,
      [tabla, registroId, operacion, ahora]
    );

    console.log(`[ColaService] Encolado: ${operacion} en ${tabla} (id: ${registroId})`);

    // ── Paso 2: Sync inmediato si hay red ─────────────────────────────────────
    // Se usa setTimeout(0) para diferir procesarCola() a la siguiente macrotarea.
    // Esto garantiza que todos los encolar() del caller terminen (y sus INSERTs
    // en cola_sync se completen) antes de que el SELECT de procesarCola() se ejecute.
    // Sin el defer, el primer encolar() dispara el SELECT antes de que el segundo
    // encolar() inserte su ítem, dejando registros sin procesar en ese ciclo.
    if (this.networkService.estaConectado) {
      console.log('[ColaService] Red disponible — iniciando sync inmediato...');

      setTimeout(() => {
        // .catch() evita que una promesa rechazada genere un UnhandledPromiseRejection.
        // Los errores individuales de cada ítem son manejados por SyncService.
        this.syncService.procesarCola().catch((err) => {
          console.error('[ColaService] Error en sync inmediato:', err);
        });
      }, 0);
    } else {
      // Sin red: el ítem quedará pendiente hasta que NetworkService detecte
      // conectividad o hasta el próximo arranque de la app.
      console.log('[ColaService] Sin red — ítem queda pendiente en cola_sync.');
    }
  }
}
