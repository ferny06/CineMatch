/**
 * Barrel export de todos los modelos de la base de datos local.
 *
 * Permite importar cualquier modelo desde una sola ruta:
 *   import { LocalUsuario, LocalPelicula, ColaSync } from 'src/database/models';
 *
 * En lugar de:
 *   import { LocalUsuario } from 'src/database/models/local-usuario.model';
 *   import { LocalPelicula } from 'src/database/models/local-pelicula.model';
 */
export * from './local-usuario.model';
export * from './local-pelicula.model';
export * from './local-conversacion.model';
export * from './local-lista.model';
export * from './local-resena.model';
export * from './local-mensaje.model';
export * from './cola-sync.model';
export * from './local-usuario-genero-preferencia.model';
