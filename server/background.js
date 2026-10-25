// The local worker continues to run normally. A function adapter can retain
// these promises with waitUntil instead of losing them when the response ends.
export function deferTask(req, task, message) {
  const promise = Promise.resolve().then(task).catch(() => console.error(message));
  req.backgroundTasks?.push(promise);
  return promise;
}
