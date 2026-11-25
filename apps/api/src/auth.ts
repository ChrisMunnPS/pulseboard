import { can, type Permission, type Role } from '@pulse/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from './db';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role; iat?: number };
  }
}

export const audit = (actor: string | null, action: string, target: string, result = 'ok', detail?: object) =>
  pool.query('insert into audit_log (actor_id, action, target, result, detail) values ($1,$2,$3,$4,$5)', [
    actor, action, target, result, detail ? JSON.stringify(detail) : null,
  ]);

/**
 * Verifies the token AND re-reads the user on every request, so disabling an account,
 * changing a role, or changing a password takes effect immediately, not when the token expires.
 */
export const guard = (permission: Permission) => async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Sign in required' });
  }
  const { rows } = await pool.query(
    'select role, disabled, extract(epoch from pw_changed_at)::bigint as pwc from users where id = $1',
    [req.user.sub],
  );
  const u = rows[0];
  // 2 s of allowance for clock differences between the API and database containers
  if (!u || u.disabled || (req.user.iat ?? 0) + 2 < Number(u.pwc)) return reply.code(401).send({ error: 'Sign in required' });
  req.user.role = u.role as Role;
  if (!can(req.user.role, permission)) return reply.code(403).send({ error: 'You do not have permission to do that' });
};
