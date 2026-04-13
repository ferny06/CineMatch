import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-sugerencias',
  templateUrl: './sugerencias.page.html',
  styleUrls: ['./sugerencias.page.scss'],
  standalone: false
})
export class SugerenciasPage implements OnInit {

  usuarioActual: any = {
    nombre: 'fer',
    radio_conex: 10,
    busqueda_abierta: 'S',
    avatar_url: 'assets/icon/perfil_default.png' 
  };

  listaSugeridos: any[] = []; 

  constructor() { }

  ngOnInit() {
    this.cargarSugerenciasDesdeBBDD();
  }

  cargarSugerenciasDesdeBBDD() {
    // datossimulados
    this.listaSugeridos = [
      {
        nombre: 'ggg',
        distancia: 2.5,
        avatar_url: 'https://ionicframework.com/docs/img/demos/avatar.svg'
      },
      {
        nombre: 'jimmy',
        distancia: 5.1,
        avatar_url: 'https://ionicframework.com/docs/img/demos/avatar.svg'
      }
    ];
  }
}
