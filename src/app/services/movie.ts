import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MovieService {

  private apiKey = '3202517282b75eac578700265ab3595e'; 
  private baseUrl = 'https://api.themoviedb.org/3';

  constructor(private http: HttpClient) { }

  getPopularMovies(): Observable<any> {
    
    return this.http.get(`${this.baseUrl}/movie/popular?api_key=${this.apiKey}&language=es-ES`);
  }

  searchMovies(query: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${query}&language=es-ES`);
  }

  // funcion para obtener el detalle de UNA peli especfica
getMovieById(id: string): Observable<any> {
  return this.http.get(`${this.baseUrl}/movie/${id}?api_key=${this.apiKey}&language=es-ES`);
}
}