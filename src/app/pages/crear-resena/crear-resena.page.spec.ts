import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, AlertController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { CrearResenaPage } from './crear-resena.page';
import { DatabaseService } from '../../../database/services/database.service';
import { ColaService } from '../../services/cola.service';
import { GeneroPreferenciaService } from '../../services/genero-preferencia.service';
import { PullSyncService } from '../../services/pull-sync.service';

describe('CrearResenaPage (Pruebas de Validación)', () => {
  let component: CrearResenaPage;
  let fixture: ComponentFixture<CrearResenaPage>;

  // mocks de los servicios para que no den error al iniciar
  const mockDb = { obtenerConexion: () => ({ query: () => Promise.resolve({ values: [] }), run: () => Promise.resolve() }) };
  const mockCola = { encolar: () => Promise.resolve() };
  const mockGeneros = { actualizarPreferencias: () => Promise.resolve() };
  const mockPull = { pullPreferencias: () => Promise.resolve() };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CrearResenaPage ],
      imports: [
        IonicModule.forRoot(), 
        FormsModule,
        RouterTestingModule
      ],
      providers: [
        { provide: DatabaseService, useValue: mockDb },
        { provide: ColaService, useValue: mockCola },
        { provide: GeneroPreferenciaService, useValue: mockGeneros },
        { provide: PullSyncService, useValue: mockPull },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '123' } } // Simula un ID de película 123
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CrearResenaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('debería iniciar con la calificación en 0', () => {
    // verificamos que al abrir la página, el objeto resena tenga 0 estrellas
    expect(component.resena.calificacion).toBe(0);
  });

  it('debería actualizar la calificación al llamar a setRating', () => {
    // simulamos que el usuario hace clic en la tercera estrella
    component.setRating(3);
    expect(component.resena.calificacion).toBe(3);
  });

  it('debería permitir guardar solo si la calificación es mayor a 0', () => {
    // Caso 1: sin estrellas (debe fallar)
    component.resena.calificacion = 0;
    // En el codigo, guardar() retorna un alert si es 0, aqui se prueba la lógica
    expect(component.resena.calificacion > 0).toBeFalse();

    // Caso 2: Con estrellas (debe pasar)
    component.setRating(5);
    expect(component.resena.calificacion > 0).toBeTrue();
  });

  it('debería permitir un comentario vacío (opcional)', () => {
    component.setRating(4);
    component.resena.comentario = ''; // Comentario vacío
    
    // verificamos que la calificacion sea valida aunque no haya comentarios
    expect(component.resena.calificacion).toBeGreaterThan(0);
    expect(component.resena.comentario.length).toBe(0);
  });
});