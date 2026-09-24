export type UserStatus = 'Activo' | 'Inactivo' | 'Pendiente' | 'Bloqueado';
export type RoleStatus = 'Activo' | 'Inactivo';

export interface AppUser {
  id:          string;
  code:        string;       // USR-0001
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;
  docType:     string;
  docNumber:   string;
  birthDate:   string;
  role:        string;
  username:    string;
  password?:   string;
  status:      UserStatus;
  branch:      string;
  lastAccess:  string;
  createdAt:   string;
  observations:string;
  sendCredentials: boolean;
}

export interface Role {
  id:          string;
  name:        string;
  description: string;
  users:       number;
  status:      RoleStatus;
  permissions: RolePermissions;
}

export interface ModulePermission {
  view:    boolean;
  create:  boolean;
  edit:    boolean;
  delete:  boolean;
  export:  boolean;
}

export interface RolePermissions {
  [module: string]: ModulePermission;
}

export interface AuditLog {
  id:       string;
  dateTime: string;
  user:     string;
  action:   string;
  detail:   string;
  ip:       string;
}
