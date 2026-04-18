import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';

@Component({
  selector: 'app-perfil-amigo',
  templateUrl: './perfil-amigo.page.html',
  styleUrls: ['./perfil-amigo.page.scss'],
  standalone: false
})
export class PerfilAmigoPage implements OnInit {

  amigoId = '';

  amigo: any = {
    id: '',
    nombre: 'Cargando...',
    apellido_1: '',
    nombre_user: '',
    bio: '',
    avatar_url: 'assets/icon/perfil_default.png',
    preferencias: []
  };

  resenas: any[] = [];
  cargando = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit() {
    this.amigoId = this.route.snapshot.paramMap.get('id') ?? '';
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.amigoId) return;
    this.cargando = true;
    try {
      await Promise.all([
        this.cargarPerfil(),
        this.cargarResenas(),
      ]);
    } finally {
      this.cargando = false;
    }
  }

  private async cargarPerfil(): Promise<void> {
    const { data, error } = await this.supabaseService.getUsuarioPorId(this.amigoId);
    if (error || !data) return;

    const { data: prefs } = await this.supabaseService.obtenerPreferenciasDeUsuario(this.amigoId);

    this.amigo = {
      id:          data.id,
      nombre:      data.nombre ?? '',
      apellido_1:  data.apellido_1 ?? '',
      nombre_user: data.nombre_user ?? '',
      bio:         data.bio ?? '',
      avatar_url:  data.avatar_url ?? 'assets/icon/perfil_default.png',
      preferencias: prefs ?? [],
    };
  }

  private async cargarResenas(): Promise<void> {
    const { data } = await this.supabaseService.obtenerResenasDeUsuario(this.amigoId);
    this.resenas = data ?? [];
  }

  irAMensajes(): void {
    this.router.navigate(['/mensaje-amigo'], { queryParams: { amigoId: this.amigoId } });
  }
}
