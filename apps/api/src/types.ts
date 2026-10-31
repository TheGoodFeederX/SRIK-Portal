import type { Db } from '@srik/db';
import type { Permission, Role } from '@srik/shared';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  permissions: Permission[];
};

export type AppEnv = {
  Variables: {
    db: Db;
    requestId: string;
    user: SessionUser | null;
  };
};
