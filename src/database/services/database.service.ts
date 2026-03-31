import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

import { DB_NAME, DB_VERSION } from '../database.constants';

/**
 * Servicio principal de base de datos local para CineMatch.
 *
 * Responsabilidades:
 *  - Inicializar el plugin @capacitor-community/sqlite
 *  - Detectar la plataforma (web vs Android/iOS) y aplicar la configuración correcta
 *  - Abrir y gestionar la conexión a la BD SQLite local
 *  - Crear todas las tablas al primer inicio (DDL idempotente con CREATE TABLE IF NOT EXISTS)
 *  - Exponer la conexión activa para que servicios CRUD puedan usarla
 *
 * NO contiene lógica de sincronización con Supabase ni operaciones CRUD.
 * Esas responsabilidades se implementarán en servicios separados por entidad.
 *
 * Uso:
 *   En AppComponent.ngOnInit() llamar: await this.databaseService.inicializar();
 *   En otros servicios llamar: this.databaseService.obtenerConexion();
 */
@Injectable({
  providedIn: 'root', // Singleton automático — no requiere registrarlo en AppModule
})
export class DatabaseService {

  /** Instancia compartida de la conexión SQLite del plugin Capacitor */
  private sqliteConnection: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);

  /** Instancia activa de la conexión a la base de datos cinematch_local */
  private db!: SQLiteDBConnection;

  /** Bandera para evitar inicializaciones duplicadas en la misma sesión */
  private inicializado = false;

  constructor(private platform: Platform) {}

  /**
   * Inicializa la base de datos local.
   *
   * Debe invocarse una sola vez al arrancar la aplicación, desde AppComponent.ngOnInit().
   * Las llamadas subsiguientes se ignoran gracias a la bandera `inicializado`.
   *
   * Flujo:
   *  1. Espera a que la plataforma Capacitor esté lista
   *  2. En web: inicializa el web component jeep-sqlite
   *  3. Abre o recupera la conexión a la BD
   *  4. Ejecuta el DDL de creación de tablas
   */
  async inicializar(): Promise<void> {
    // Evitar inicializaciones duplicadas
    if (this.inicializado) {
      return;
    }

    // Esperar a que Capacitor y los plugins nativos estén disponibles
    await this.platform.ready();

    // En plataforma web (desarrollo con ng serve o PWA), se necesita
    // el web component jeep-sqlite como polyfill de SQLite en el navegador.
    // En Android/iOS se usa la SQLite nativa a través del bridge de Capacitor.
    if (!this.platform.is('hybrid')) {
      await this.inicializarWeb();
    }

    // Abrir la conexión a la BD (la crea si no existe)
    await this.abrirConexion();

    // Crear todas las tablas con CREATE TABLE IF NOT EXISTS (idempotente)
    await this.crearTablas();

    this.inicializado = true;
    console.log('[DatabaseService] Base de datos local inicializada correctamente.');
  }

  /**
   * Inicialización específica para plataforma web.
   *
   * El web component <jeep-sqlite> (definido en index.html) actúa como
   * polyfill de SQLite en el navegador usando sql.js (WebAssembly).
   * Este método espera a que el custom element esté registrado antes de continuar.
   *
   * Requisito: <jeep-sqlite></jeep-sqlite> debe estar en src/index.html
   * y jeepSqlite(window) debe llamarse en src/main.ts antes del bootstrap.
   */
  private async inicializarWeb(): Promise<void> {
    // Verificar que el custom element esté presente en el DOM
    const jeepEl = document.querySelector('jeep-sqlite');
    if (!jeepEl) {
      console.warn(
        '[DatabaseService] El elemento <jeep-sqlite> no está en el DOM. ' +
        'Asegúrate de incluirlo en src/index.html.'
      );
    }

    // Esperar a que el custom element esté completamente definido
    await customElements.whenDefined('jeep-sqlite');

    // Inicializar el almacenamiento interno de jeep-sqlite (IndexedDB en el navegador)
    await CapacitorSQLite.initWebStore();

    console.log('[DatabaseService] Web store de jeep-sqlite inicializado.');
  }

  /**
   * Abre la conexión a la base de datos SQLite.
   *
   * Si la BD no existe en el dispositivo, SQLite la crea automáticamente.
   * Si ya existe una conexión abierta, la recupera en lugar de crear una nueva.
   *
   * @throws Error si el plugin no puede abrir la conexión
   */
  private async abrirConexion(): Promise<void> {
    // Verificar consistencia de conexiones para evitar conflictos
    const consistencia = await this.sqliteConnection.checkConnectionsConsistency();
    const existeConexion = await this.sqliteConnection.isConnection(DB_NAME, false);

    if (consistencia.result && existeConexion.result) {
      // Recuperar una conexión existente (ej: después de reanudar la app)
      this.db = await this.sqliteConnection.retrieveConnection(DB_NAME, false);
    } else {
      // Crear una nueva conexión a la BD
      this.db = await this.sqliteConnection.createConnection(
        DB_NAME,          // Nombre del archivo SQLite
        false,            // Sin cifrado (encryption: false)
        'no-encryption',  // Modo de cifrado
        DB_VERSION,       // Versión del esquema
        false             // Solo lectura: false (modo lectura/escritura)
      );
    }

    // Abrir físicamente la conexión
    await this.db.open();
    console.log(`[DatabaseService] Conexión abierta: ${DB_NAME} v${DB_VERSION}`);
  }

  /**
   * Ejecuta el DDL de creación de todas las tablas de la BD local.
   *
   * Usa CREATE TABLE IF NOT EXISTS para que sea idempotente:
   * si las tablas ya existen (en sesiones posteriores), no falla.
   *
   * El esquema completo también está documentado en:
   *   src/database/schema/cinematch.sql
   */
  private async crearTablas(): Promise<void> {
    const ddl = `
      -- Habilitar modo WAL para mejor rendimiento en lecturas/escrituras concurrentes
      PRAGMA journal_mode = WAL;

      -- Activar validación de claves foráneas (desactivado por defecto en SQLite)
      PRAGMA foreign_keys = ON;

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_usuario
      -- Caché del perfil del usuario autenticado.
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_usuario (
        id               TEXT NOT NULL PRIMARY KEY,
        nombre_user      TEXT,
        nombre           TEXT,
        apellido_1       TEXT,
        apellido_2       TEXT,
        email            TEXT,
        avatar_url       TEXT,
        bio              TEXT,
        radio_conex      INTEGER,
        busqueda_abierta TEXT CHECK(busqueda_abierta IN ('S','N')),
        sync_status      TEXT NOT NULL DEFAULT 'synced',
        synced_at        TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_pelicula
      -- Caché de películas. Géneros desnormalizados en JSON.
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_pelicula (
        id              TEXT NOT NULL PRIMARY KEY,
        tmdb_id         INTEGER UNIQUE,
        titulo          TEXT NOT NULL,
        sinopsis        TEXT,
        poster_url      TEXT,
        fecha_estreno   TEXT,
        duracion_min    INTEGER,
        promedio_votos  REAL,
        generos_json    TEXT,
        synced_at       TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_conversacion
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_conversacion (
        id          TEXT NOT NULL PRIMARY KEY,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        synced_at   TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_lista
      -- Lista personal de películas. Incluye fecha_visto (mejora sobre el modelo original).
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_lista (
        local_id    TEXT NOT NULL PRIMARY KEY,
        server_id   TEXT,
        usuario_id  TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
        pelicula_id TEXT NOT NULL REFERENCES local_pelicula(id) ON DELETE CASCADE,
        estado      TEXT NOT NULL,
        fecha_visto TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at  TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_resena
      -- Reseñas escritas por el usuario sobre películas.
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_resena (
        local_id      TEXT NOT NULL PRIMARY KEY,
        server_id     TEXT,
        usuario_id    TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
        pelicula_id   TEXT NOT NULL REFERENCES local_pelicula(id) ON DELETE CASCADE,
        calificacion  INTEGER NOT NULL CHECK(calificacion BETWEEN 1 AND 10),
        comentario    TEXT,
        tiene_spoiler TEXT NOT NULL DEFAULT 'N' CHECK(tiene_spoiler IN ('S','N')),
        sync_status   TEXT NOT NULL DEFAULT 'pending',
        created_at    TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: local_mensaje
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_mensaje (
        local_id        TEXT NOT NULL PRIMARY KEY,
        server_id       TEXT,
        emisor_id       TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
        conversacion_id TEXT NOT NULL REFERENCES local_conversacion(id) ON DELETE CASCADE,
        contenido       TEXT NOT NULL,
        leido           TEXT NOT NULL DEFAULT 'N' CHECK(leido IN ('S','N')),
        sync_status     TEXT NOT NULL DEFAULT 'pending',
        created_at      TEXT NOT NULL
      );

      -- ─────────────────────────────────────────────────────────
      -- Tabla: cola_sync
      -- Cola de operaciones offline pendientes de enviar a Supabase.
      -- CORRECCIÓN: intentos es NOT NULL DEFAULT 0.
      -- ─────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cola_sync (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        tabla        TEXT    NOT NULL,
        registro_id  TEXT    NOT NULL,
        operacion    TEXT    NOT NULL CHECK(operacion IN ('INSERT','UPDATE','DELETE')),
        intentos     INTEGER NOT NULL DEFAULT 0,
        status       TEXT    NOT NULL DEFAULT 'pendiente',
        created_at   TEXT    NOT NULL,
        last_attempt TEXT
      );

      -- ─────────────────────────────────────────────────────────
      -- Índices para optimizar consultas frecuentes
      -- ─────────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_lista_usuario   ON local_lista(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_lista_pelicula  ON local_lista(pelicula_id);
      CREATE INDEX IF NOT EXISTS idx_resena_usuario  ON local_resena(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_resena_pelicula ON local_resena(pelicula_id);
      CREATE INDEX IF NOT EXISTS idx_mensaje_conv    ON local_mensaje(conversacion_id);
      CREATE INDEX IF NOT EXISTS idx_cola_status     ON cola_sync(status);
      CREATE INDEX IF NOT EXISTS idx_cola_tabla      ON cola_sync(tabla);
    `;

    // Ejecutar el DDL completo como una sola transacción
    await this.db.execute(ddl, false);
    console.log('[DatabaseService] Tablas creadas o verificadas correctamente.');
  }

  /**
   * Retorna la conexión activa a la BD para que otros servicios puedan usarla.
   *
   * Ejemplo de uso en un servicio CRUD:
   *   const db = this.databaseService.obtenerConexion();
   *   await db.query('SELECT * FROM local_pelicula');
   *
   * @returns La instancia SQLiteDBConnection activa
   * @throws Error si se llama antes de invocar inicializar()
   */
  obtenerConexion(): SQLiteDBConnection {
    if (!this.db) {
      throw new Error(
        '[DatabaseService] La base de datos no ha sido inicializada. ' +
        'Invoca inicializar() desde AppComponent.ngOnInit() primero.'
      );
    }
    return this.db;
  }

  /**
   * Cierra la conexión activa a la BD.
   *
   * Se recomienda llamar en el evento de pausa de la aplicación
   * para liberar recursos del sistema operativo.
   *
   * Ejemplo en AppComponent:
   *   App.addListener('appStateChange', ({ isActive }) => {
   *     if (!isActive) this.databaseService.cerrarConexion();
   *   });
   */
  async cerrarConexion(): Promise<void> {
    if (this.db) {
      await this.db.close();
      await this.sqliteConnection.closeConnection(DB_NAME, false);
      this.inicializado = false;
      console.log('[DatabaseService] Conexión cerrada.');
    }
  }
}
