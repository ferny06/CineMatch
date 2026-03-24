import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {

  constructor(private router: Router) { }

  // funcion para navegar al page de registro
  irARegistro() {
    this.router.navigate(['/registro']);
  }

}
