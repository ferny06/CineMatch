import { Component, OnInit } from '@angular/core'; // Esto arregla el error de OnInit
import { Router } from '@angular/router';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: false 
})
export class PerfilPage implements OnInit {

  // variables con datos de prueba
  usuario = {
    nombre_user: 'fff666',
    nombre: 'f',
    apellido_1: 'aa',
    apellido_2: 'ee',
    email: '666@duoc.cl',
    avatar_url: 'https://i.pinimg.com/1200x/a7/e9/68/a7e968a04e14523413ace70ce6464534.jpg', 
    bio: 'cinee',
    radio_conex: 15,
    busqueda_abierta: 'S'
  };


constructor(private router: Router) { }

  ngOnInit() { }

  // 3. Creamos las funciones que el HTML está llamando
  irAHome() {
    this.router.navigate(['/home']);
  }

  irAPerfil() {
    // Ya estamos en perfil, así que no hace nada o puedes hacer scroll arriba
    console.log('Ya estás en el perfil');
  }
}
