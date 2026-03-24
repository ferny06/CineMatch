import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router'; // router para navegar

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: false,
})
export class RegistroPage implements OnInit {

  constructor(private router: Router) { } // se inyecta el Router

  ngOnInit() { }

  // 1. función de registro
  registrar() {
    console.log('Registro exitoso');
    // mientras tanto, después de registrar, lo mandamos al login para probar
    this.router.navigate(['/login']);
  }

  // 2.  función para volver al login
  volverLogin() {
    this.router.navigate(['/login']);
  }

}
