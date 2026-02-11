import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthUser } from '../types.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
if (!AUTH0_DOMAIN) {
  throw new Error('AUTH0_DOMAIN environment variable is required');
}

const JWKS = createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`));

export async function verifyToken(token: string): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: 'ollama-chat-api',
      issuer: `https://${AUTH0_DOMAIN}/`,
    });

    // Get user info from Auth0 userinfo endpoint to retrieve email
    let email: string | undefined = payload.email as string | undefined;

    if (!email) {
      try {
        const userInfoResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json();
          email = userInfo.email;
          console.log('Retrieved email from userinfo:', email);
        }
      } catch (error) {
        console.warn('Failed to fetch userinfo:', error);
      }
    }

    return {
      sub: payload.sub!,
      email,
    };
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getAuthUser(event: APIGatewayProxyEventV2 | any): Promise<AuthUser> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid Authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];
  return verifyToken(token);
}

export function isAdmin(email?: string): boolean {
  if (!email) return false;

  const adminEmails = process.env.ADMIN_EMAILS || '';
  const admins = adminEmails.split(',').map(e => e.trim().toLowerCase());

  return admins.includes(email.toLowerCase());
}

export async function requireAdmin(event: APIGatewayProxyEventV2 | any): Promise<AuthUser> {
  const user = await getAuthUser(event);

  console.log('User email:', user.email);
  console.log('Admin emails env:', process.env.ADMIN_EMAILS);
  console.log('Is admin?', isAdmin(user.email));

  if (!isAdmin(user.email)) {
    throw new Error('Admin access required');
  }

  return user;
}
