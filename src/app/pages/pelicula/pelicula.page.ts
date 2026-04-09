import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MovieService } from '../../services/movie'; 

@Component({
  selector: 'app-pelicula',
  templateUrl: './pelicula.page.html',
  styleUrls: ['./pelicula.page.scss'],
  standalone: false
})
export class PeliculaPage implements OnInit {

  // objeto inicializado con los nombres de tablas de la bd
  peli: any = {
    id: '',                
    tmdb_id: 0,            
    titulo: 'Cargando...', 
    sinopsis: '',          
    fecha_estreno: '',     
    poster_url: '',        
    duracion_min: 0,       
    promedio_votos: 0,     
    idioma_original: '',  
    generos_json: ''       
  };

  constructor(
    private route: ActivatedRoute,
    private movieService: MovieService,
    private router: Router
  ) { }

  ngOnInit() {
    // se captura ID que viene por la URL desde home
    const id = this.route.snapshot.paramMap.get('id');

    if (id) {
      this.cargarDetallesPelicula(id);
    }
  }

  cargarDetallesPelicula(id: string) {
    
    this.movieService.getMovieById(id).subscribe({
      next: (res: any) => {
        
        this.peli = {
          id: res.id.toString(),
          tmdb_id: res.id,
          titulo: res.title,
          sinopsis: res.overview,              // "overview" de API pasa a "sinopsis"
          fecha_estreno: res.release_date,      // "fecha_estreno"
          poster_url: 'https://image.tmdb.org/t/p/w500' + res.poster_path, 
          duracion_min: res.runtime,           // "duracion_min"
          promedio_votos: res.vote_average,    // promedio_votos
          idioma_original: res.original_language,
          generos_json: JSON.stringify(res.genres) //
        };
        
        console.log('Datos mapeados según BBDD:', this.peli);
      },
      error: (err) => {
        console.error('Error al traer detalles de la API:', err);
      }
    });

  
  }
    // para ir  a pantalla de crear reseña
  irAEscribirResena() {
    
    this.router.navigate(['/crear-resena', this.peli.id]);
}
}