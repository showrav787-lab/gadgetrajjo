export const fbqTrack = (event: string, data: Record<string, any> = {}) => {
  if (typeof window.fbq !== "undefined") {
    window.fbq("track", event, data);
  } else {
    console.warn("FB Pixel not loaded yet:", event, data);
  }
};