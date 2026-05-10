import { useEffect, useRef } from "react";

export function useBarcodeScan(
  onScan: (code: string) => void,
  disabled: boolean = false
) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (disabled) return;

    function handleGlobalKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Only intercept events from: document body (direct scanner hardware input)
      // and ScanInput itself. Ignore any other input/textarea elements.
      const isBodyOrNoTarget = target === document.body || !target.tagName;
      const isInputOrTextarea = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      
      if (isInputOrTextarea && !isBodyOrNoTarget) {
        // When user is typing manually in ScanInput, the manual Enter handler
        // in the component itself will deal with it. We only accumulate buffer
        // from events that come from the body (scanner hardware bypass).
        return;
      }

      const now = Date.now();

      if (e.key === "Enter") {
        if (bufferRef.current.length >= 6 && now - lastKeyTimeRef.current < 500) {
          // Scanner input detected: many chars very fast + Enter
          onScan(bufferRef.current.trim());
        }
        bufferRef.current = "";
        return;
      }

      // Reset buffer if too much time passed (manual typing vs scanner speed)
      if (now - lastKeyTimeRef.current > 500) {
        bufferRef.current = "";
      }

      // Only accumulate single character keys
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
      
      lastKeyTimeRef.current = now;
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [disabled, onScan]);
}
