/** Publish the pending call state before starting fallible async setup. */
export function launchCallStartup(
  showConnecting: () => void,
  setup: () => Promise<void>,
  onError: (error: unknown) => void
): Promise<void> {
  showConnecting();
  return Promise.resolve().then(setup).catch(onError);
}
