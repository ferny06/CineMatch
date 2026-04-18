import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';
import { BadgeService } from 'src/app/services/badge.service';

@Component({
  selector: 'app-mensajes',
  templateUrl: './mensajes.page.html',
  styleUrls: ['./mensajes.page.scss'],
  standalone: false
})
export class MensajesPage implements OnInit {

  conversaciones: any[] = [];
  cargando = false;

  private usuarioActualId = '';

  constructor(
    private router: Router,
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
    private badgeService: BadgeService,
  ) {}

  ngOnInit() {}

  async ionViewWillEnter(): Promise<void> {
    this.cargando = true;
    try {
      await this.cargarUsuarioActual();
      if (!this.usuarioActualId) return;
      await this.cargarConversaciones();
    } finally {
      this.cargando = false;
    }
  }

  private async cargarUsuarioActual(): Promise<void> {
    const db = this.databaseService.obtenerConexion();
    const res = await db.query('SELECT id FROM local_usuario LIMIT 1');
    this.usuarioActualId = res.values?.[0]?.['id'] ?? '';
  }

  private async cargarConversaciones(): Promise<void> {
    const { data, error } = await this.supabaseService.obtenerConversacionesConAmigos(this.usuarioActualId);
    if (error || !data) return;

    const resultado: any[] = [];

    for (const conv of data) {
      const { data: msgs } = await this.supabaseService.pullMensajesDeConversacion(conv.conversacionId);
      const ultimo = msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
      resultado.push({
        amigoId:       conv.amigoId,
        nombre:        conv.nombre,
        avatar_url:    conv.avatar_url ?? 'assets/icon/perfil_default.png',
        ultimoMensaje: ultimo?.contenido ?? 'Sin mensajes aún',
        fecha:         ultimo?.fecha_envio ?? '',
        leido:         ultimo?.leido ?? 'S',
      });
    }

    this.conversaciones = resultado;
    const noLeidas = resultado.filter((c: any) => c.leido === 'N').length;
    this.badgeService.setMensajes(noLeidas);
  }

  irAConversacion(amigoId: string): void {
    this.router.navigate(['/mensaje-amigo'], { queryParams: { amigoId } });
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    const hoy = new Date();
    const mismoDia = d.toDateString() === hoy.toDateString();
    return mismoDia
      ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
  }
}
