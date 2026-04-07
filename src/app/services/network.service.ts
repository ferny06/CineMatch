/**
 * NetworkService — CineMatch
 *
 * Responsabilidades:
 *  - Detectar el estado de conectividad del dispositivo usando @capacitor/network
 *  - Exponer la propiedad `estaConectado` para que otros servicios la consulten
 *  - Escuchar cambios de red en background y disparar el sync automáticamente
 *    cuando el dispositivo recupera conectividad (offline → online)
 *
 * ─── Patrón de callback para evitar dependencia circular ────────────────────
 *
 *  NetworkService NO inyecta SyncService directamente porque crearía un ciclo:
 *    NetworkService → SyncService → DatabaseService → ...
 *
 *  En cambio, AppComponent pasa el callback al inicializar:
 *    await networkService.inicializar(() => syncService.procesarCola())
 *
 *  Esto mantiene el grafo de dependencias acíclico y permite testear
 *  NetworkService de forma aislada.
 *
 * ─── Comportamiento en plataformas ──────────────────────────────────────────
 *
 *  Android/iOS: usa la API nativa del sistema operativo (sin permisos adicionales)
 *  Web/Browser: usa la API navigator.onLine + eventos 'online'/'offline'
 *  Capacitor maneja la diferencia de plataforma internamente.
 */

import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';

@Injectable({
  providedIn: 'root', // Singleton automático — no requiere registro en AppModule
})
export class NetworkService {

  /**
   * Estado actual de conectividad del dispositivo.
   * Se actualiza al inicializar y cada vez que cambia el estado de red.
   * `false` por defecto hasta que `inicializar()` lea el estado real.
   */
  private _estaConectado = false;

  /**
   * Propiedad pública de solo lectura para consultar el estado de red.
   * Usada por ColaService antes de disparar un sync inmediato.
   *
   * @example
   * if (this.networkService.estaConectado) {
   *   this.syncService.procesarCola();
   * }
   */
  get estaConectado(): boolean {
    return this._estaConectado;
  }

  /**
   * Inicializa el servicio de red:
   *  1. Lee el estado de conectividad actual del dispositivo
   *  2. Registra un listener para detectar cambios futuros de red
   *  3. Al recuperar conectividad (offline→online), ejecuta el callback de sync
   *
   * Debe llamarse desde AppComponent.ngOnInit() DESPUÉS de inicializar la BD,
   * ya que el callback de sync necesita que SQLite esté disponible.
   *
   * @param onConectado Callback a ejecutar cuando el dispositivo recupera red.
   *                    Normalmente: `() => syncService.procesarCola()`
   *
   * @example
   * // En AppComponent.ngOnInit():
   * await this.networkService.inicializar(
   *   () => this.syncService.procesarCola()
   * );
   */
  async inicializar(onConectado: () => Promise<void>): Promise<void> {
    // ── Paso 1: Leer estado actual de la red ──────────────────────────────────
    // Network.getStatus() devuelve { connected: boolean, connectionType: string }
    const estadoInicial = await Network.getStatus();
    this._estaConectado = estadoInicial.connected;

    console.log(
      `[NetworkService] Estado inicial: ${this._estaConectado ? 'CON RED' : 'SIN RED'}` +
      ` (${estadoInicial.connectionType})`
    );

    // ── Paso 2: Registrar listener de cambios de red ──────────────────────────
    // El listener se mantiene activo durante toda la vida de la app.
    // Capacitor lo limpia automáticamente al destruir la app.
    await Network.addListener('networkStatusChange', (estado) => {
      const teníaRed = this._estaConectado;
      this._estaConectado = estado.connected;

      console.log(
        `[NetworkService] Red cambiada: ${estado.connected ? 'CON RED' : 'SIN RED'}` +
        ` (${estado.connectionType})`
      );

      // ── Paso 3: Disparar sync solo al recuperar la red ────────────────────
      // Solo activamos el sync en la transición offline→online.
      // Si solo cambió el tipo de conexión (wifi→datos) sin perder red, no hacemos nada.
      if (!teníaRed && estado.connected) {
        console.log('[NetworkService] Red recuperada — disparando sync automático...');

        // Fire-and-forget: no esperamos el resultado para no bloquear el listener.
        // Los errores se loguean en el SyncService (cada ítem maneja sus propios errores).
        onConectado().catch((err) => {
          console.error('[NetworkService] Error en sync tras recuperar red:', err);
        });
      }
    });

    console.log('[NetworkService] Listener de red registrado correctamente.');
  }
}
