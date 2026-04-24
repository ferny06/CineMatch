import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { FooterNavComponent } from './footer-nav.component';

// se importan los servicios reales para poder referenciarlos
import { DatabaseService } from 'src/database/services/database.service';
import { SupabaseService } from 'src/app/services/supabase.service';
import { BadgeService } from 'src/app/services/badge.service';
import { of } from 'rxjs';

describe('FooterNavComponent', () => {
  let component: FooterNavComponent;
  let fixture: ComponentFixture<FooterNavComponent>;

  // 1. se crean simuladores (mocks) para que la prueba no use la BD real
  const mockBadgeService = {
    amigos$: of(0),
    mensajes$: of(0),
    setAmigos: jasmine.createSpy('setAmigos'),
    setMensajes: jasmine.createSpy('setMensajes')
  };

  const mockSupabaseService = {
    obtenerNotificacionesNoLeidas: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [] })),
    contarMensajesNoLeidos: jasmine.createSpy().and.returnValue(Promise.resolve(0))
  };

  const mockDatabaseService = {
    obtenerConexion: jasmine.createSpy().and.returnValue({
      query: jasmine.createSpy().and.returnValue(Promise.resolve({ values: [] }))
    })
  };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ FooterNavComponent ],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule // simula el sistema de rutas
      ],
      providers: [
        // aca se le pide a angular: cuando el componente pida X servicio, dale mi simulador
        { provide: BadgeService, useValue: mockBadgeService },
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: DatabaseService, useValue: mockDatabaseService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FooterNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  // PRUEBA 1: verificar que el componente carga
  it('debería crearse el componente (Smoke Test)', () => {
    expect(component).toBeTruthy();
  });

  // PRUEBA 2: verificar que el @Input funciona
  it('debería recibir y guardar el valor de la página activa mediante @Input', () => {
    const valorPrueba = 'perfil';
    component.activo = valorPrueba;
    expect(component.activo).toBe(valorPrueba);
  });
});