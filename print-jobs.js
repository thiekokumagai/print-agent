// Conta as impressões em andamento para o auto-update não reiniciar o app no meio de uma.
// Depois que a última termina, espera um respiro (graceMs) para o "marcar_como_impresso" sair pelo socket.
// Um trabalho que nunca termina (janela travada) é descartado após staleMs para não bloquear o update para sempre.
function createPrintJobs({ graceMs = 5000, staleMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const active = new Map();
  let nextId = 1;
  let lastFinishedAt = -Infinity;

  function begin() {
    const id = nextId++;
    active.set(id, now());
    let done = false;
    return function finish() {
      if (done) return;
      done = true;
      active.delete(id);
      lastFinishedAt = now();
    };
  }

  function isBusy() {
    const t = now();
    for (const [id, startedAt] of active) {
      if (t - startedAt > staleMs) active.delete(id);
    }
    return active.size > 0 || t - lastFinishedAt < graceMs;
  }

  return { begin, isBusy };
}

module.exports = { createPrintJobs };
