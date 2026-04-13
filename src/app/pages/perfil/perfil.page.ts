import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { DatabaseService } from '../../../database/services/database.service';
import { NetworkService } from '../../services/network.service';
import { ColaService } from '../../services/cola.service';
import { SupabaseService } from '../../services/supabase.service';
import { DB_TABLES, SYNC_STATUS, SYNC_OPERACION } from '../../../database/database.constants';
import { LocalUsuario } from '../../../database/models/local-usuario.model';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: false
})
export class PerfilPage implements OnInit {

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  usuario: LocalUsuario | null = null;
  modoEdicion = false;

  /** Vista previa local del avatar mientras se edita (ObjectURL temporal) */
  previewAvatar: string | null = null;

  /** Archivo seleccionado del dispositivo, listo para subir al guardar */
  private archivoAvatar: File | null = null;

  editarForm = {
    nombre: '',
    apellido_1: '',
    apellido_2: '',
    fecha_nacimiento: '',
    genero: '',
    bio: '',
    radio_conex: 5,
    busqueda_abierta: false,
  };

  // Datos de prueba — deshabilitados
  // usuario = {
  //   nombre_user: 'fff666',
  //   nombre: 'f',
  //   apellido_1: 'aa',
  //   apellido_2: 'ee',
  //   email: '666@duoc.cl',
  //   avatar_url: 'https://i.pinimg.com/1200x/a7/e9/68/a7e968a04e14523413ace70ce6464534.jpg',
  //   bio: 'cinee',
  //   radio_conex: 15,
  //   busqueda_abierta: 'S'
  // };

  constructor(
    private router: Router,
    private databaseService: DatabaseService,
    private networkService: NetworkService,
    private colaService: ColaService,
    private supabaseService: SupabaseService,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    await this.cargarUsuario();
  }

  async cargarUsuario(): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const res = await db.query('SELECT * FROM local_usuario LIMIT 1');
      if (res.values && res.values.length > 0) {
        this.usuario = res.values[0] as LocalUsuario;
      }
    } catch (err) {
      console.error('[PerfilPage] Error al cargar usuario:', err);
    }
  }

  get puedeEditar(): boolean {
    return this.networkService.estaConectado;
  }

  activarEdicion(): void {
    if (!this.usuario) return;
    this.archivoAvatar = null;
    this.previewAvatar = null;
    this.editarForm = {
      nombre:           this.usuario.nombre          ?? '',
      apellido_1:       this.usuario.apellido_1       ?? '',
      apellido_2:       this.usuario.apellido_2       ?? '',
      fecha_nacimiento: this.usuario.fecha_nacimiento ?? '',
      genero:           this.usuario.genero           ?? '',
      bio:              this.usuario.bio              ?? '',
      radio_conex:      this.usuario.radio_conex      ?? 5,
      busqueda_abierta: this.usuario.busqueda_abierta === 'S',
    };
    this.modoEdicion = true;
  }

  cancelarEdicion(): void {
    // Liberar el ObjectURL temporal si se había seleccionado una imagen
    if (this.previewAvatar) {
      URL.revokeObjectURL(this.previewAvatar);
    }
    this.previewAvatar = null;
    this.archivoAvatar = null;
    this.modoEdicion = false;
  }

  /** Abre el selector de archivos del dispositivo (galería/cámara en móvil) */
  seleccionarFoto(): void {
    this.fileInput.nativeElement.click();
  }

  /** Cuando el usuario elige una imagen, genera una vista previa local */
  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const archivo = input.files[0];
    if (!archivo.type.startsWith('image/')) return;

    // Liberar el ObjectURL anterior si existe
    if (this.previewAvatar) {
      URL.revokeObjectURL(this.previewAvatar);
    }

    this.archivoAvatar = archivo;
    this.previewAvatar = URL.createObjectURL(archivo);
  }

  /** Sube el avatar a Supabase Storage y devuelve la URL pública */
  private async subirAvatar(archivo: File, usuarioId: string): Promise<string | null> {
    const ext = archivo.name.split('.').pop() ?? 'jpg';
    const path = `${usuarioId}/avatar.${ext}`;

    const { error } = await this.supabaseService.supabase.storage
      .from('avatars')
      .upload(path, archivo, { upsert: true });

    if (error) {
      console.error('[PerfilPage] Error al subir avatar:', error.message);
      return null;
    }

    const { data: urlData } = this.supabaseService.supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    return urlData.publicUrl ?? null;
  }

  async guardarCambios(): Promise<void> {
    if (!this.usuario) return;

    // Validación de campos requeridos
    if (
      !this.editarForm.nombre.trim() ||
      !this.editarForm.apellido_1.trim() ||
      !this.editarForm.genero ||
      !this.editarForm.fecha_nacimiento
    ) {
      const alert = await this.alertController.create({
        header: 'Campos incompletos',
        message: 'Nombre, primer apellido, género y fecha de nacimiento son obligatorios.',
        buttons: ['Entendido'],
      });
      await alert.present();
      return;
    }

    try {
      const db = this.databaseService.obtenerConexion();
      const ahora = new Date().toISOString();
      const busquedaStr = this.editarForm.busqueda_abierta ? 'S' : 'N';

      // Subir avatar a Supabase Storage si el usuario eligió una nueva foto
      let avatarUrl = this.usuario.avatar_url ?? null;
      if (this.archivoAvatar) {
        const urlSubida = await this.subirAvatar(this.archivoAvatar, this.usuario.id);
        if (urlSubida) {
          avatarUrl = urlSubida;
        } else {
          const alert = await this.alertController.create({
            header: 'Error al subir foto',
            message: 'No se pudo subir la fotografía. Los demás datos se guardarán sin cambiar el avatar.',
            buttons: ['Continuar'],
          });
          await alert.present();
          await alert.onDidDismiss();
        }
      }

      await db.run(
        `UPDATE local_usuario SET
          nombre           = ?,
          apellido_1       = ?,
          apellido_2       = ?,
          fecha_nacimiento = ?,
          genero           = ?,
          avatar_url       = ?,
          bio              = ?,
          radio_conex      = ?,
          busqueda_abierta = ?,
          sync_status      = ?,
          synced_at        = ?
        WHERE id = ?`,
        [
          this.editarForm.nombre.trim(),
          this.editarForm.apellido_1.trim(),
          this.editarForm.apellido_2.trim(),
          this.editarForm.fecha_nacimiento,
          this.editarForm.genero,
          avatarUrl,
          this.editarForm.bio.trim(),
          this.editarForm.radio_conex,
          busquedaStr,
          SYNC_STATUS.PENDING,
          ahora,
          this.usuario.id,
        ]
      );

      await this.colaService.encolar(DB_TABLES.USUARIO, this.usuario.id, SYNC_OPERACION.UPDATE);

      // Actualizar objeto en memoria
      this.usuario = {
        ...this.usuario,
        nombre:           this.editarForm.nombre.trim(),
        apellido_1:       this.editarForm.apellido_1.trim(),
        apellido_2:       this.editarForm.apellido_2.trim(),
        fecha_nacimiento: this.editarForm.fecha_nacimiento,
        genero:           this.editarForm.genero,
        avatar_url:       avatarUrl,
        bio:              this.editarForm.bio.trim(),
        radio_conex:      this.editarForm.radio_conex,
        busqueda_abierta: busquedaStr as 'S' | 'N',
        sync_status:      SYNC_STATUS.PENDING,
        synced_at:        ahora,
      };

      // Liberar ObjectURL temporal
      if (this.previewAvatar) {
        URL.revokeObjectURL(this.previewAvatar);
        this.previewAvatar = null;
      }
      this.archivoAvatar = null;
      this.modoEdicion = false;

    } catch (err) {
      console.error('[PerfilPage] Error al guardar cambios:', err);
      const alert = await this.alertController.create({
        header: 'Error',
        message: 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
        buttons: ['Aceptar'],
      });
      await alert.present();
    }
  }

  irAHome(): void {
    this.router.navigate(['/home']);
  }


  async cerrarSesion() {
    const alert = await this.alertController.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres salir de CineMatch?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'secondary'
        }, {
          text: 'Sí, salir',
          handler: () => {
            this.ejecutarLogout();
          }
        }
      ]
    });

    await alert.present();
  }

  private async ejecutarLogout() {
    try {
      
      console.log('Sesión terminada con éxito');
      this.router.navigate(['/login'], { replaceUrl: true });
      
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  }
}