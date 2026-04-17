import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-perfil-amigo',
  templateUrl: './perfil-amigo.page.html',
  styleUrls: ['./perfil-amigo.page.scss'],
  standalone: false
})
export class PerfilAmigoPage implements OnInit {

  
  amigo: any = {
    id: '', 
    nombre: 'Cargando...',
    apellido_1: '',
    nombre_user: '',
    bio: '',
    avatar_url: 'assets/icon/favicon.png',
    preferencias: [] 
  };

  
  resenas: any[] = [
    {
      local_id: 'res-001',
      titulo: 'Return to Silent Hill', 
      calificacion: 1,     
      comentario: 'bienmaala', 
      sync_status: 'SINCRO',
      created_at: '2026-02-02'
    }
  ];

  constructor() { }

  ngOnInit() {
    // aqui  cargariamos la info usando local_id del amigo
  }
}