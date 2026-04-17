import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from 'src/database/services/database.service';
// SyncService orquesta la sincronización entre SQLite local y Supabase central.
import { SyncService } from './services/sync.service';
// NetworkService detecta cambios de conectividad y dispara sync automáticamente.
import { NetworkService } from './services/network.service';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  constructor(
    private router: Router,
    private databaseService: DatabaseService,
    private syncService: SyncService,
    private networkService: NetworkService,
    private supabaseService: SupabaseService,
  ) {}

  /**
   * Secuencia de arranque de la aplicación (orden crítico):
   *
   *  1. Inicializar SQLite local — debe ser lo primero; SyncService y ColaService
   *     dependen de que la conexión esté abierta antes de operar.
   *
   *  2. Inicializar NetworkService — registra el listener de red con el callback
   *     de sync. Debe hacerse ANTES de procesar la cola para evitar que el
   *     listener se active mientras la cola aún no está lista.
   *
   *  3. Procesar cola pendiente — envía a Supabase todos los registros que
   *     quedaron en cola_sync de sesiones anteriores (modo offline, cierres
   *     abruptos, etc.). La guardia de concurrencia en SyncService evita
   *     que esta llamada y el listener de red colisionen.
   */
  async ngOnInit(): Promise<void> {
    // Paso 1: abrir la conexión SQLite y crear tablas si no existen
    await this.databaseService.inicializar();

    // Paso 2: registrar listener de red.
    // El callback hace que cuando el dispositivo recupere conectividad,
    // SyncService procese automáticamente los ítems pendientes en cola_sync.
    await this.networkService.inicializar(
      () => this.syncService.procesarCola()
    );

    // Paso 3: procesar ítems que quedaron pendientes de sesiones anteriores.
    // Si no hay red, procesarCola() retorna inmediatamente (cola vacía en Supabase).
    // Si hay red, envía todos los pendientes en orden FK-safe.
    await this.syncService.procesarCola();

    // Paso 4: verificar si existe una sesión activa de Supabase Auth persistida
    // en localStorage del WebView. Si la hay, el usuario ya inició sesión antes
    // y no debe volver a la pantalla de login.
    const { data: { session } } = await this.supabaseService.supabase.auth.getSession();
    if (session) {
      console.log('[AppComponent] Sesión activa encontrada — redirigiendo a home.');
      await this.restaurarUsuarioLocalSiVacio(session.user.id);
      this.router.navigate(['/home'], { replaceUrl: true });
    }
  }

  /**
   * Si local_usuario está vacío, obtiene el perfil del usuario desde Supabase
   * y lo inserta localmente. Cubre el caso de arranque con sesión persistida
   * pero BD reinicializada (reinstalación sin borrar datos Auth del WebView).
   */
  private async restaurarUsuarioLocalSiVacio(authUserId: string): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const check = await db.query('SELECT id FROM local_usuario LIMIT 1');
      if (check.values && check.values.length > 0) {
        return; // Ya tiene datos — no hace nada
      }

      const { data: perfil, error } = await this.supabaseService.getUsuarioPorAuthId(authUserId);
      if (error || !perfil) {
        console.warn('[AppComponent] No se pudo obtener el perfil desde Supabase:', error);
        return;
      }

      const ahora = new Date().toISOString();
      await db.run(
        `INSERT INTO local_usuario
           (id, auth_user_id, nombre_user, nombre, apellido_1, apellido_2,
            email, fecha_nacimiento, genero, radio_conex, busqueda_abierta,
            sync_status, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          perfil.id,
          perfil.auth_user_id     ?? null,
          perfil.nombre_user      ?? null,
          perfil.nombre           ?? null,
          perfil.apellido_1       ?? null,
          perfil.apellido_2       ?? null,
          perfil.email            ?? null,
          perfil.fecha_nacimiento ?? null,
          perfil.genero           ?? null,
          perfil.radio_conex      ?? null,
          perfil.busqueda_abierta ?? null,
          'synced',
          ahora,
        ]
      );
      console.log('[AppComponent] local_usuario restaurado desde Supabase. id:', perfil.id);
    } catch (err) {
      console.warn('[AppComponent] Error al restaurar local_usuario:', err);
    }
  }
}
