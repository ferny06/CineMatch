/**
 * SyncService — CineMatch
 *
 * Responsabilidad principal:
 *  Procesar la cola de operaciones pendientes (`cola_sync`) y replicar cada
 *  registro del SQLite local hacia las tablas correspondientes en Supabase,
 *  respetando el orden de dependencias de claves foráneas para evitar
 *  errores de integridad referencial.
 *
 * ─── Orden FK-safe de procesamiento ─────────────────────────────────────────
 *
 *  Tier 1 — Sin dependencias:
 *    local_usuario  → usuario
 *    local_pelicula → pelicula + genero + pelicula_genero
 *
 *  Tier 2 — Dependen de Tier 1:
 *    local_lista    → lista_peliculas   (requiere: usuario + pelicula)
 *    local_resena   → resena            (requiere: usuario + pelicula)
 *
 *  Tier 3 — Depende de conversacion en Supabase (servidor):
 *    local_mensaje  → mensaje           (requiere: conversacion + usuario)
 *
 *  PULL only (no se genera desde el cliente):
 *    local_conversacion ← conversacion  (creada server-side al aceptar conexión)
 *
 * ─── Lógica de reintentos ────────────────────────────────────────────────────
 *
 *  Un ítem de cola_sync se reintenta si:
 *    - status = 'pendiente' (nunca procesado)
 *    - status = 'error' Y intentos < MAX_REINTENTOS (3)
 *
 *  Al superar MAX_REINTENTOS, el ítem queda en status='error' permanentemente
 *  y debe ser revisado/corregido manualmente o por un proceso de limpieza.
 *
 * ─── Flujo por operación ────────────────────────────────────────────────────
 *
 *  INSERT:
 *    1. Leer el registro completo de la tabla local por `registro_id`
 *    2. Enviar a Supabase con el método correspondiente del SupabaseService
 *    3. Guardar el UUID devuelto por Supabase como `server_id` en el local
 *    4. Actualizar `sync_status = 'synced'` y `synced_at` en el local
 *    5. Marcar el ítem de cola como 'completado'
 *
 *  UPDATE:
 *    1. Leer el registro local (ya debe tener `server_id` del INSERT previo)
 *    2. Enviar actualización a Supabase usando `server_id`
 *    3. Actualizar `sync_status = 'synced'` y `synced_at` en el local
 *    4. Marcar el ítem de cola como 'completado'
 *
 *  DELETE:
 *    1. Leer solo el `server_id` del registro local (puede estar ya eliminado)
 *    2. Eliminar en Supabase usando `server_id`
 *    3. Marcar el ítem de cola como 'completado'
 */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { DatabaseService } from '../../database/services/database.service';
import {
  DB_TABLES,
  SYNC_STATUS,
  SYNC_COLA_STATUS,
  SYNC_OPERACION,
} from '../../database/database.constants';
import { ColaSync } from '../../database/models/cola-sync.model';
import { LocalUsuario } from '../../database/models/local-usuario.model';
import { LocalPelicula } from '../../database/models/local-pelicula.model';
import { LocalLista } from '../../database/models/local-lista.model';
import { LocalResena } from '../../database/models/local-resena.model';
import { LocalMensaje } from '../../database/models/local-mensaje.model';
import { LocalUsuarioGeneroPreferencia } from '../../database/models/local-usuario-genero-preferencia.model';

// ─── Constantes de control ────────────────────────────────────────────────────

/** Número máximo de intentos antes de marcar un ítem como error permanente */
const MAX_REINTENTOS = 3;

/**
 * Orden en el que se procesan las tablas locales al sincronizar con Supabase.
 * El índice más bajo se procesa primero, garantizando que las FK ya existan
 * en Supabase cuando se inserta un registro dependiente.
 *
 * Tier 1: usuario, pelicula   (sin FK hacia otras tablas sincronizables)
 * Tier 2: lista, resena,      (FK hacia usuario + pelicula)
 *         pref_genero         (FK hacia usuario; tmdb_genero_id no es FK real)
 * Tier 3: mensaje             (FK hacia conversacion + usuario)
 */
const ORDEN_SYNC: string[] = [
  DB_TABLES.USUARIO,      // Tier 1 — sin dependencias
  DB_TABLES.PELICULA,     // Tier 1 — sin dependencias
  DB_TABLES.LISTA,        // Tier 2 — depende de usuario + pelicula
  DB_TABLES.RESENA,       // Tier 2 — depende de usuario + pelicula
  DB_TABLES.PREF_GENERO,  // Tier 2 — depende de usuario (FK); tmdb_genero_id es solo un entero
  DB_TABLES.MENSAJE,      // Tier 3 — depende de conversacion + usuario
];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root', // Singleton; se inyecta en AppComponent para el arranque
})
export class SyncService {

  /**
   * Guardia de concurrencia: evita que `procesarCola()` se ejecute dos veces
   * en paralelo cuando se dispara simultáneamente desde múltiples fuentes
   * (ej: AppComponent al arrancar + NetworkService al recuperar red).
   *
   * Si una ejecución ya está en curso, la nueva llamada retorna inmediatamente
   * sin duplicar trabajo ni causar condiciones de carrera en cola_sync.
   */
  private enProceso = false;

  constructor(
    private supabaseService: SupabaseService,
    private databaseService: DatabaseService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════════
  // PUNTO DE ENTRADA PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Punto de entrada principal del proceso de sincronización.
   *
   * Lee todos los ítems pendientes o con error recuperable de `cola_sync`,
   * los agrupa por tabla respetando el orden FK-safe definido en ORDEN_SYNC
   * y procesa cada grupo secuencialmente.
   *
   * Este método es seguro de llamar en cada inicio de la app y desde el
   * listener de red:
   *  - Si ya hay un procesamiento en curso, retorna sin hacer nada (guardia).
   *  - Si no hay ítems pendientes, retorna inmediatamente sin hacer nada.
   *  - Los ítems ya sincronizados (status='completado') son ignorados.
   *  - Los ítems con demasiados errores (intentos >= MAX_REINTENTOS) son ignorados.
   */
  async procesarCola(): Promise<void> {
    // ── Guardia de concurrencia ───────────────────────────────────────────────
    // Previene ejecuciones paralelas cuando la red vuelve justo al arrancar la app.
    if (this.enProceso) {
      console.log('[SyncService] Sync ya en progreso. Ignorando llamada duplicada.');
      return;
    }

    this.enProceso = true;
    console.log('[SyncService] Iniciando procesamiento de cola de sincronización...');

    // El bloque try/finally garantiza que enProceso=false incluso si hay un
    // error inesperado, evitando que el servicio quede bloqueado para siempre.
    try {

    // Obtener la conexión activa a SQLite
    const db = this.databaseService.obtenerConexion();

    // Leer todos los ítems pendientes o con error recuperable
    // Condición: status IN ('pendiente', 'error') AND intentos < MAX_REINTENTOS
    const resultadoCola = await db.query(`
      SELECT * FROM ${DB_TABLES.COLA_SYNC}
      WHERE status IN ('${SYNC_COLA_STATUS.PENDIENTE}', '${SYNC_COLA_STATUS.ERROR}')
        AND intentos < ${MAX_REINTENTOS}
      ORDER BY created_at ASC
    `);

    const items: ColaSync[] = resultadoCola.values ?? [];

    if (items.length === 0) {
      console.log('[SyncService] Cola vacía. No hay elementos para sincronizar.');
      return; // El bloque finally libera enProceso antes de salir
    }

    console.log(`[SyncService] ${items.length} ítem(s) en cola para procesar.`);

    // ── Agrupar los ítems por tabla para respetar el orden FK-safe ────────────
    // Usamos un Map para mantener un array por tabla
    const porTabla = new Map<string, ColaSync[]>();

    for (const item of items) {
      if (!porTabla.has(item.tabla)) {
        porTabla.set(item.tabla, []);
      }
      porTabla.get(item.tabla)!.push(item);
    }

    // ── Procesar cada tabla en el orden FK-safe ───────────────────────────────
    for (const nombreTabla of ORDEN_SYNC) {
      const itemsTabla = porTabla.get(nombreTabla);

      if (!itemsTabla || itemsTabla.length === 0) {
        continue; // No hay ítems pendientes para esta tabla
      }

      console.log(`[SyncService] Procesando tabla: ${nombreTabla} (${itemsTabla.length} ítems)`);

      // Procesar cada ítem de la tabla secuencialmente
      for (const item of itemsTabla) {
        await this.procesarItem(item);
      }
    }

      console.log('[SyncService] Procesamiento de cola completado.');
    } finally {
      // Liberar la guardia siempre, incluso si hubo un error no capturado.
      // Sin esto, un error inesperado dejaría el servicio bloqueado permanentemente.
      this.enProceso = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DISPATCHER POR ÍTEM
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Despacha un ítem de la cola al método de sincronización correcto según su tabla.
   *
   * Antes de procesar, marca el ítem como 'en_proceso' para evitar que otro
   * hilo/proceso lo tome simultáneamente. Si ocurre un error, incrementa el
   * contador de intentos y registra la fecha del último intento fallido.
   *
   * @param item Ítem de la cola a procesar
   */
  private async procesarItem(item: ColaSync): Promise<void> {
    // Marcar como 'en_proceso' antes de comenzar
    await this.marcarEnProceso(item.id!);

    try {
      // Despachar al método correcto según la tabla origen
      switch (item.tabla) {
        case DB_TABLES.USUARIO:
          await this.sincronizarUsuario(item);
          break;
        case DB_TABLES.PELICULA:
          await this.sincronizarPelicula(item);
          break;
        case DB_TABLES.LISTA:
          await this.sincronizarLista(item);
          break;
        case DB_TABLES.RESENA:
          await this.sincronizarResena(item);
          break;
        case DB_TABLES.PREF_GENERO:
          await this.sincronizarPreferenciaGenero(item);
          break;
        case DB_TABLES.MENSAJE:
          await this.sincronizarMensaje(item);
          break;
        default:
          // Tabla no reconocida: marcar como error para que no se reintente
          console.warn(`[SyncService] Tabla no reconocida en cola_sync: ${item.tabla}`);
          await this.marcarError(item.id!, item.intentos);
      }
    } catch (error: any) {
      // Error inesperado (ej: sin conexión a internet, timeout)
      // Incrementar intentos y dejar disponible para el próximo ciclo
      console.error(`[SyncService] Error procesando ítem ${item.id}:`, error?.message ?? error);
      await this.marcarError(item.id!, item.intentos);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SINCRONIZACIÓN POR ENTIDAD
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Sincroniza un registro de `local_usuario` con la tabla `usuario` en Supabase.
   *
   * Solo soporta INSERT y UPDATE (los usuarios no se eliminan localmente).
   * La operación usa `upsert` en Supabase, por lo que INSERT y UPDATE se manejan
   * de la misma manera: si el `id` ya existe en Supabase, se actualiza.
   *
   * @param item Ítem de la cola con `registro_id` = id local del usuario
   */
  private async sincronizarUsuario(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    // Leer el registro completo desde SQLite
    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.USUARIO} WHERE id = ?`,
      [item.registro_id]
    );

    const usuario: LocalUsuario | undefined = resultado.values?.[0];

    if (!usuario) {
      // El registro fue eliminado localmente antes de sincronizarse; ignorar
      console.warn(`[SyncService] Usuario ${item.registro_id} no encontrado en local. Ignorando.`);
      await this.marcarCompletado(item.id!);
      return;
    }

    // Enviar a Supabase (upsert: crea o actualiza según el id)
    const { error } = await this.supabaseService.upsertUsuario(usuario);

    if (error) {
      throw new Error(`upsertUsuario falló: ${error}`);
    }

    // Actualizar sync_status en el registro local
    await this.actualizarSyncStatus(DB_TABLES.USUARIO, 'id', item.registro_id);
    await this.marcarCompletado(item.id!);

    console.log(`[SyncService] ✓ Usuario ${item.registro_id} sincronizado.`);
  }

  /**
   * Sincroniza un registro de `local_pelicula` con `pelicula` en Supabase.
   *
   * Además de la película, sincroniza sus géneros usando las tablas `genero`
   * y `pelicula_genero` del esquema central (la normalizacion del JSON local).
   *
   * El `server_id` de la película se obtiene del upsert y se guarda en local.
   *
   * @param item Ítem de la cola con `registro_id` = id local de la película
   */
  private async sincronizarPelicula(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.PELICULA} WHERE id = ?`,
      [item.registro_id]
    );

    const pelicula: LocalPelicula | undefined = resultado.values?.[0];

    if (!pelicula) {
      console.warn(`[SyncService] Película ${item.registro_id} no encontrada en local. Ignorando.`);
      await this.marcarCompletado(item.id!);
      return;
    }

    // Upsert película + géneros + pelicula_genero en Supabase
    const { data: serverId, error } = await this.supabaseService.upsertPelicula(pelicula);

    if (error || !serverId) {
      throw new Error(`upsertPelicula falló: ${error}`);
    }

    const localId = item.registro_id;

    if (serverId !== localId) {
      // La película ya existía en Supabase con un UUID distinto al generado localmente.
      // Hay que reemplazar el UUID local por el de Supabase en todas las tablas
      // que lo referencian para que las FK funcionen correctamente.
      console.warn(
        `[SyncService] UUID local (${localId}) difiere del UUID Supabase (${serverId}). ` +
        `Actualizando referencias locales...`
      );

      await db.run(
        `UPDATE ${DB_TABLES.PELICULA} SET id = ?, synced_at = ? WHERE id = ?`,
        [serverId, new Date().toISOString(), localId]
      );

      // Cascadear el nuevo UUID a local_resena y local_lista
      await db.run(
        `UPDATE ${DB_TABLES.RESENA} SET pelicula_id = ? WHERE pelicula_id = ?`,
        [serverId, localId]
      );
      await db.run(
        `UPDATE ${DB_TABLES.LISTA} SET pelicula_id = ? WHERE pelicula_id = ?`,
        [serverId, localId]
      );

      // Actualizar el registro_id en cola_sync para que ítems futuros apunten al UUID correcto
      await db.run(
        `UPDATE ${DB_TABLES.COLA_SYNC} SET registro_id = ? WHERE tabla = ? AND registro_id = ?`,
        [serverId, DB_TABLES.PELICULA, localId]
      );
    } else {
      // UUID local ya coincide con Supabase — solo actualizar synced_at
      // (local_pelicula no tiene columna sync_status, solo synced_at)
      await db.run(
        `UPDATE ${DB_TABLES.PELICULA} SET synced_at = ? WHERE id = ?`,
        [new Date().toISOString(), localId]
      );
    }

    await this.marcarCompletado(item.id!);
    console.log(`[SyncService] ✓ Película ${localId} → Supabase id ${serverId}.`);
  }

  /**
   * Sincroniza un registro de `local_lista` con `lista_peliculas` en Supabase.
   *
   * Flujo según operación:
   *  INSERT → insertLista → guardar server_id devuelto
   *  UPDATE → updateLista usando el server_id existente
   *  DELETE → deleteLista usando el server_id existente
   *
   * Precondición: `usuario_id` y `pelicula_id` ya deben existir en Supabase
   * (procesados en Tier 1 antes que este Tier 2).
   *
   * @param item Ítem de la cola con `registro_id` = local_id de la entrada
   */
  private async sincronizarLista(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.LISTA} WHERE local_id = ?`,
      [item.registro_id]
    );

    const listaRaw: any = resultado.values?.[0];
    const lista: LocalLista | undefined = listaRaw
      ? {
          ...listaRaw,
          // SQLite devuelve peliculas_ids como TEXT; deserializar al tipo correcto
          peliculas_ids: typeof listaRaw.peliculas_ids === 'string'
            ? JSON.parse(listaRaw.peliculas_ids || '[]')
            : (listaRaw.peliculas_ids ?? []),
        }
      : undefined;

    if (item.operacion === SYNC_OPERACION.DELETE) {
      // Para DELETE solo necesitamos el server_id; el registro local puede
      // haber sido eliminado de SQLite antes de alcanzar este punto.
      const serverId = lista?.server_id;

      if (serverId) {
        const { error } = await this.supabaseService.deleteLista(serverId);
        if (error) throw new Error(`deleteLista falló: ${error}`);
      }

      await this.marcarCompletado(item.id!);
      return;
    }

    if (!lista) {
      console.warn(`[SyncService] Lista ${item.registro_id} no encontrada en local. Ignorando.`);
      await this.marcarCompletado(item.id!);
      return;
    }

    if (item.operacion === SYNC_OPERACION.INSERT) {
      // INSERT: crear en Supabase y guardar el id devuelto como server_id
      const { data: serverId, error } = await this.supabaseService.insertLista(lista);

      if (error || !serverId) {
        throw new Error(`insertLista falló: ${error}`);
      }

      await this.actualizarServerId(DB_TABLES.LISTA, 'local_id', item.registro_id, serverId);

    } else if (item.operacion === SYNC_OPERACION.UPDATE) {
      // UPDATE: actualizar usando el server_id obtenido en el INSERT previo
      if (!lista.server_id) {
        throw new Error(`No se puede UPDATE lista ${item.registro_id}: server_id es null`);
      }

      const { error } = await this.supabaseService.updateLista(lista.server_id, lista);
      if (error) throw new Error(`updateLista falló: ${error}`);

      await this.actualizarSyncStatus(DB_TABLES.LISTA, 'local_id', item.registro_id);
    }

    await this.marcarCompletado(item.id!);
    console.log(`[SyncService] ✓ Lista ${item.registro_id} (${item.operacion}) sincronizada.`);
  }

  /**
   * Sincroniza un registro de `local_resena` con `resena` en Supabase.
   *
   * Flujo idéntico al de lista_peliculas:
   *  INSERT → insertResena → guardar server_id
   *  UPDATE → updateResena por server_id
   *  DELETE → deleteResena por server_id
   *
   * @param item Ítem de la cola con `registro_id` = local_id de la reseña
   */
  private async sincronizarResena(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.RESENA} WHERE local_id = ?`,
      [item.registro_id]
    );

    const resena: LocalResena | undefined = resultado.values?.[0];

    if (item.operacion === SYNC_OPERACION.DELETE) {
      const serverId = resena?.server_id;

      if (serverId) {
        const { error } = await this.supabaseService.deleteResena(serverId);
        if (error) throw new Error(`deleteResena falló: ${error}`);
      }

      await this.marcarCompletado(item.id!);
      return;
    }

    if (!resena) {
      console.warn(`[SyncService] Reseña ${item.registro_id} no encontrada en local. Ignorando.`);
      await this.marcarCompletado(item.id!);
      return;
    }

    if (item.operacion === SYNC_OPERACION.INSERT) {
      const { data: serverId, error } = await this.supabaseService.insertResena(resena);

      if (error || !serverId) {
        throw new Error(`insertResena falló: ${error}`);
      }

      await this.actualizarServerId(DB_TABLES.RESENA, 'local_id', item.registro_id, serverId);

    } else if (item.operacion === SYNC_OPERACION.UPDATE) {
      if (!resena.server_id) {
        throw new Error(`No se puede UPDATE reseña ${item.registro_id}: server_id es null`);
      }

      const { error } = await this.supabaseService.updateResena(resena.server_id, resena);
      if (error) throw new Error(`updateResena falló: ${error}`);

      await this.actualizarSyncStatus(DB_TABLES.RESENA, 'local_id', item.registro_id);
    }

    await this.marcarCompletado(item.id!);
    console.log(`[SyncService] ✓ Reseña ${item.registro_id} (${item.operacion}) sincronizada.`);
  }

  /**
   * Sincroniza un registro de `local_usuario_genero_preferencia` con la tabla
   * `usuario_genero_preferencia` en Supabase.
   *
   * Tanto los INSERT como los UPDATE locales se traducen en un único upsert en
   * Supabase, porque lo que importa en el servidor es el estado final del peso
   * (peso_pref + conteo), no el historial de cambios.
   *
   * No existe operación DELETE para preferencias: el usuario no puede borrarlas
   * explícitamente; se recalculan automáticamente con cada nueva reseña.
   *
   * La tabla usa `id` (no `local_id`) como PK, igual que `local_usuario`.
   * Por eso se llama a actualizarSyncStatus con pkCampo = 'id'.
   *
   * @param item Ítem de la cola con `registro_id` = id de la preferencia
   */
  private async sincronizarPreferenciaGenero(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.PREF_GENERO} WHERE id = ?`,
      [item.registro_id]
    );

    const pref: LocalUsuarioGeneroPreferencia | undefined = resultado.values?.[0];

    if (!pref) {
      // El registro fue eliminado localmente antes de sincronizarse; ignorar.
      console.warn(
        `[SyncService] PreferenciaGenero ${item.registro_id} no encontrada en local. Ignorando.`
      );
      await this.marcarCompletado(item.id!);
      return;
    }

    // INSERT y UPDATE usan el mismo upsert: el servidor guarda el estado final.
    const { error } = await this.supabaseService.upsertPreferenciaGenero(pref);

    if (error) {
      if (error.startsWith('GENRE_NOT_FOUND:')) {
        // El género aún no existe en Supabase: upsertPelicula no ha corrido (o falló) en este
        // ciclo de sync. Resetear a 'pendiente' sin gastar un intento para que el próximo ciclo
        // lo reintente una vez que Tier 1 haya creado el género.
        console.warn(
          `[SyncService] Género no encontrado en Supabase para pref ${item.registro_id} ` +
          `(${error}). Se reintentará en el siguiente ciclo sin consumir un intento.`
        );
        await this.marcarPendiente(item.id!);
        return;
      }
      throw new Error(`upsertPreferenciaGenero falló: ${error}`);
    }

    // Actualizar sync_status='synced' y synced_at en el registro local.
    // pkCampo = 'id' porque local_usuario_genero_preferencia usa 'id' como PK.
    await this.actualizarSyncStatus(DB_TABLES.PREF_GENERO, 'id', item.registro_id);
    await this.marcarCompletado(item.id!);

    console.log(`[SyncService] ✓ PreferenciaGenero ${item.registro_id} sincronizada.`);
  }

  /**
   * Sincroniza un registro de `local_mensaje` con `mensaje` en Supabase.
   *
   * Requisito previo crítico: el `conversacion_id` del mensaje debe existir
   * en Supabase (la conversación se crea server-side). Si no existe aún,
   * el insert fallará con error de FK y el ítem se reintentará.
   *
   * @param item Ítem de la cola con `registro_id` = local_id del mensaje
   */
  private async sincronizarMensaje(item: ColaSync): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    const resultado = await db.query(
      `SELECT * FROM ${DB_TABLES.MENSAJE} WHERE local_id = ?`,
      [item.registro_id]
    );

    const mensaje: LocalMensaje | undefined = resultado.values?.[0];

    if (!mensaje) {
      console.warn(`[SyncService] Mensaje ${item.registro_id} no encontrado en local. Ignorando.`);
      await this.marcarCompletado(item.id!);
      return;
    }

    if (item.operacion === SYNC_OPERACION.INSERT) {
      const { data: serverId, error } = await this.supabaseService.insertMensaje(mensaje);

      if (error || !serverId) {
        throw new Error(`insertMensaje falló: ${error}`);
      }

      await this.actualizarServerId(DB_TABLES.MENSAJE, 'local_id', item.registro_id, serverId);

    } else if (item.operacion === SYNC_OPERACION.UPDATE) {
      if (!mensaje.server_id) {
        throw new Error(`No se puede UPDATE mensaje ${item.registro_id}: server_id es null`);
      }

      const { error } = await this.supabaseService.updateMensaje(mensaje.server_id, mensaje);
      if (error) throw new Error(`updateMensaje falló: ${error}`);

      await this.actualizarSyncStatus(DB_TABLES.MENSAJE, 'local_id', item.registro_id);
    }

    await this.marcarCompletado(item.id!);
    console.log(`[SyncService] ✓ Mensaje ${item.registro_id} (${item.operacion}) sincronizado.`);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MÉTODOS DE ACTUALIZACIÓN DE ESTADO EN cola_sync
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Cambia el status de un ítem de cola a 'en_proceso'.
   *
   * Indica que el ítem está siendo procesado actualmente, evitando procesamiento
   * paralelo en futuras llamadas a procesarCola() antes de que termine.
   *
   * @param colaId ID autoincremental del ítem en cola_sync
   */
  private async marcarEnProceso(colaId: number): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    await db.run(
      `UPDATE ${DB_TABLES.COLA_SYNC}
       SET status = '${SYNC_COLA_STATUS.EN_PROCESO}'
       WHERE id = ?`,
      [colaId]
    );
  }

  /**
   * Marca un ítem de cola como 'completado' tras una sincronización exitosa.
   *
   * Los ítems completados son ignorados en procesarCola() y pueden ser
   * limpiados periódicamente por un proceso de mantenimiento.
   *
   * @param colaId ID autoincremental del ítem en cola_sync
   */
  private async marcarCompletado(colaId: number): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    await db.run(
      `UPDATE ${DB_TABLES.COLA_SYNC}
       SET status = '${SYNC_COLA_STATUS.COMPLETADO}'
       WHERE id = ?`,
      [colaId]
    );
  }

  /**
   * Marca un ítem de cola como 'error' tras un intento fallido.
   *
   * Incrementa el contador de intentos y registra la fecha del último intento
   * para trazabilidad. Si `intentos + 1 >= MAX_REINTENTOS`, el ítem no volverá
   * a procesarse en futuros ciclos (la condición de la query lo excluirá).
   *
   * @param colaId   ID autoincremental del ítem en cola_sync
   * @param intentosPrevios Valor actual del campo `intentos` antes de este fallo
   */
  private async marcarError(colaId: number, intentosPrevios: number): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    await db.run(
      `UPDATE ${DB_TABLES.COLA_SYNC}
       SET status        = '${SYNC_COLA_STATUS.ERROR}',
           intentos      = ?,
           last_attempt  = ?
       WHERE id = ?`,
      [intentosPrevios + 1, ahora, colaId]
    );
  }

  /**
   * Resetea un ítem de cola a 'pendiente' sin incrementar el contador de intentos.
   *
   * Se usa exclusivamente para errores de dependencia transitoria (ej: género aún
   * no sincronizado), donde el fallo no es culpa del ítem sino de un Tier anterior
   * que no completó su sync. Al no gastar un intento, el ítem sobrevive hasta que
   * la dependencia esté disponible.
   *
   * @param colaId ID autoincremental del ítem en cola_sync
   */
  private async marcarPendiente(colaId: number): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    await db.run(
      `UPDATE ${DB_TABLES.COLA_SYNC}
       SET status = '${SYNC_COLA_STATUS.PENDIENTE}'
       WHERE id = ?`,
      [colaId]
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MÉTODOS DE ACTUALIZACIÓN EN TABLAS LOCALES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Guarda el UUID devuelto por Supabase como `server_id` en la tabla local
   * y actualiza el estado de sincronización a 'synced'.
   *
   * Se llama después de un INSERT exitoso en Supabase para enlazar el registro
   * local con su contraparte remota.
   *
   * @param tabla      Nombre de la tabla local (ej: 'local_lista')
   * @param pkCampo    Nombre de la columna PK local (ej: 'local_id' o 'id')
   * @param pkValor    Valor de la PK del registro a actualizar
   * @param serverId   UUID devuelto por Supabase tras el INSERT
   */
  private async actualizarServerId(
    tabla: string,
    pkCampo: string,
    pkValor: string,
    serverId: string
  ): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    await db.run(
      `UPDATE ${tabla}
       SET server_id   = ?,
           sync_status = '${SYNC_STATUS.SYNCED}',
           synced_at   = ?
       WHERE ${pkCampo} = ?`,
      [serverId, ahora, pkValor]
    );
  }

  /**
   * Actualiza únicamente el estado de sincronización de un registro local a
   * 'synced', sin modificar el `server_id` (ya fue asignado en el INSERT).
   *
   * Se llama después de un UPDATE exitoso en Supabase.
   *
   * @param tabla    Nombre de la tabla local
   * @param pkCampo  Nombre de la columna PK local
   * @param pkValor  Valor de la PK del registro a actualizar
   */
  private async actualizarSyncStatus(
    tabla: string,
    pkCampo: string,
    pkValor: string
  ): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    // `local_usuario` usa `synced_at` pero no tiene `server_id` (usa el mismo id)
    // Las demás tablas tienen ambos campos; el SET es idempotente.
    await db.run(
      `UPDATE ${tabla}
       SET sync_status = '${SYNC_STATUS.SYNCED}',
           synced_at   = ?
       WHERE ${pkCampo} = ?`,
      [ahora, pkValor]
    );
  }
}
