// At most one write in flight; intermediate requests share the newest state.
export function createSaveQueue(save, snapshot) {
  let requested = false;
  let running = null;
  return function flush() {
    requested = true;
    if (!running) {
      running = (async () => {
        try {
          while (requested) {
            requested = false;
            await save(snapshot());
          }
        } finally { running = null; }
      })();
    }
    return running;
  };
}
