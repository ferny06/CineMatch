/**
 * Constantes globales para la base de datos local de CineMatch.
 *
 * Centraliza los literales de configuración de la BD SQLite local:
 * nombre del archivo, versión del esquema y nombres de cada tabla.
 * Al requerir una migración, solo se incrementa DB_VERSION aquí.
 */

/** Nombre del archivo de la base de datos SQLite en el dispositivo */
export const DB_NAME = 'cinematch_local';

/**
 * Versión del esquema de la base de datos.
 * Incrementar este número cuando se realicen cambios estructurales (migraciones).
 *
 * v1 → v2: Se agregan columnas `fecha_nacimiento` y `genero` a `local_usuario`.
 *          Ambas son NOT NULL en Supabase y se recopilan durante el registro.
 * v2 → v3: Se agrega columna `auth_user_id` a `local_usuario`.
 *          Es el UUID de Supabase Auth, NOT NULL en la tabla central `usuario`.
 * v3 → v4: Se agrega tabla `local_pelicula_vista` para registrar películas vistas.
 *
 * Nota: la tabla `local_usuario_genero_preferencia` se agregó sin bump de versión
 * porque usa CREATE TABLE IF NOT EXISTS (idempotente) y el proyecto no registra
 * addUpgradeStatement. Subir DB_VERSION sin upgrade statements provoca que
 * @capacitor-community/sqlite llame a onUpgrade vacío, lo que puede destruir datos.
 */
export const DB_VERSION = 4;

/** Nombres de las tablas de la base de datos local */
export const DB_TABLES = {
  /** Caché del perfil del usuario autenticado */
  USUARIO:        'local_usuario',
  /** Caché de películas consultadas */
  PELICULA:       'local_pelicula',
  /** Tabla mínima de conversaciones para integridad referencial */
  CONVERSACION:   'local_conversacion',
  /** Lista personal de películas del usuario */
  LISTA:          'local_lista',
  /** Reseñas escritas offline por el usuario */
  RESENA:         'local_resena',
  /** Mensajes intercambiados en conversaciones */
  MENSAJE:        'local_mensaje',
  /** Cola de operaciones pendientes de sincronizar con Supabase */
  COLA_SYNC:      'cola_sync',
  /** Preferencias de género del usuario, calculadas por media ponderada en cada reseña */
  PREF_GENERO:    'local_usuario_genero_preferencia',
  /** Historial de películas marcadas como vistas por el usuario */
  PELICULA_VISTA: 'local_pelicula_vista',
  /** Ranking global de películas calculado a partir de reseñas de todos los usuarios */
  RANKING_PELICULA: 'local_ranking_pelicula',
} as const;

/**
 * Valores válidos para el campo sync_status en las tablas locales.
 * - PENDING:  el registro fue creado/modificado offline y aún no se envió al servidor
 * - SYNCED:   el registro está sincronizado con el servidor
 * - ERROR:    el último intento de sincronización falló
 */
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED:  'synced',
  ERROR:   'error',
} as const;

/**
 * Valores válidos para el campo operacion en cola_sync.
 * Representan el tipo de operación DML que se debe replicar al servidor.
 */
export const SYNC_OPERACION = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;

/**
 * Valores válidos para el campo status en cola_sync.
 * Representan el estado actual del ítem en la cola de sincronización.
 */
export const SYNC_COLA_STATUS = {
  /** El ítem está esperando ser procesado */
  PENDIENTE:  'pendiente',
  /** El ítem está siendo procesado actualmente */
  EN_PROCESO: 'en_proceso',
  /** El ítem fue sincronizado exitosamente */
  COMPLETADO: 'completado',
  /** El último intento de sincronización del ítem falló */
  ERROR:      'error',
} as const;
