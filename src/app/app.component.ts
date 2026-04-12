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
      this.router.navigate(['/home'], { replaceUrl: true });
    }
  }
}
