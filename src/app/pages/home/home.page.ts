import { Component, OnInit } from '@angular/core';
import { MovieService } from '../../services/movie';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false // Esto es importante según tu versión de Ionic
})
export class HomePage implements OnInit {

  peliculas: any[] = [];

  constructor(private movieService: MovieService) { }

  ngOnInit() {
    this.movieService.getPopularMovies().subscribe({
      next: (data: any) => {
        this.peliculas = data.results;
        console.log('Películas cargadas:', this.peliculas);
      },
      error: (err) => {
        console.error('Error al cargar pelis:', err);
      }
    });
  }
}