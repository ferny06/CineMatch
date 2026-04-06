import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

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

  constructor(private router: Router) { }

  // función para el botón ingresar
  ingresar() {
    console.log('Intentando iniciar sesión con:', this.loginData);
    
    
    // ESTO DP HAY QUE CAMBIARLO , es por mientras, mientras se podra ingresar con cualquier dato (solo para probar app)
    if(this.loginData.email !== '' && this.loginData.password !== '') {
      this.router.navigate(['/home']);
    } else {
      alert('Por favor, completa los campos');
    }
  }

  // funcion para navegar al page de registro
  irARegistro() {
    this.router.navigate(['/registro']);
  }

}
