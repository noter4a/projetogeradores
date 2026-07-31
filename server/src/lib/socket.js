// Singleton holder for the Socket.IO server instance. index.js creates the
// real `io` (needs the httpServer + CORS config at hand) and calls setIo()
// once at startup; route modules that only need to emit events import
// getIo() instead of receiving `io` as a constructor argument.
let ioInstance = null;

export function setIo(io) {
    ioInstance = io;
}

export function getIo() {
    return ioInstance;
}
