import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-mis-listas',
  templateUrl: './mis-listas.page.html',
  styleUrls: ['./mis-listas.page.scss'],
  standalone: false,
})
export class MisListasPage implements OnInit {

  // se usa "estado" de tabla
  segmento: string = 'por_ver'; 

  // local_lista
  peliculasGuardadas: any[] = [
    { 
      local_id: 'uuid-local-001',   
      server_id: 'uuid-serv-999',   
      usuario_id: 'user-06',        
      pelicula_id: 550,             
      estado: 'por_ver',            
      sync_status: 'sincronizado',  
      created_at: '2026-04-01',     
      fecha_visto: null,            
      
      
      // para que el Front se vea bien, se necesita iamgen y titulo
      // estos vendrán de un JOIN con la tabla PELICULA en el futuro
      titulo: 'Batman', 
      poster_url: 'https://i.pinimg.com/736x/da/2c/a4/da2ca4118b0b27454ccf76f8b6d18f65.jpg' 
    }
  ];

  constructor() { }

  ngOnInit() { }

  // se filtra  usando el atributo 'estado' de  tabla
  get filtradas() {
    return this.peliculasGuardadas.filter(p => p.estado === this.segmento);
  }
}
