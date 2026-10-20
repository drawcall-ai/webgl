import { Worker as Thread, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const workers = new Set();
const stopping = new Set();

function errorEvent(error) {
  const event = new Event('error', { cancelable: true });
  Object.assign(event, { error, message: error.message, filename: '', lineno: 0, colno: 0 });
  return event;
}

// Classic workers only. Blob URLs are captured in the creating thread before revocation.
export class Worker extends EventTarget {
  onmessage = null;
  onmessageerror = null;
  onerror = null;
  #thread;
  #stopped = false;
  constructor(url, { type = 'classic', name = '', credentials = 'same-origin' } = {}) {
    super();
    if (type !== 'classic') throw new TypeError('This Worker host supports classic workers only');
    if (credentials !== 'same-origin') throw new TypeError('Worker credentials are not implemented');
    const location = new URL(String(url));
    const blob = location.protocol === 'blob:' ? resolveObjectURL(location.href) : undefined;
    if (location.protocol === 'blob:' && !blob) throw new DOMException('Unknown Blob URL', 'NetworkError');
    if (!['blob:', 'data:', 'file:', 'http:', 'https:'].includes(location.protocol)) throw new TypeError('Unsupported Worker URL protocol');
    // Classic workers do not inherit Node CLI flags such as --input-type.
    this.#thread = new Thread(new URL(import.meta.url), { execArgv: [], workerData: { workerHost: true, blob, url: location.href, name } });
    workers.add(this);
    for (const type of ['message', 'messageerror', 'error']) {
      this.addEventListener(type, event => {
        if (this['on' + type]?.call(this, event) === true && type === 'error') event.preventDefault();
      });
    }
    this.#thread.on('message', data => this.dispatchEvent(new MessageEvent('message', { data })));
    this.#thread.on('messageerror', error => this.dispatchEvent(new MessageEvent('messageerror', { data: error })));
    this.#thread.on('error', error => {
      // An unhandled decoder failure must stop a pending loader, not hang it.
      if (this.dispatchEvent(errorEvent(error))) throw error;
    });
    this.#thread.on('exit', () => workers.delete(this));
  }
  postMessage(message, options = []) {
    if (this.#stopped) return;
    this.#thread.postMessage(message, Array.isArray(options) ? options : options.transfer);
  }
  terminate() {
    if (this.#stopped) return;
    this.#stopped = true;
    const pending = this.#thread.terminate();
    stopping.add(pending);
    pending.then(() => stopping.delete(pending), error => { stopping.delete(pending); throw error; });
  }
}

export function installWorkers() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { value: Worker, configurable: true, writable: true });
  return async () => {
    try {
      for (const worker of workers) worker.terminate();
      await Promise.all(stopping);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'Worker', previous);
      else delete globalThis.Worker;
    }
  };
}

if (!isMainThread && workerData?.workerHost) {
  const { blob, url, name } = workerData;
  const events = new EventTarget();
  const scope = {
    name, location: new URL(url), onmessage: null, onmessageerror: null, onerror: null,
    console, performance, crypto, fetch, URL, URLSearchParams, Blob, TextEncoder, TextDecoder,
    Event, EventTarget, MessageEvent, DOMException, WebAssembly, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    postMessage: (data, options = []) => parentPort.postMessage(data, Array.isArray(options) ? options : options.transfer),
    close: () => parentPort.close(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    importScripts: () => { throw new Error('Synchronous importScripts is not implemented'); },
  };
  scope.self = scope;
  const source = blob ? await blob.text() : url.startsWith('file:') ? await readFile(new URL(url), 'utf8') : await fetch(url).then(response => {
    if (!response.ok) throw new Error('Worker script HTTP ' + response.status);
    return response.text();
  });
  runInNewContext(source, scope, { filename: url });
  parentPort.on('message', data => {
    const event = new MessageEvent('message', { data });
    scope.onmessage?.call(scope, event);
    events.dispatchEvent(event);
  });
}
