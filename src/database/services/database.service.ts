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

  async inicializar(): Promise<void> {
    if (this.inicializado) {
      return;
    }

    await this.platform.ready();
    await this.abrirConexion();
    await this.crearTablas();

    this.inicializado = true;
    console.log('[DatabaseService] Base de datos local inicializada correctamente.');
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
   */
  private async crearTablas(): Promise<void> {
    // En Android, execute() usa execSQL() internamente, que no soporta PRAGMA
    // (retornan valores) ni múltiples statements encadenados de forma confiable.
    // Solución: PRAGMAs via query(), tablas e índices via executeSet() individual.

    // Activar WAL y foreign keys — deben ir como queries separadas
    await this.db.query('PRAGMA journal_mode = WAL;');
    await this.db.query('PRAGMA foreign_keys = ON;');

    // DDL individual por tabla/índice — executeSet garantiza el orden correcto
    // y evita el error "Queries can be performed using rawQuery methods only"
    await this.db.executeSet([
      {
        statement: `CREATE TABLE IF NOT EXISTS local_usuario (
          id               TEXT NOT NULL PRIMARY KEY,
          nombre_user      TEXT,
          nombre           TEXT,
          apellido_1       TEXT,
          apellido_2       TEXT,
          email            TEXT,
          auth_user_id     TEXT,
          fecha_nacimiento TEXT,
          genero           TEXT,
          avatar_url       TEXT,
          bio              TEXT,
          radio_conex      INTEGER,
          busqueda_abierta TEXT CHECK(busqueda_abierta IN ('S','N')),
          sync_status      TEXT NOT NULL DEFAULT 'synced',
          synced_at        TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS local_pelicula (
          id               TEXT NOT NULL PRIMARY KEY,
          tmdb_id          INTEGER UNIQUE,
          titulo           TEXT NOT NULL,
          sinopsis         TEXT,
          poster_url       TEXT,
          fecha_estreno    TEXT,
          duracion_min     INTEGER,
          promedio_votos   REAL,
          idioma_original  TEXT,
          generos_json     TEXT,
          synced_at        TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS local_conversacion (
          id          TEXT NOT NULL PRIMARY KEY,
          sync_status TEXT NOT NULL DEFAULT 'synced',
          synced_at   TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS local_lista (
          local_id      TEXT NOT NULL PRIMARY KEY,
          server_id     TEXT,
          usuario_id    TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
          nombre        TEXT NOT NULL,
          descripcion   TEXT,
          peliculas_ids TEXT NOT NULL DEFAULT '[]',
          estado        TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa','borrada')),
          sync_status   TEXT NOT NULL DEFAULT 'pending',
          synced_at     TEXT,
          created_at    TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS local_resena (
          local_id      TEXT NOT NULL PRIMARY KEY,
          server_id     TEXT,
          usuario_id    TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
          pelicula_id   TEXT NOT NULL REFERENCES local_pelicula(id) ON DELETE CASCADE,
          calificacion  INTEGER NOT NULL CHECK(calificacion BETWEEN 1 AND 10),
          comentario    TEXT,
          tiene_spoiler TEXT NOT NULL DEFAULT 'N' CHECK(tiene_spoiler IN ('S','N')),
          sync_status   TEXT NOT NULL DEFAULT 'pending',
          synced_at     TEXT,
          created_at    TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS local_mensaje (
          local_id        TEXT NOT NULL PRIMARY KEY,
          server_id       TEXT,
          emisor_id       TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
          conversacion_id TEXT NOT NULL REFERENCES local_conversacion(id) ON DELETE CASCADE,
          contenido       TEXT NOT NULL,
          leido           TEXT NOT NULL DEFAULT 'N' CHECK(leido IN ('S','N')),
          sync_status     TEXT NOT NULL DEFAULT 'pending',
          created_at      TEXT NOT NULL
        );`,
        values: [],
      },
      {
        statement: `CREATE TABLE IF NOT EXISTS cola_sync (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          tabla        TEXT    NOT NULL,
          registro_id  TEXT    NOT NULL,
          operacion    TEXT    NOT NULL CHECK(operacion IN ('INSERT','UPDATE','DELETE')),
          intentos     INTEGER NOT NULL DEFAULT 0,
          status       TEXT    NOT NULL DEFAULT 'pendiente',
          created_at   TEXT    NOT NULL,
          last_attempt TEXT
        );`,
        values: [],
      },
      {
        // v4 — Preferencias de género del usuario.
        // Acumula el peso de afinidad por género mediante media ponderada por posición
        // (fórmula de Welford) cada vez que el usuario crea una reseña.
        // UNIQUE(usuario_id, tmdb_genero_id) garantiza un único registro por par.
        statement: `CREATE TABLE IF NOT EXISTS local_usuario_genero_preferencia (
          id             TEXT    NOT NULL PRIMARY KEY,
          usuario_id     TEXT    NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
          tmdb_genero_id INTEGER NOT NULL,
          nombre_genero  TEXT    NOT NULL,
          peso_pref      REAL    NOT NULL DEFAULT 0.0,
          conteo         INTEGER NOT NULL DEFAULT 0,
          sync_status    TEXT    NOT NULL DEFAULT 'pending',
          synced_at      TEXT,
          created_at     TEXT    NOT NULL,
          UNIQUE(usuario_id, tmdb_genero_id)
        );`,
        values: [],
      },
      { statement: `CREATE INDEX IF NOT EXISTS idx_lista_usuario   ON local_lista(usuario_id);`,   values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_resena_usuario  ON local_resena(usuario_id);`,  values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_resena_pelicula ON local_resena(pelicula_id);`, values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_mensaje_conv    ON local_mensaje(conversacion_id);`, values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_cola_status     ON cola_sync(status);`,         values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_cola_tabla      ON cola_sync(tabla);`,          values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_pref_genero_usuario ON local_usuario_genero_preferencia(usuario_id);`,   values: [] },
      { statement: `CREATE INDEX IF NOT EXISTS idx_pref_genero_tmdb    ON local_usuario_genero_preferencia(tmdb_genero_id);`, values: [] },
    ], false);

    // Migración incremental: agrega columnas si aún no existen.
    await this.agregarColumnaSiFalta('local_pelicula', 'idioma_original', 'TEXT');
    await this.agregarColumnaSiFalta('local_resena',   'synced_at',       'TEXT');
    await this.agregarColumnaSiFalta('local_lista',    'synced_at',       'TEXT');

    // Migración de local_lista: el esquema anterior usaba pelicula_id (FK individual).
    // Si se detecta el esquema viejo, se descarta y recrea con el nuevo diseño.
    await this.migrarTablaLista();

    console.log('[DatabaseService] Tablas creadas o verificadas correctamente.');
  }

  /**
   * Retorna la conexión activa a la BD para que otros servicios puedan usarla.
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

  /** Elimina todos los datos del usuario activo de la BD local. */
  async limpiarDatosUsuario(): Promise<void> {
    await this.db.run(`DELETE FROM cola_sync`);
    await this.db.run(`DELETE FROM local_usuario`);
    // Las tablas relacionadas (local_lista, local_resena, local_mensaje,
    // local_usuario_genero_preferencia) se limpian por CASCADE automáticamente.
    console.log('[DatabaseService] Datos de usuario eliminados.');
  }

  /**
   * Detecta si local_lista tiene el esquema viejo (pelicula_id como FK individual)
   * y lo recrea con el nuevo diseño (peliculas_ids como JSON array de tmdb_ids).
   */
  private async migrarTablaLista(): Promise<void> {
    const info = await this.db.query('PRAGMA table_info(local_lista)');
    const columnas: string[] = (info.values ?? []).map((c: any) => c.name);
    const esEsquemaViejo = columnas.includes('pelicula_id') && !columnas.includes('nombre');
    if (!esEsquemaViejo) return;

    await this.db.run(`DELETE FROM cola_sync WHERE tabla = 'local_lista'`);
    await this.db.run(`DROP TABLE IF EXISTS local_lista`);
    await this.db.executeSet([{
      statement: `CREATE TABLE local_lista (
        local_id      TEXT NOT NULL PRIMARY KEY,
        server_id     TEXT,
        usuario_id    TEXT NOT NULL REFERENCES local_usuario(id) ON DELETE CASCADE,
        nombre        TEXT NOT NULL,
        descripcion   TEXT,
        peliculas_ids TEXT NOT NULL DEFAULT '[]',
        estado        TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa','borrada')),
        sync_status   TEXT NOT NULL DEFAULT 'pending',
        synced_at     TEXT,
        created_at    TEXT NOT NULL
      );`,
      values: [],
    }]);
    console.log('[DatabaseService] local_lista migrada al nuevo esquema.');
  }

  /**
   * Agrega una columna a una tabla solo si aún no existe.
   * Usa PRAGMA table_info para evitar lanzar errores nativos visibles en logcat.
   */
  private async agregarColumnaSiFalta(tabla: string, columna: string, tipo: string): Promise<void> {
    const info = await this.db.query(`PRAGMA table_info(${tabla})`);
    const existe = info.values?.some((col: any) => col.name === columna);
    if (!existe) {
      await this.db.run(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo};`);
    }
  }

  /**
   * Cierra la conexión activa a la BD.
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
