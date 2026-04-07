import { Component, OnInit } from '@angular/core';
import { MovieService } from '../../services/movie';
import { Router } from '@angular/router';


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false 
})
export class HomePage implements OnInit {

  // variables
  peliculas: any[] = [];  // PELICULAS Q SE MUESTRAN EN PANTALLA
  peliculasCopia: any[] = []; //RESPALDO DE SEGURIDAD QUE ENVIA LA API Y QUE NO CAMBIA

  constructor(private movieService: MovieService,
              private router: Router
  ) { }

  
  ngOnInit() {
    this.movieService.getPopularMovies().subscribe({
      next: (data: any) => {
        this.peliculas = data.results;
        this.peliculasCopia = data.results;
        console.log('Películas cargadas:', this.peliculas);
      },
      error: (err) => {
        console.error('Error al cargar pelis:', err);
      }
    });
  }

  // FUNCIÓN PARA BUSQUEDA
  buscarPelicula(event: any) {
    const texto = event.detail.value.toLowerCase(); 
    
    if (texto.length === 0) {
      this.peliculas = this.peliculasCopia; 
      return;
    }

    this.peliculas = this.peliculasCopia.filter(peli => {
      return peli.title.toLowerCase().includes(texto);
    });
  }

  irAPerfil() {
    this.router.navigate(['/perfil']);
  }

  irAHome() {
  this.router.navigate(['/home']);
  this.peliculas = [...this.peliculasCopia];
  console.log('Vista de Home reiniciada');
  }

  verDetalle(peliculaId: number) {
  // a la ruta pasando el id que viene de la api
  this.router.navigate(['/pelicula', peliculaId]);
}
} 

