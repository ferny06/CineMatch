import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';
import { GeolocalizacionService } from 'src/app/services/geolocalizacion.service';
import { PullSyncService } from 'src/app/services/pull-sync.service';
import { BadgeService } from 'src/app/services/badge.service';

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

  notificaciones: any[] = [];
  contadorNoLeidas = 0;
  popoverAbierto = false;
  popoverEvent: any = null;
  conectadosIds = new Set<string>();
  enviando: { [userId: string]: boolean } = {};

  constructor(
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
    private geoService: GeolocalizacionService,
    private pullSync: PullSyncService,
    private router: Router,
    private badgeService: BadgeService,
  ) {}

  ngOnInit() {}

  verPerfilAmigo(amigo: any) {
    this.router.navigate(['/perfil-amigo', amigo.id]);
  }

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
        this.cargarNotificaciones(),
        this.cargarEstadoConexiones(),
      ]);

      this.listaSugeridos = this.listaSugeridos.filter(u => !this.conectadosIds.has(u.id));
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

    let latitud: number;
    let longitud: number;

    if (resultado.ok) {
      latitud = resultado.coordenadas.latitud;
      longitud = resultado.coordenadas.longitud;

      // Actualizar coordenadas en Supabase (fire-and-forget, no bloquea la UI)
      this.supabaseService.actualizarUbicacionUsuario(
        this.usuarioActual.id,
        latitud,
        longitud
      );
    } else {
      // Sin GPS: usar las coordenadas guardadas en Supabase
      const guardadas = await this.supabaseService.obtenerCoordenadasGuardadas(this.usuarioActual.id);
      if (guardadas.latitud == null || guardadas.longitud == null) return;
      latitud = guardadas.latitud;
      longitud = guardadas.longitud;
    }

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

  // ─── Notificaciones y conexiones ─────────────────────────────────────────

  private async cargarNotificaciones(): Promise<void> {
    const { data } = await this.supabaseService.obtenerNotificacionesNoLeidas(this.usuarioActual.id);
    this.notificaciones = data ?? [];
    this.contadorNoLeidas = this.notificaciones.length;
    this.badgeService.setAmigos(this.contadorNoLeidas);
  }

  private async cargarEstadoConexiones(): Promise<void> {
    const { data } = await this.supabaseService.obtenerEstadoConexiones(this.usuarioActual.id);
    this.conectadosIds.clear();
    for (const c of (data ?? [])) {
      const otherId = c.solicitante_id === this.usuarioActual.id
        ? c.destinatario_id : c.solicitante_id;
      this.conectadosIds.add(otherId);
    }
  }

  async enviarSolicitud(sugerido: UsuarioSugerido): Promise<void> {
    if (this.enviando[sugerido.id] || this.conectadosIds.has(sugerido.id)) return;
    this.enviando[sugerido.id] = true;
    const { error } = await this.supabaseService.enviarSolicitudAmistad(
      this.usuarioActual.id,
      this.usuarioActual.nombre,
      sugerido.id
    );
    if (error) {
      console.warn('[SugerenciasPage] Error al enviar solicitud:', error);
      this.enviando[sugerido.id] = false;
      return;
    }
    this.conectadosIds.add(sugerido.id);
  }

  abrirPopover(event: Event): void {
    this.popoverEvent = event;
    this.popoverAbierto = true;
  }

  cerrarPopover(): void {
    this.popoverAbierto = false;
    this.popoverEvent = null;
  }

  async responderSolicitud(notif: any, aceptar: boolean): Promise<void> {
    const { error } = await this.supabaseService.responderSolicitudAmistad(
      notif.referencia_id, notif.id, aceptar
    );
    if (!error) {
      this.notificaciones = this.notificaciones.filter((n: any) => n.id !== notif.id);
      this.contadorNoLeidas = this.notificaciones.length;
      this.badgeService.setAmigos(this.contadorNoLeidas);
      if (aceptar) await this.cargarAmigos();
    }
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
