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

  listaAmigos: any[] = [];
  listaSugeridos: any[] = []; 

  constructor() { }

  ngOnInit() {
    this.cargarSugerenciasDesdeBBDD();
  }

  cargarSugerenciasDesdeBBDD() {

    // datos simulados
    this.listaAmigos = [
      { 
        id: 10, 
        nombre: 'Tita', 
        avatar_url: 'https://ionicframework.com/docs/img/demos/avatar.svg' 
      },
      { 
        id: 11, 
        nombre: 'Carlota', 
        avatar_url: 'https://ionicframework.com/docs/img/demos/avatar.svg' 
      }
    ];
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
