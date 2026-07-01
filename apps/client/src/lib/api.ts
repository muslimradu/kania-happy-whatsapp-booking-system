/**
 * API client — semua request ke /api/* lewat sini.
 * Token disimpan di localStorage, di-inject otomatis ke setiap request.
 */

import type { ApiSuccessResponse } from '@/types/api';

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem('kh_token');
}

export function saveToken(token: string, username: string): void {
  localStorage.setItem('kh_token', token);
  localStorage.setItem('kh_username', username);
}

export function clearToken(): void {
  localStorage.removeItem('kh_token');
  localStorage.removeItem('kh_username');
}

export function getUsername(): string | null {
  return localStorage.getItem('kh_username');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json() as ApiSuccessResponse<T> | { success: false; code: string; message: string };

  if (!json.success) {
    throw new ApiError(json.code, json.message, res.status);
  }

  return (json as ApiSuccessResponse<T>).data;
}

export const api = {
  get:    <T>(path: string)                    => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown)    => request<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown)    => request<T>('PUT', path, body),
  delete: <T>(path: string)                    => request<T>('DELETE', path),
};
