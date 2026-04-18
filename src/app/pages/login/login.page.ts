import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { DatabaseService } from '../../../database/services/database.service';
import { DB_TABLES } from '../../../database/database.constants';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {

  //aquí se crean los objetos que recibirán los datos del html
  loginData = {
    email: '',
    password: '' };

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private databaseService: DatabaseService,
  ) { }

  // función para el botón ingresar
  async ingresar() {
    console.log('Intentando iniciar sesión con:', this.loginData);

    // VALIDACIÓN BÁSICA: campos vacíos
    if (!this.loginData.email || !this.loginData.password) {
      alert('Por favor, completa los campos');
      return;
    }

    // // por mientras, mientras se podra ingresar con cualquier dato (solo para probar app)
    // if(this.loginData.email !== '' && this.loginData.password !== '') {
    //   this.router.navigate(['/home']);
    // } else {
    //   alert('Por favor, completa los campos');
    // }

    // Validar credenciales contra Supabase Auth
    const { data, error } = await this.supabaseService.supabase.auth.signInWithPassword({
      email:    this.loginData.email,
      password: this.loginData.password,
    });

    if (error) {
      console.error('[LoginPage] Error al iniciar sesión:', error.message);
      alert('Correo o contraseña incorrectos.');
      return;
    }

    console.log('[LoginPage] Sesión iniciada. Usuario:', data.user?.email);

    // Restaurar local_usuario si está vacío.
    // Ocurre cuando la BD se reinicializa (reinstalación, cambio de versión, etc.)
    // pero la sesión Auth de Supabase persiste en el WebView.
    await this.restaurarUsuarioLocalSiVacio(data.user!.id);

    this.router.navigate(['/home']);
  }

  /**
   * Si local_usuario está vacío, obtiene el perfil del usuario desde Supabase
   * y lo inserta localmente. Garantiza que las páginas que dependen de local_usuario
   * (crear-resena, perfil, etc.) siempre encuentren datos tras el login.
   */
  private async restaurarUsuarioLocalSiVacio(authUserId: string): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const check = await db.query(
        `SELECT id FROM ${DB_TABLES.USUARIO} WHERE auth_user_id = ? LIMIT 1`,
        [authUserId]
      );
      if (check.values && check.values.length > 0) {
        return; // Ya tiene datos para este usuario — no hace nada
      }

      const { data: perfil, error: fetchError } = await this.supabaseService.getUsuarioPorAuthId(authUserId);
      if (fetchError || !perfil) {
        console.warn('[LoginPage] No se pudo obtener el perfil desde Supabase:', fetchError);
        return;
      }

      const ahora = new Date().toISOString();
      await db.run(
        `INSERT INTO ${DB_TABLES.USUARIO}
           (id, auth_user_id, nombre_user, nombre, apellido_1, apellido_2,
            email, fecha_nacimiento, genero, radio_conex, busqueda_abierta,
            sync_status, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          perfil.id,
          perfil.auth_user_id     ?? null,
          perfil.nombre_user      ?? null,
          perfil.nombre           ?? null,
          perfil.apellido_1       ?? null,
          perfil.apellido_2       ?? null,
          perfil.email            ?? null,
          perfil.fecha_nacimiento ?? null,
          perfil.genero           ?? null,
          perfil.radio_conex      ?? null,
          perfil.busqueda_abierta ?? null,
          'synced',
          ahora,
        ]
      );
      console.log('[LoginPage] local_usuario restaurado desde Supabase. id:', perfil.id);
    } catch (err) {
      console.warn('[LoginPage] Error al restaurar local_usuario:', err);
    }
  }

  // funcion para navegar al page de registro
  irARegistro() {
    this.router.navigate(['/registro']);
  }

}
