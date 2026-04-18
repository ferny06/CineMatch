import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';

@Component({
  selector: 'app-mensaje-amigo',
  templateUrl: './mensaje-amigo.page.html',
  styleUrls: ['./mensaje-amigo.page.scss'],
  standalone: false
})
export class MensajeAmigoPage implements OnInit {

  @ViewChild(IonContent) content!: IonContent;

  amigoId = '';
  conversacionId = '';

  usuarioActual: any = { id: '', nombre: '' };
  amigo: any = { nombre: 'Cargando...', avatar_url: 'assets/icon/perfil_default.png' };

  mensajes: any[] = [];
  nuevoMensaje = '';
  enviando = false;

  constructor(
    private route: ActivatedRoute,
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit() {
    this.amigoId = this.route.snapshot.queryParamMap.get('amigoId') ?? '';
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.amigoId) return;
    await this.cargarUsuarioActual();
    await Promise.all([
      this.cargarPerfilAmigo(),
      this.cargarConversacion(),
    ]);
  }

  private async cargarUsuarioActual(): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const res = await db.query('SELECT id, nombre_user, nombre FROM local_usuario LIMIT 1');
    const u = res.values?.[0];
    if (!u) return;
    this.usuarioActual = { id: u['id'], nombre: u['nombre_user'] || u['nombre'] || '' };
  }

  private async cargarPerfilAmigo(): Promise<void> {
    const { data } = await this.supabaseService.getUsuarioPorId(this.amigoId);
    if (data) {
      this.amigo = {
        nombre:    data.nombre_user || data.nombre || 'Usuario',
        avatar_url: data.avatar_url ?? 'assets/icon/perfil_default.png',
      };
    }
  }

  private async cargarConversacion(): Promise<void> {
    if (!this.usuarioActual.id) return;

    const { data: convId, error } = await this.supabaseService.obtenerOCrearConversacion(
      this.usuarioActual.id,
      this.amigoId
    );

    if (error || !convId) {
      console.error('[MensajeAmigo] No se pudo obtener/crear conversación:', error);
      return;
    }

    this.conversacionId = convId;

    // Guardar en local_conversacion si no existe
    const db = this.databaseService.obtenerConexion();
    await db.run(
      `INSERT OR IGNORE INTO local_conversacion (id, sync_status, synced_at)
       VALUES (?, 'synced', datetime('now'))`,
      [this.conversacionId]
    );

    await this.cargarMensajes();
  }

  async cargarMensajes(): Promise<void> {
    if (!this.conversacionId) return;
    const { data } = await this.supabaseService.pullMensajesDeConversacion(this.conversacionId);
    this.mensajes = data ?? [];
    setTimeout(() => this.content?.scrollToBottom(200), 100);
    if (this.usuarioActual.id) {
      await this.supabaseService.marcarMensajesComoLeidos(this.conversacionId, this.usuarioActual.id);
    }
  }

  async enviarMensaje(): Promise<void> {
    const texto = this.nuevoMensaje.trim();
    if (!texto || this.enviando || !this.conversacionId) return;

    this.enviando = true;
    const ahora = new Date().toISOString();
    const localId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const mensaje = {
      local_id:        localId,
      server_id:       null,
      emisor_id:       this.usuarioActual.id,
      conversacion_id: this.conversacionId,
      contenido:       texto,
      leido:           'N' as 'N',
      sync_status:     'pending',
      created_at:      ahora,
    };

    // Agregar al array inmediatamente (optimistic update)
    this.mensajes = [
      ...this.mensajes,
      { emisor_id: mensaje.emisor_id, contenido: texto, fecha_envio: ahora, leido: 'N' }
    ];
    this.nuevoMensaje = '';
    setTimeout(() => this.content?.scrollToBottom(200), 50);

    try {
      // Guardar en SQLite local
      const db = this.databaseService.obtenerConexion();
      await db.run(
        `INSERT INTO local_mensaje
         (local_id, server_id, emisor_id, conversacion_id, contenido, leido, sync_status, created_at)
         VALUES (?, NULL, ?, ?, ?, 'N', 'pending', ?)`,
        [localId, mensaje.emisor_id, mensaje.conversacion_id, texto, ahora]
      );

      // Enviar directamente a Supabase
      const { data: serverId } = await this.supabaseService.insertMensaje(mensaje);
      if (serverId) {
        await db.run(
          `UPDATE local_mensaje SET server_id = ?, sync_status = 'synced' WHERE local_id = ?`,
          [serverId, localId]
        );
      }
    } catch (err) {
      console.error('[MensajeAmigo] Error al enviar mensaje:', err);
    } finally {
      this.enviando = false;
    }
  }

  esMio(msg: any): boolean {
    return msg.emisor_id === this.usuarioActual.id;
  }

  onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      event.preventDefault();
      this.enviarMensaje();
    }
  }

  formatearHora(fecha: string): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
}
