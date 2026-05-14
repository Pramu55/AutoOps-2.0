'use client';

import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;

    socket = io(typeof window !== 'undefined' ? window.location.origin : '/', {
      path: '/api/socket.io',
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      console.info('[socket] connected', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.info('[socket] disconnected', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error', err.message);
    });
  }

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
