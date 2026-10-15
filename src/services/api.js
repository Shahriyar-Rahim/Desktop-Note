export function getApi() {
  if (typeof window === "undefined" || !window.api) {
    throw new Error(
      "This app must run inside Electron (window.api is missing).",
    );
  }
  return window.api;
}

export const hasApi = () =>
  typeof window !== "undefined" && Boolean(window.api);

// Turn any thrown value into a short message that is safe to show.
export function errorMessage(err, fallback = "Something went wrong.") {
  if (err && typeof err.message === "string" && err.message) return err.message;
  return fallback;
}
