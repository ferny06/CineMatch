import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

export type ResultadoUbicacion =
  | { ok: true;  coordenadas: Coordenadas }
  | { ok: false; motivo: 'gps_apagado' | 'permiso_denegado' | 'error' };

// Tipado mínimo del plugin Cordova inyectado en window por el bridge de Capacitor
interface LocationAccuracyPlugin {
  request: (
    onSuccess: () => void,
    onError: (error: any) => void,
    priority: number
  ) => void;
  REQUEST_PRIORITY_HIGH_ACCURACY: number;
}

@Injectable({
  providedIn: 'root',
})
export class GeolocalizacionService {

  constructor(private http: HttpClient) {}

  async obtenerCodigoPais(latitud: number, longitud: number): Promise<string | null> {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitud}&longitude=${longitud}&localityLanguage=en`;
      const res = await firstValueFrom(this.http.get<any>(url));
      return res.countryCode ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Solicita permiso de ubicación y obtiene las coordenadas actuales.
   *
   * Si el GPS del sistema está apagado, muestra el diálogo nativo de Android
   * (Google Play Services Location) para que el usuario lo active sin salir
   * de la app. Solo si el usuario rechaza ese diálogo retorna motivo:'gps_apagado'.
   */
  async obtenerUbicacion(): Promise<ResultadoUbicacion> {
    // ── 1. Solicitar permiso de la app ────────────────────────────────────────
    try {
      const permiso = await Geolocation.requestPermissions();
      if (permiso.location !== 'granted' && permiso.coarseLocation !== 'granted') {
        console.warn('[GeolocalizacionService] Permiso de ubicación denegado.');
        return { ok: false, motivo: 'permiso_denegado' };
      }
    } catch (err: any) {
      const mensaje: string = err?.message ?? '';
      if (
        mensaje.includes('Location services are not enabled') ||
        mensaje.includes('location disabled')
      ) {
        // GPS del sistema apagado → intentar activar con diálogo nativo
        const activado = await this.solicitarActivacionGPS();
        if (!activado) {
          return { ok: false, motivo: 'gps_apagado' };
        }
        // GPS activado por el usuario: reintentar obtener ubicación
        return this.obtenerUbicacion();
      }
      console.warn('[GeolocalizacionService] Error al solicitar permisos:', err);
      return { ok: false, motivo: 'error' };
    }

    // ── 2. Obtener posición GPS ───────────────────────────────────────────────
    try {
      const posicion = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return {
        ok: true,
        coordenadas: {
          latitud:  posicion.coords.latitude,
          longitud: posicion.coords.longitude,
        },
      };
    } catch (err: any) {
      const mensaje: string = err?.message ?? '';
      if (
        mensaje.includes('Location services are not enabled') ||
        mensaje.includes('location disabled')
      ) {
        const activado = await this.solicitarActivacionGPS();
        if (!activado) {
          return { ok: false, motivo: 'gps_apagado' };
        }
        return this.obtenerUbicacion();
      }
      console.warn('[GeolocalizacionService] Error al obtener posición:', err);
      return { ok: false, motivo: 'error' };
    }
  }

  /**
   * Muestra el diálogo nativo de Android para activar el GPS.
   * Usa cordova-plugin-request-location-accuracy vía el bridge de Capacitor.
   *
   * @returns true si el usuario activó el GPS, false si lo rechazó o el plugin no está disponible
   */
  private solicitarActivacionGPS(): Promise<boolean> {
    return new Promise((resolve) => {
      const plugin: LocationAccuracyPlugin | undefined =
        (window as any).cordova?.plugins?.locationAccuracy;

      if (!plugin) {
        // En web o si el plugin no cargó, no podemos mostrar el diálogo nativo
        console.warn('[GeolocalizacionService] Plugin locationAccuracy no disponible.');
        resolve(false);
        return;
      }

      plugin.request(
        () => {
          console.log('[GeolocalizacionService] Usuario activó el GPS.');
          resolve(true);
        },
        (error: any) => {
          console.warn('[GeolocalizacionService] Usuario rechazó activar el GPS:', error);
          resolve(false);
        },
        plugin.REQUEST_PRIORITY_HIGH_ACCURACY
      );
    });
  }
}
