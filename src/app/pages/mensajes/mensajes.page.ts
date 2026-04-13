import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-mensajes',
  templateUrl: './mensajes.page.html',
  styleUrls: ['./mensajes.page.scss'],
  standalone:false 
})
export class MensajesPage implements OnInit {

  // Estos son los campos EXACTOS de tu imagen image_9008ca.png
  mensajes: any[] = [
    {
      local_id: 'msg-001',          
      server_id: 'srv-999',         
      emisor_id: 'user06',     
      contenido: 'holaa', 
      leido: 'N',                   
      sync_status: 'SINCRO',        
      created_at: '2026-04-12 20:00',
      local_conversacion_id: 'conv-10' 
    },
    {
      local_id: 'msg-002',
      server_id: null,              
      emisor_id: 'ferny',
      contenido: 'hola hola',
      leido: 'S',
      sync_status: 'PENDIENTE',
      created_at: '2026-04-12 20:05',
      local_conversacion_id: 'conv-10'
    }
  ];

  constructor(private router: Router) { }

  ngOnInit() { }

  // 
  irAConversacion(id: string) {
    this.router.navigate(['/chat-detalle', id]);
  }
}