import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router'; // router para navegar


@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: false,
})
export class RegistroPage implements OnInit {

  

userPost = {
    nombre_user: '',
    nombre: '',
    apellido_1: '',
    apellido_2: '',
    email: '',
    password: '',
    confirm_password: '',
    fecha_nacimiento: '',
    genero: '',
    radio_conex: 5,
    busqueda_abierta: true
  };

  constructor(private router: Router) { }
  ngOnInit() { }

  registrar() {
    //  VALIDACIÓN: QUE NADA ESTE VACÍO (NOT NULL)
    if (!this.userPost.nombre_user || !this.userPost.nombre || 
        !this.userPost.apellido_1 || !this.userPost.apellido_2 ||
        !this.userPost.email || !this.userPost.fecha_nacimiento || 
        !this.userPost.genero || !this.userPost.password) {
      alert("Error: todos los campos son obligatorios.");
      return;
    }

    // 2. VALIDACIÓN: LARGOS MÍNIMOS (nombres y apellidos >= 2 caracteres)
    if (this.userPost.nombre_user.length < 2 ||
        this.userPost.nombre.length < 2 || 
        this.userPost.apellido_1.length < 2 || 
        this.userPost.apellido_2.length < 2) {
      alert("El nombre de usuario, nombre y apellidos deben tener al menos 2 caracteres.");
      return;
    }

    // 3. VALIDACIÓN: FORMATO DE EMAIL
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userPost.email)) {
      alert("Por favor, ingresa un correo electrónico válido (ejemplo@correo.com).");
      return;
    }

    // 4. VALIDACIÓN: SEGURIDAD DE CLAVE (min 6 caracteres, letras y nros)
    const passRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
    if (!passRegex.test(this.userPost.password)) {
      alert("La contraseña debe tener al menos 6 caracteres e incluir letras y números.");
      return;
    }

    // 5. VALIDACIÓN: COINCIDENCIA DE CLAVES
    if (this.userPost.password !== this.userPost.confirm_password) {
      alert("Las contraseñas no coinciden.");
      return;
    }

    // SI LLEGA AQUÍ, TODO ESTÁ OK
    console.log("¡QA Aprobado! Datos listos para enviar:", this.userPost);
    alert("¡Registro exitoso en CineMatch! Ya puedes iniciar sesión :)");
    this.router.navigate(['/login']);
  }

  volverLogin() {
    this.router.navigate(['/login']);
  }
}
