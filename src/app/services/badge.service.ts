import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BadgeService {
  private _amigos   = new BehaviorSubject<number>(0);
  private _mensajes = new BehaviorSubject<number>(0);

  amigos$   = this._amigos.asObservable();
  mensajes$ = this._mensajes.asObservable();

  setAmigos(count: number)   { this._amigos.next(count); }
  setMensajes(count: number) { this._mensajes.next(count); }
}
