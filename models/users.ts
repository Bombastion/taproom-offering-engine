// Who can sign in to the admin app. See auth/ for how they sign in and routes/auth.ts for the API.

export type UserRole = 'USER' | 'ADMIN';

// PENDING: signed up, waiting for an admin to approve them. DISABLED: turned away or turned off.
// Only ACTIVE users can sign in.
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';

export interface User {
    id: string;
    // Lowercased and trimmed (see normalizeEmail)
    email: string;
    displayName: string | null;
    // Null means the account can't sign in
    passwordHash: string | null;
    role: UserRole;
    status: UserStatus;
    createdAt: Date;
    approvedAt: Date | null;
    approvedById: string | null;
}

// What's needed to create a user; the rest gets defaults
export interface NewUser {
    email: string;
    displayName?: string | null;
    passwordHash?: string | null;
    role?: UserRole;
    status?: UserStatus;
}

// A signed-in browser. The id is the sha256 of the secret in the cookie, never the secret itself.
export interface Session {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
}

// The fields of a user that can be changed after it's created
export type UserUpdate = Partial<Pick<User, 'email' | 'displayName' | 'passwordHash' | 'role' | 'status' | 'approvedAt' | 'approvedById'>>;

// The parts of a user that are safe to send to the client
export interface PublicUser {
    id: string;
    email: string;
    displayName: string | null;
    role: UserRole;
}

// What an admin sees of an account on the Users screen: no password hash
export interface AdminUser extends PublicUser {
    status: UserStatus;
    createdAt: Date;
    approvedAt: Date | null;
}

export function toAdminUser(user: User): AdminUser {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        approvedAt: user.approvedAt,
    };
}

export function toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}
