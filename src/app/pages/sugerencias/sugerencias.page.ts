import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';
import { GeolocalizacionService } from 'src/app/services/geolocalizacion.service';
import { PullSyncService } from 'src/app/services/pull-sync.service';

interface UsuarioSugerido {
  id: string;
  nombre: string;
  avatar_url: string | null;
  distancia: number;
  generos: string[];
  similitud: number;
}

@Component({
  selector: 'app-sugerencias',
  templateUrl: './sugerencias.page.html',
  styleUrls: ['./sugerencias.page.scss'],
  standalone: false
})
export class SugerenciasPage implements OnInit {

  usuarioActual: any = {
    id: null,
    nombre: '',
    radio_conex: 10,
    busqueda_abierta: 'S',
    avatar_url: 'assets/icon/perfil_default.png'
  };

  listaAmigos: any[] = [];
  listaSugeridos: UsuarioSugerido[] = [];
  cargando = false;

  constructor(
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
    private geoService: GeolocalizacionService,
    private alertCtrl: AlertController,
    private pullSync: PullSyncService,
  ) {}

  ngOnInit() {}

  /**
   * Se ejecuta cada vez que el usuario entra a la página.
   * Refresca la ubicación GPS y recalcula las sugerencias.
   */
  async ionViewWillEnter(): Promise<void> {
    this.cargando = true;
    this.listaSugeridos = [];

    try {
      await this.cargarUsuarioActual();
      if (!this.usuarioActual.id) return;

      await this.pullSync.pullPreferencias(this.usuarioActual.id);

      await Promise.all([
        this.actualizarUbicacionYCargarSugeridos(),
        this.cargarAmigos(),
      ]);
    } finally {
      this.cargando = false;
    }
  }

  // ─── Carga del usuario actual desde SQLite ────────────────────────────────

  private async cargarUsuarioActual(): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const res = await db.query(
      'SELECT id, nombre_user, nombre, radio_conex, busqueda_abierta, avatar_url FROM local_usuario LIMIT 1'
    );
    const u = res.values?.[0];
    if (!u) return;

    this.usuarioActual = {
      id:              u['id'],
      nombre:          u['nombre_user'] || u['nombre'] || 'Tú',
      radio_conex:     u['radio_conex'] ?? 10,
      busqueda_abierta: u['busqueda_abierta'],
      avatar_url:      u['avatar_url'] || 'assets/icon/perfil_default.png',
    };
  }

  // ─── GPS + sugeridos ──────────────────────────────────────────────────────

  private async actualizarUbicacionYCargarSugeridos(): Promise<void> {
    const resultado = await this.geoService.obtenerUbicacion();

    if (!resultado.ok) {
      await this.mostrarAlertaUbicacion(resultado.motivo);
      return;
    }

    const { latitud, longitud } = resultado.coordenadas;

    // Actualizar coordenadas en Supabase (fire-and-forget, no bloquea la UI)
    this.supabaseService.actualizarUbicacionUsuario(
      this.usuarioActual.id,
      latitud,
      longitud
    );

    // Obtener preferencias locales del usuario actual
    const misPrefs = await this.obtenerMisPreferencias();

    // Obtener candidatos desde Supabase
    const { data: candidatos, error } = await this.supabaseService.obtenerUsuariosCercanos(
      this.usuarioActual.id
    );

    if (error || !candidatos) {
      console.warn('[SugerenciasPage] Error al obtener usuarios cercanos:', error);
      return;
    }

    const radioKm: number = this.usuarioActual.radio_conex ?? 10;

    // Filtrar por distancia y calcular similitud
    const sugeridosFiltrados: UsuarioSugerido[] = candidatos
      .filter((u: any) => u.latitud != null && u.longitud != null)
      .map((u: any) => {
        const distancia = this.haversineKm(
          latitud, longitud,
          u.latitud, u.longitud
        );
        const similitud = this.calcularSimilitud(misPrefs, u.usuario_genero_preferencia ?? []);
        const generos   = this.topGeneros(u.usuario_genero_preferencia ?? [], 3);
        return {
          id:         u.id,
          nombre:     u.nombre_user || u.nombre || 'Usuario',
          avatar_url: u.avatar_url ?? null,
          distancia:  Math.round(distancia * 10) / 10,
          generos,
          similitud,
        };
      })
      .filter((u: UsuarioSugerido) => u.distancia <= radioKm)
      .sort((a: UsuarioSugerido, b: UsuarioSugerido) => b.similitud - a.similitud)
      .slice(0, 4);

    this.listaSugeridos = sugeridosFiltrados;
  }

  // ─── Amigos ───────────────────────────────────────────────────────────────

  private async cargarAmigos(): Promise<void> {
    const { data, error } = await this.supabaseService.obtenerAmigos(this.usuarioActual.id);
    if (error) {
      console.warn('[SugerenciasPage] Error al cargar amigos:', error);
      return;
    }
    this.listaAmigos = data ?? [];
  }

  // ─── Preferencias locales del usuario actual ──────────────────────────────

  private async obtenerMisPreferencias(): Promise<Map<number, number>> {
    const db = this.databaseService.obtenerConexion();
    const res = await db.query(
      `SELECT tmdb_genero_id, peso_pref
       FROM local_usuario_genero_preferencia
       WHERE usuario_id = ?
       ORDER BY peso_pref DESC`,
      [this.usuarioActual.id]
    );
    const mapa = new Map<number, number>();
    for (const row of res.values ?? []) {
      mapa.set(row['tmdb_genero_id'], row['peso_pref']);
    }
    return mapa;
  }

  // ─── Alertas de ubicación ─────────────────────────────────────────────────

  private async mostrarAlertaUbicacion(motivo: 'gps_apagado' | 'permiso_denegado' | 'error'): Promise<void> {
    // gps_apagado es manejado con diálogo nativo por GeolocalizacionService.
    // Solo se llega aquí si el usuario rechazó ese diálogo o por otros errores.
    const configs: Record<string, any> = {
      gps_apagado: {
        header: 'GPS desactivado',
        message: 'Activa el GPS en Ajustes → Ubicación para ver personas cerca de ti.',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Ir a Ajustes', handler: () => { window.open('app-settings:', '_system'); } },
        ],
      },
      permiso_denegado: {
        header: 'Permiso denegado',
        message: 'CineMatch necesita acceso a tu ubicación para mostrarte personas cercanas. Actívalo en los ajustes de la app.',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Ir a Ajustes', handler: () => { window.open('app-settings:', '_system'); } },
        ],
      },
      error: {
        header: 'Sin ubicación',
        message: 'No pudimos obtener tu ubicación. Comprueba que el GPS esté activo e inténtalo de nuevo.',
        buttons: [{ text: 'Aceptar', role: 'cancel' }],
      },
    };

    const alert = await this.alertCtrl.create(configs[motivo]);
    await alert.present();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Distancia en km entre dos coordenadas usando la fórmula de Haversine.
   */
  private haversineKm(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Calcula la similitud de géneros entre el usuario actual y un candidato.
   * Usa producto punto: suma de (peso_yo * peso_ellos) por género en común.
   */
  private calcularSimilitud(
    misPrefs: Map<number, number>,
    prefsEllos: Array<{ peso_pref: number; genero: { tmdb_id: number } | null }>
  ): number {
    let score = 0;
    for (const pref of prefsEllos) {
      if (!pref.genero) continue;
      const miPeso = misPrefs.get(pref.genero.tmdb_id) ?? 0;
      score += miPeso * pref.peso_pref;
    }
    return score;
  }

  /**
   * Devuelve los nombres de los top N géneros de un usuario ordenados por peso.
   */
  private topGeneros(
    prefs: Array<{ peso_pref: number; genero: { tmdb_id: number; nombre: string } | null }>,
    n: number
  ): string[] {
    return prefs
      .filter(p => p.genero != null)
      .sort((a, b) => b.peso_pref - a.peso_pref)
      .slice(0, n)
      .map(p => p.genero!.nombre);
  }
}
