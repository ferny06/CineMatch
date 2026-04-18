-- ============================================================
-- CineMatch — Esquema de Base de Datos Local (SQLite)
-- Versión: 4
--
-- Propósito:
--   Este archivo es la documentación de referencia del esquema SQLite local.
--   El DDL se ejecuta en runtime desde DatabaseService.crearTablas().
--   Mantener este archivo sincronizado con el string DDL del servicio.
--
-- Convenciones:
--   - IDs: TEXT (UUID v4 generado con crypto.randomUUID() en el cliente)
--   - Fechas: TEXT en formato ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
--   - Booleanos: TEXT con CHECK IN ('S','N') — SQLite no tiene tipo booleano
--   - server_id: UUID del servidor, NULL hasta que se sincronice el registro
--
-- Relación con la BD central (Supabase):
--   local_usuario    ←→ usuario
--   local_pelicula   ←→ pelicula
--   local_conversacion              ←→ conversacion
--   local_lista                     ←→ lista_peliculas
--   local_resena                    ←→ resena
--   local_mensaje                   ←→ mensaje
--   local_usuario_genero_preferencia ←→ usuario_genero_preferencia  [v4]
--   cola_sync                       → (tabla de control, sin espejo en el servidor)
--
-- Correcciones aplicadas al modelo original:
--   1. Se agrega local_conversacion para dar integridad referencial a local_mensaje
--   2. Se agrega fecha_visto en local_lista (campo presente en la central)
--   3. cola_sync.intentos es NOT NULL DEFAULT 0 (era nullable en el original)
-- ============================================================

-- Habilitar modo WAL (Write-Ahead Logging):
-- Mejora el rendimiento permitiendo lecturas concurrentes durante escrituras.
PRAGMA journal_mode = WAL;

-- Activar validación de claves foráneas:
-- SQLite las desactiva por defecto; necesario para ON DELETE CASCADE.
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_usuario
-- Caché local del perfil del usuario autenticado.
--
-- Campos omitidos intencionalmente respecto a la tabla central:
--   - auth_user_id : gestionado por Supabase Auth (no se persiste localmente)
--   - fecha_nacimiento, genero : no requeridos offline
--   - latitud, longitud : datos de tiempo real; se obtienen del GPS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_usuario (
  id               TEXT NOT NULL PRIMARY KEY,        -- UUID espejo del id en Supabase
  nombre_user      TEXT,                             -- Nombre de usuario público
  nombre           TEXT,                             -- Nombre real
  apellido_1       TEXT,                             -- Primer apellido
  apellido_2       TEXT,                             -- Segundo apellido
  email            TEXT,                             -- Correo electrónico
  avatar_url       TEXT,                             -- URL del avatar (Supabase Storage)
  bio              TEXT,                             -- Biografía corta
  radio_conex      INTEGER,                          -- Radio de búsqueda en km
  busqueda_abierta TEXT CHECK(busqueda_abierta IN ('S','N')),  -- Acepta conexiones: S/N
  sync_status      TEXT NOT NULL DEFAULT 'synced',  -- Estado: pending/synced/error
  synced_at        TEXT NOT NULL                     -- Última sincronización ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_pelicula
-- Caché local de películas consultadas desde Supabase o TMDB.
-- Los géneros se desnormalizan en JSON para evitar JOINs offline.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_pelicula (
  id              TEXT NOT NULL PRIMARY KEY,         -- UUID espejo del id en Supabase
  tmdb_id         INTEGER UNIQUE,                    -- ID en The Movie Database
  titulo          TEXT NOT NULL,                     -- Título oficial
  sinopsis        TEXT,                              -- Descripción argumental
  poster_url      TEXT,                              -- URL del póster
  fecha_estreno   TEXT,                              -- Fecha YYYY-MM-DD
  duracion_min    INTEGER,                           -- Duración en minutos
  promedio_votos  REAL,                              -- Promedio 0.0–10.0
  generos_json    TEXT,                              -- JSON: [{"id":28,"nombre":"Acción"}]
  synced_at       TEXT NOT NULL                      -- Última sincronización ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_conversacion  [CORRECCIÓN — no estaba en el modelo original]
-- Tabla mínima para dar integridad referencial a local_mensaje.
-- Sin esta tabla, conversacion_id en local_mensaje sería una cadena libre.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_conversacion (
  id          TEXT NOT NULL PRIMARY KEY,             -- UUID espejo del id en Supabase
  sync_status TEXT NOT NULL DEFAULT 'synced',        -- Estado: pending/synced/error
  synced_at   TEXT NOT NULL                          -- Última sincronización ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_lista
-- Colección nombrada de películas creada por el usuario.
-- Un registro = una lista completa (tipo playlist), con array de tmdb_ids.
-- ↔ lista_peliculas en Supabase (pelicula_id INTEGER[]).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_lista (
  local_id      TEXT NOT NULL PRIMARY KEY,           -- UUID generado localmente
  server_id     TEXT,                                -- UUID Supabase (null hasta sync)
  usuario_id    TEXT NOT NULL                        -- FK → local_usuario
    REFERENCES local_usuario(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,                       -- Nombre de la lista
  descripcion   TEXT,                                -- Descripción opcional
  peliculas_ids TEXT NOT NULL DEFAULT '[]',          -- JSON array de tmdb_ids
  estado        TEXT NOT NULL DEFAULT 'activa'       -- 'activa' | 'borrada' (soft delete)
    CHECK(estado IN ('activa','borrada')),
  sync_status   TEXT NOT NULL DEFAULT 'pending',     -- Estado: pending/synced/error
  synced_at     TEXT,                                -- Última sync ISO 8601 (null si nunca)
  created_at    TEXT NOT NULL                        -- Creación local ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_resena
-- Reseñas escritas por el usuario sobre películas vistas.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_resena (
  local_id      TEXT NOT NULL PRIMARY KEY,           -- UUID generado localmente
  server_id     TEXT,                                -- UUID Supabase (null hasta sync)
  usuario_id    TEXT NOT NULL                        -- FK → local_usuario
    REFERENCES local_usuario(id) ON DELETE CASCADE,
  pelicula_id   TEXT NOT NULL                        -- FK → local_pelicula
    REFERENCES local_pelicula(id) ON DELETE CASCADE,
  calificacion  INTEGER NOT NULL                     -- Puntuación 1–10
    CHECK(calificacion BETWEEN 1 AND 10),
  comentario    TEXT,                                -- Texto de la reseña (opcional)
  tiene_spoiler TEXT NOT NULL DEFAULT 'N'            -- 'S' = spoiler | 'N' = sin spoiler
    CHECK(tiene_spoiler IN ('S','N')),
  sync_status   TEXT NOT NULL DEFAULT 'pending',     -- Estado: pending/synced/error
  created_at    TEXT NOT NULL                        -- Creación local ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_mensaje
-- Mensajes de conversaciones entre usuarios.
-- CORRECCIÓN: conversacion_id tiene FK hacia local_conversacion.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_mensaje (
  local_id        TEXT NOT NULL PRIMARY KEY,         -- UUID generado localmente
  server_id       TEXT,                              -- UUID Supabase (null hasta sync)
  emisor_id       TEXT NOT NULL                      -- FK → local_usuario (quien envía)
    REFERENCES local_usuario(id) ON DELETE CASCADE,
  conversacion_id TEXT NOT NULL                      -- FK → local_conversacion
    REFERENCES local_conversacion(id) ON DELETE CASCADE,
  contenido       TEXT NOT NULL,                     -- Texto del mensaje
  leido           TEXT NOT NULL DEFAULT 'N'          -- 'S' = leído | 'N' = no leído
    CHECK(leido IN ('S','N')),
  sync_status     TEXT NOT NULL DEFAULT 'pending',   -- Estado: pending/synced/error
  created_at      TEXT NOT NULL                      -- Creación local ISO 8601
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: cola_sync
-- Cola de operaciones offline pendientes de replicar a Supabase.
-- CORRECCIÓN: intentos es NOT NULL DEFAULT 0 (era nullable en el original).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cola_sync (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,    -- ID autoincremental
  tabla        TEXT    NOT NULL,                     -- Tabla afectada (ej: 'local_lista')
  registro_id  TEXT    NOT NULL,                     -- UUID del registro afectado
  operacion    TEXT    NOT NULL                      -- Tipo de operación DML
    CHECK(operacion IN ('INSERT','UPDATE','DELETE')),
  intentos     INTEGER NOT NULL DEFAULT 0,           -- Cantidad de intentos realizados
  status       TEXT    NOT NULL DEFAULT 'pendiente', -- 'pendiente'|'en_proceso'|'completado'|'error'
  created_at   TEXT    NOT NULL,                     -- Encolado en ISO 8601
  last_attempt TEXT                                  -- Último intento ISO 8601 (null si ninguno)
);

-- ─────────────────────────────────────────────────────────────────
-- Tabla: local_usuario_genero_preferencia  [v4 — nuevo]
-- Peso de preferencia del usuario por cada género de película.
--
-- Algoritmo:
--   Cada vez que el usuario crea una reseña con calificación r (1–5),
--   se calcula un score normalizado (r-1)/4 ∈ [0.0, 1.0] y se pondera
--   por la posición del género en la lista TMDB:
--     posición 0 (principal): ×1.0
--     posición 1:             ×0.5
--     posición 2:             ×0.25
--     posición ≥3:            ×0.1
--   El peso acumulado se actualiza con la fórmula de Welford:
--     nuevo_peso = viejo_peso + (contribucion - viejo_peso) / nuevo_conteo
--
-- La restricción UNIQUE(usuario_id, tmdb_genero_id) garantiza un único
-- registro de peso por par (usuario, género).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_usuario_genero_preferencia (
  id             TEXT    NOT NULL PRIMARY KEY,       -- UUID generado localmente
  usuario_id     TEXT    NOT NULL                    -- FK → local_usuario
    REFERENCES local_usuario(id) ON DELETE CASCADE,
  tmdb_genero_id INTEGER NOT NULL,                  -- ID del género en TMDB
  nombre_genero  TEXT    NOT NULL,                  -- Nombre desnormalizado (ej: "Acción")
  peso_pref      REAL    NOT NULL DEFAULT 0.0,      -- Peso acumulado [0.0, 1.0]
  conteo         INTEGER NOT NULL DEFAULT 0,        -- Número de reseñas que contribuyeron
  sync_status    TEXT    NOT NULL DEFAULT 'pending',-- Estado: pending/synced/error
  synced_at      TEXT,                              -- Última sync ISO 8601 (null si nunca)
  created_at     TEXT    NOT NULL,                  -- Creación local ISO 8601 → fecha_creacion_pref en Supabase
  UNIQUE(usuario_id, tmdb_genero_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Índices — optimizan las consultas más frecuentes de la app
-- ─────────────────────────────────────────────────────────────────

-- Listas de un usuario específico
CREATE INDEX IF NOT EXISTS idx_lista_usuario   ON local_lista(usuario_id);
-- Reseñas escritas por un usuario
CREATE INDEX IF NOT EXISTS idx_resena_usuario  ON local_resena(usuario_id);
-- Reseñas de una película específica
CREATE INDEX IF NOT EXISTS idx_resena_pelicula ON local_resena(pelicula_id);
-- Mensajes de una conversación específica
CREATE INDEX IF NOT EXISTS idx_mensaje_conv    ON local_mensaje(conversacion_id);
-- Ítems de la cola filtrados por estado (pendiente/error)
CREATE INDEX IF NOT EXISTS idx_cola_status     ON cola_sync(status);
-- Ítems de la cola filtrados por tabla (para procesar por entidad)
CREATE INDEX IF NOT EXISTS idx_cola_tabla      ON cola_sync(tabla);
-- Preferencias de género de un usuario (para cargar su perfil de gustos)
CREATE INDEX IF NOT EXISTS idx_pref_genero_usuario ON local_usuario_genero_preferencia(usuario_id);
-- Usuarios con preferencia por un género específico (para recomendaciones)
CREATE INDEX IF NOT EXISTS idx_pref_genero_tmdb    ON local_usuario_genero_preferencia(tmdb_genero_id);
