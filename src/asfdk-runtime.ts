let asfdkPromise: Promise<typeof import("@neurolift-technologies/asfdk")> | undefined;

export function loadAsfdk(): Promise<typeof import("@neurolift-technologies/asfdk")> {
  if (!asfdkPromise) {
    asfdkPromise = import("@neurolift-technologies/asfdk");
  }

  return asfdkPromise;
}
