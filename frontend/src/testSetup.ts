// Exercise the animation library's supported requestAnimationFrame fallback.
// Happy DOM 21 implements WAAPI cancellation promises, whereas Framer 11 does
// not consume their rejection on unmount. These are lifecycle/render tests,
// not browser animation tests; don't swallow unhandled errors globally.
if (typeof Element !== "undefined") {
  Reflect.deleteProperty(Element.prototype, "animate");
}
