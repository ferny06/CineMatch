import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router'; // router para navegar
import { DatabaseService } from '../../../database/services/database.service';
// ColaService encola el registro en cola_sync y dispara el sync con Supabase.
import { ColaService } from '../../services/cola.service';
// SupabaseService: crea la cuenta Auth y obtiene el auth_user_id (NOT NULL en tabla usuario).
import { SupabaseService } from '../../services/supabase.service';
// Modelos y constantes del esquema local SQLite.
import { LocalUsuario } from '../../../database/models/local-usuario.model';
import { DB_TABLES, SYNC_STATUS, SYNC_OPERACION } from '../../../database/database.constants';


@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: false,
})
export class RegistroPage implements OnInit {



userPost = {
    nombre_user: '',
    nombre: '',
    apellido_1: '',
    apellido_2: '',
    email: '',
    password: '',
    confirm_password: '',
    fecha_nacimiento: '',
    genero: '',
    radio_conex: 5,
    busqueda_abierta: true
  };

  constructor(private router: Router,
              private dbService: DatabaseService,
              // ColaService: escribe en cola_sync y dispara sync si hay red
              private colaService: ColaService,
              // SupabaseService: crea la cuenta Auth y devuelve el auth_user_id
              private supabaseService: SupabaseService,
  ) { }
  ngOnInit() { }

  // `async` para poder usar `await` con la BD y la cola de sync
  async registrar() {
    //  VALIDACIÓN: QUE NADA ESTE VACÍO (NOT NULL)
    if (!this.userPost.nombre_user || !this.userPost.nombre ||
        !this.userPost.apellido_1 || !this.userPost.apellido_2 ||
        !this.userPost.email || !this.userPost.fecha_nacimiento ||
        !this.userPost.genero || !this.userPost.password) {
      alert("Error: todos los campos son obligatorios.");
      return;
    }

    // 2. VALIDACIÓN: LARGOS MÍNIMOS (nombres y apellidos >= 2 caracteres)
    if (this.userPost.nombre_user.length < 2 ||
        this.userPost.nombre.length < 2 ||
        this.userPost.apellido_1.length < 2 ||
        this.userPost.apellido_2.length < 2) {
      alert("El nombre de usuario, nombre y apellidos deben tener al menos 2 caracteres.");
      return;
    }

    // 3. VALIDACIÓN: FORMATO DE EMAIL
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userPost.email)) {
      alert("Por favor, ingresa un correo electrónico válido (ejemplo@correo.com).");
      return;
    }

    // 4. VALIDACIÓN: SEGURIDAD DE CLAVE (min 6 caracteres, letras y nros)
    const passRegex = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
    if (!passRegex.test(this.userPost.password)) {
      alert("La contraseña debe tener al menos 6 caracteres e incluir letras y números.");
      return;
    }

    // 5. VALIDACIÓN: COINCIDENCIA DE CLAVES
    if (this.userPost.password !== this.userPost.confirm_password) {
      alert("Las contraseñas no coinciden.");
      return;
    }

    // SI LLEGA AQUÍ, TODO ESTÁ OK
    console.log("¡QA Aprobado! Datos listos para enviar:", this.userPost);

    // ── PERSISTENCIA OFFLINE-FIRST ────────────────────────────────────────────
    try {
      // Paso 0: Crear cuenta en Supabase Auth (requiere internet).
      // auth_user_id es NOT NULL en la tabla `usuario` de Supabase — sin él
      // el upsert falla con un constraint error. Por eso se obtiene primero.
      const authResult = await this.supabaseService.signUp(
        this.userPost.email,
        this.userPost.password
      );
      if (authResult.error) {
        alert(`Error al crear la cuenta: ${authResult.error}`);
        return;
      }
      const authUserId = authResult.data!.authUserId;

      // Generar un UUID único para el usuario usando la Web Crypto API estándar.
      // Este id se usa como PK local y como id en Supabase cuando se sincronice.
      const localId = crypto.randomUUID();
      const ahora = new Date().toISOString();

      // Construir el objeto LocalUsuario mapeando los campos del formulario.
      // Conversiones necesarias:
      //   busqueda_abierta: boolean (toggle) → 'S'/'N' (CHECK constraint en SQLite y Supabase)
      //   password: NO se guarda localmente por seguridad
      const nuevoUsuario: LocalUsuario = {
        id:               localId,
        auth_user_id:     authUserId,           // UUID de Supabase Auth (NOT NULL en servidor)
        nombre_user:      this.userPost.nombre_user,
        nombre:           this.userPost.nombre,
        apellido_1:       this.userPost.apellido_1,
        apellido_2:       this.userPost.apellido_2,
        email:            this.userPost.email,
        fecha_nacimiento: this.userPost.fecha_nacimiento,
        genero:           this.userPost.genero,
        radio_conex:      this.userPost.radio_conex,
        busqueda_abierta: this.userPost.busqueda_abierta ? 'S' : 'N',
        sync_status:      SYNC_STATUS.PENDING,  // pendiente de sync con Supabase
        synced_at:        ahora,
      };

      // Paso 1: Upsert directo a Supabase mientras hay red garantizada.
      // signUp() acaba de funcionar, así que hay internet en este momento.
      // Esto asegura que el usuario quede en la tabla `usuario` de Supabase
      // independientemente de si el sync de cola falla después.
      const { error: upsertError } = await this.supabaseService.upsertUsuario(nuevoUsuario);
      if (upsertError) {
        alert(`Error al guardar tu perfil en el servidor: ${upsertError}`);
        return;
      }

      // Paso 2: INSERT en SQLite local (offline-first).
      const db = this.dbService.obtenerConexion();
      await db.run(`
        INSERT INTO ${DB_TABLES.USUARIO}
          (id, auth_user_id, nombre_user, nombre, apellido_1, apellido_2, email,
           fecha_nacimiento, genero, radio_conex, busqueda_abierta,
           sync_status, synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        nuevoUsuario.id,
        nuevoUsuario.auth_user_id,
        nuevoUsuario.nombre_user,
        nuevoUsuario.nombre,
        nuevoUsuario.apellido_1,
        nuevoUsuario.apellido_2,
        nuevoUsuario.email,
        nuevoUsuario.fecha_nacimiento,
        nuevoUsuario.genero,
        nuevoUsuario.radio_conex,
        nuevoUsuario.busqueda_abierta,
        nuevoUsuario.sync_status,
        nuevoUsuario.synced_at,
      ]);

      // Paso 3: Encolar en cola_sync para sincronizar futuras actualizaciones del perfil.
      // ColaService insertará en cola_sync y, si hay red, disparará el sync
      // inmediatamente (fire-and-forget). Sin red, el ítem queda pendiente
      // y se enviará cuando vuelva la conectividad o en el próximo arranque.
      await this.colaService.encolar(DB_TABLES.USUARIO, localId, SYNC_OPERACION.INSERT);

      alert("¡Registro exitoso en CineMatch! Ya puedes iniciar sesión :)");
      this.router.navigate(['/login']);

    } catch (error) {
      // Error al guardar en la BD local (ej: disco lleno, BD no inicializada)
      console.error('[RegistroPage] Error al guardar usuario en local:', error);
      alert("Ocurrió un error al guardar tu registro. Por favor, intenta nuevamente.");
    }
  }

  volverLogin() {
    this.router.navigate(['/login']);
  }
}
