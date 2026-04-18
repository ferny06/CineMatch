import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';
import { BadgeService } from 'src/app/services/badge.service';

@Component({
  selector: 'app-footer-nav',
  templateUrl: './footer-nav.component.html',
  styleUrls: ['./footer-nav.component.scss'],
  standalone: false
})
export class FooterNavComponent implements OnInit, OnDestroy {
  @Input() activo: string = '';

  badgeAmigos   = 0;
  badgeMensajes = 0;

  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
    private badgeService: BadgeService,
  ) {}

  async ngOnInit() {
    this.subs.push(
      this.badgeService.amigos$.subscribe(n   => this.badgeAmigos   = n),
      this.badgeService.mensajes$.subscribe(n => this.badgeMensajes = n),
    );
    await this.cargarBadgesIniciales();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  private async cargarBadgesIniciales(): Promise<void> {
    const db  = this.databaseService.obtenerConexion();
    const res = await db.query('SELECT id FROM local_usuario LIMIT 1');
    const uid = res.values?.[0]?.['id'];
    if (!uid) return;

    const [notifs, unread] = await Promise.all([
      this.supabaseService.obtenerNotificacionesNoLeidas(uid),
      this.supabaseService.contarMensajesNoLeidos(uid),
    ]);
    this.badgeService.setAmigos(notifs.data?.length ?? 0);
    this.badgeService.setMensajes(unread);
  }

  navegar(ruta: string) {
    this.router.navigate([`/${ruta}`]);
  }
}
