import type { Response } from 'express';
import jwt from 'jsonwebtoken';

export function issueAuthSessionCookie(res: Response, options: { userId: string; jwtSecret: string }) {
  const token = jwt.sign({ userId: options.userId }, options.jwtSecret, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthSessionCookie(res: Response) {
  res.clearCookie('token', {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
