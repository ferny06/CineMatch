import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-crear-resena',
  templateUrl: './crear-resena.page.html',
  styleUrls: ['./crear-resena.page.scss'],
  standalone: false
})
export class CrearResenaPage implements OnInit {

  // se define objeto resena
  resena = {
    local_id: null,
    server_id: null,
    usuario_id: 'user_06',
    pelicula_id: '',
    calificacion: 0,
    comentario: '',
    tiene_spoiler: false,
    sync_status: 0,
    created_at: ''
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit() {
    // captura el id de la película que viene en la ruta
    const peliId = this.route.snapshot.paramMap.get('id');
    if (peliId) {
      this.resena.pelicula_id = peliId;
    }
  }

  //  funcion 'setRating' 
  setRating(val: number) {
    this.resena.calificacion = val;
  }

  // para guardar
  guardar() {
    this.resena.created_at = new Date().toISOString();
    
    // mapeo para el formato de bd (S o N)
    const dbData = {
      ...this.resena,
      tiene_spoiler: this.resena.tiene_spoiler ? 'S' : 'N'
    };

    console.log('Datos listos para enviar a la BBDD:', dbData);
    alert('¡Reseña guardada exitosamente!');
    
    // luego se devuelve a page pelicula
    this.router.navigate(['/pelicula', this.resena.pelicula_id]);
  }
}