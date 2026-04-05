import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

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

  constructor(private router: Router,
              private supabaseService: SupabaseService) { }

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
    this.router.navigate(['/home']);
  }

  // funcion para navegar al page de registro
  irARegistro() {
    this.router.navigate(['/registro']);
  }

}
