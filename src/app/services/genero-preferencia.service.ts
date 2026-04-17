/**
 * GeneroPreferenciaService — CineMatch
 *
 * Responsabilidad:
 *   Calcular y persistir en SQLite el peso de preferencia de un usuario por cada
 *   género de película, actualizándolo cada vez que el usuario crea una reseña.
 *
 * ─── Algoritmo: Media acumulativa ponderada por posición (Welford) ─────────────
 *
 *  Entrada:
 *    r         — calificación del usuario (1–5 estrellas)
 *    géneros   — lista de géneros de la película en orden TMDB
 *                índice 0 = género principal, índice 1 = secundario, etc.
 *
 *  Paso 1 — Normalización de la calificación:
 *    score = (r - 1) / 4
 *    Convierte la escala 1–5 a un rango continuo [0.0, 1.0]:
 *      r=1 → score=0.00  (muy mala — el usuario no disfruta este género)
 *      r=2 → score=0.25
 *      r=3 → score=0.50  (neutral)
 *      r=4 → score=0.75
 *      r=5 → score=1.00  (excelente — el usuario ama este género)
 *
 *  Paso 2 — Ponderación por posición:
 *    FACTORES = [1.0, 0.5, 0.25, 0.1]
 *    contribucion_i = score × FACTORES[i]
 *    El género principal (i=0) recibe el peso completo (×1.0).
 *    Los géneros secundarios reciben pesos decrecientes.
 *
 *    Ejemplo: película "Acción + Aventura + Ciencia ficción", r=4 → score=0.75
 *      Acción        (i=0): 0.75 × 1.00 = 0.750
 *      Aventura      (i=1): 0.75 × 0.50 = 0.375
 *      Ciencia ficción (i=2): 0.75 × 0.25 = 0.188
 *
 *  Paso 3 — Actualización de peso_pref (fórmula de Welford):
 *    Si es la primera reseña con este género:
 *      peso_pref = contribucion_i
 *      conteo    = 1
 *
 *    Si ya existen reseñas previas (viejo_peso, viejo_conteo):
 *      nuevo_conteo = viejo_conteo + 1
 *      nuevo_peso   = viejo_peso + (contribucion_i - viejo_peso) / nuevo_conteo
 *      conteo       = nuevo_conteo
 *
 *    La fórmula de Welford computa la media aritmética exacta de todas las
 *    contribuciones históricas sin necesitar almacenarlas. Solo se requieren
 *    los valores actuales de peso_pref y conteo.
 *
 * ─── Integración con el sistema offline-first ────────────────────────────────
 *
 *  Cada INSERT o UPDATE en local_usuario_genero_preferencia se encola en
 *  cola_sync para replicarse a Supabase cuando haya conectividad.
 *  El procesamiento de la cola sigue el orden FK-safe de SyncService
 *  (PREF_GENERO se procesa en Tier 2, después de usuario y pelicula).
 *
 */

import { Injectable } from '@angular/core';
import { DatabaseService } from '../../database/services/database.service';
import { ColaService } from './cola.service';
import { DB_TABLES, SYNC_OPERACION } from '../../database/database.constants';
import { GeneroJson } from '../../database/models/local-pelicula.model';
import { LocalUsuarioGeneroPreferencia } from '../../database/models/local-usuario-genero-preferencia.model';

// ─── Constantes del algoritmo ─────────────────────────────────────────────────

/**
 * Factores de ponderación según la posición del género en la lista TMDB.
 *
 * Índice 0 (género principal): contribución completa (×1.0).
 * Índices posteriores: contribución decreciente para evitar que géneros
 * secundarios dominen las preferencias cuando la película tiene muchos géneros.
 */
const FACTORES_POSICION: readonly number[] = [1.0, 0.5, 0.25, 0.1];

/**
 * Factor mínimo aplicado a géneros en posición > 3.
 * Evita ignorar géneros adicionales sin darles un peso excesivo.
 */
const FACTOR_MINIMO = 0.1;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class GeneroPreferenciaService {

  constructor(
    private databaseService: DatabaseService,
    private colaService: ColaService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════════
  // MÉTODO PÚBLICO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Actualiza los pesos de preferencia de género del usuario tras guardar una reseña.
   *
   * Lee los géneros de la película desde SQLite, calcula la contribución de esta
   * reseña para cada género y actualiza (o inserta) los registros correspondientes
   * en `local_usuario_genero_preferencia`.
   *
   * Debe llamarse desde CrearResenaPage.guardar() de forma fire-and-forget:
   *   this.generoPreferenciaService
   *     .actualizarPreferencias(usuarioId, peliculaLocalId, calificacion)
   *     .catch(err => console.warn(...));
   *
   * El patrón fire-and-forget garantiza que un error aquí no bloquee la
   * navegación de vuelta al detalle de la película.
   *
   * @param usuarioId       UUID local del usuario que creó la reseña
   * @param peliculaLocalId UUID local de la película reseñada
   * @param calificacion    Calificación dada (1–5 estrellas)
   */
  async actualizarPreferencias(
    usuarioId: string,
    peliculaLocalId: string,
    calificacion: number,
  ): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    // ── 1. Leer géneros de la película desde local_pelicula ───────────────────
    const pelRes = await db.query(
      `SELECT generos_json FROM ${DB_TABLES.PELICULA} WHERE id = ?`,
      [peliculaLocalId]
    );

    const generoJson: string | null = pelRes.values?.[0]?.generos_json ?? null;

    if (!generoJson) {
      // La película no tiene géneros registrados — no hay preferencias que actualizar.
      // Puede ocurrir si la película se guardó antes de que TMDB devolviera géneros.
      console.warn(
        `[GeneroPreferenciaService] Sin géneros para película ${peliculaLocalId}. ` +
        'No se actualizan preferencias.'
      );
      return;
    }

    let generos: GeneroJson[];
    try {
      generos = JSON.parse(generoJson) as GeneroJson[];
    } catch {
      console.warn('[GeneroPreferenciaService] generos_json malformado:', generoJson);
      return;
    }

    if (!generos || generos.length === 0) {
      return;
    }

    // ── 2. Calcular score normalizado ─────────────────────────────────────────
    // Convierte la calificación 1–5 a un valor continuo en [0.0, 1.0].
    // r=1 → 0.0 (no le gustó)  |  r=3 → 0.5 (neutral)  |  r=5 → 1.0 (le encantó)
    const score = (calificacion - 1) / 4;

    // ── 3. Procesar cada género ───────────────────────────────────────────────
    // Se procesan en orden secuencial para preservar la atomicidad de cada upsert.
    for (let i = 0; i < generos.length; i++) {
      const genero = generos[i];
      // Factor posicional: 1.0 para primario, 0.5 para secundario, etc.
      const factor = FACTORES_POSICION[i] ?? FACTOR_MINIMO;
      // Contribución de esta reseña al peso del género
      const contribucion = score * factor;

      await this._upsertPreferencia(db, usuarioId, genero, contribucion);
    }

    console.log(
      `[GeneroPreferenciaService] Preferencias actualizadas — usuario: ${usuarioId}, ` +
      `géneros: ${generos.length}, score: ${score.toFixed(3)}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MÉTODO PRIVADO — LÓGICA DE UPSERT POR GÉNERO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta o actualiza el registro de preferencia para un género específico.
   *
   * Decisión de diseño: se usa SELECT + INSERT/UPDATE explícito en lugar de
   * INSERT OR REPLACE, porque OR REPLACE elimina y re-inserta la fila cambiando
   * el `id`, lo que invalidaría las entradas ya encoladas en cola_sync que
   * apuntan al id anterior.
   *
   * @param db          Conexión SQLite activa
   * @param usuarioId   UUID local del usuario
   * @param genero      Objeto con id TMDB y nombre del género
   * @param contribucion Aporte calculado para este género en esta reseña [0.0, 1.0]
   */
  private async _upsertPreferencia(
    db: any,
    usuarioId: string,
    genero: GeneroJson,
    contribucion: number,
  ): Promise<void> {

    // Verificar si ya existe un registro para (usuario, género)
    const existeRes = await db.query(
      `SELECT id, peso_pref, conteo
       FROM ${DB_TABLES.PREF_GENERO}
       WHERE usuario_id = ? AND tmdb_genero_id = ?`,
      [usuarioId, genero.id]
    );

    const existente: LocalUsuarioGeneroPreferencia | undefined = existeRes.values?.[0];

    if (!existente) {
      // ── Primera reseña para este género: INSERT ──────────────────────────────
      // peso_pref se inicializa directamente con la contribución (conteo = 1).
      const nuevoId = crypto.randomUUID();
      const ahora = new Date().toISOString();

      await db.run(
        `INSERT INTO ${DB_TABLES.PREF_GENERO}
           (id, usuario_id, tmdb_genero_id, nombre_genero,
            peso_pref, conteo, sync_status, synced_at, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 'pending', NULL, ?)`,
        [nuevoId, usuarioId, genero.id, genero.nombre, contribucion, ahora]
      );

      // Encolar para sincronizar con Supabase
      await this.colaService.encolar(DB_TABLES.PREF_GENERO, nuevoId, SYNC_OPERACION.INSERT);

    } else {
      // ── Reseñas posteriores: UPDATE con fórmula de Welford ───────────────────
      //
      // Media acumulativa (Welford):
      //   M_n = M_(n-1) + (x - M_(n-1)) / n
      //
      // Donde M_(n-1) = peso_pref actual, x = contribucion, n = nuevo_conteo.
      // Esta fórmula es numéricamente estable y equivale al promedio aritmético
      // de todas las contribuciones, sin necesidad de almacenar el historial.
      const nuevoConteo = existente.conteo + 1;
      const nuevoPeso   = existente.peso_pref + (contribucion - existente.peso_pref) / nuevoConteo;

      await db.run(
        `UPDATE ${DB_TABLES.PREF_GENERO}
         SET peso_pref   = ?,
             conteo      = ?,
             sync_status = 'pending',
             synced_at   = NULL
         WHERE id = ?`,
        [nuevoPeso, nuevoConteo, existente.id]
      );

      // Encolar UPDATE para sincronizar el valor actualizado con Supabase
      await this.colaService.encolar(DB_TABLES.PREF_GENERO, existente.id, SYNC_OPERACION.UPDATE);
    }
  }
}
