/**
 * Modelo de la tabla cola_sync en SQLite.
 *
 * Representa una operación pendiente de replicar al servidor Supabase.
 * Cada vez que el usuario crea, modifica o elimina un registro offline,
 * se encola una entrada aquí. El servicio de sincronización procesará
 * esta cola cuando haya conexión disponible.
 *
 * Corrección respecto al modelo original:
 * - intentos es NOT NULL con DEFAULT 0 para garantizar integridad
 *   en la lógica de reintentos (evitar NULLs que rompan comparaciones).
 */
export interface ColaSync {
  /**
   * ID autoincremental del ítem en la cola.
   * Opcional en la interfaz porque SQLite lo genera automáticamente al insertar.
   */
  id?: number;

  /**
   * Nombre de la tabla afectada por la operación.
   * Ejemplos: 'local_lista', 'local_resena', 'local_mensaje'
   */
  tabla: string;

  /** UUID del registro afectado dentro de su tabla correspondiente */
  registro_id: string;

  /**
   * Tipo de operación DML a replicar al servidor.
   * 'INSERT' | 'UPDATE' | 'DELETE'
   */
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';

  /**
   * Cantidad de intentos de sincronización realizados para este ítem.
   * Comienza en 0. Si supera un máximo configurado, se marca como 'error'.
   */
  intentos: number;

  /**
   * Estado actual del ítem en la cola.
   * 'pendiente' | 'en_proceso' | 'completado' | 'error'
   */
  status: string;

  /** Timestamp ISO 8601 de cuando se encoló la operación */
  created_at: string;

  /**
   * Timestamp ISO 8601 del último intento de sincronización.
   * Null si aún no se ha intentado sincronizar.
   */
  last_attempt?: string | null;
}
