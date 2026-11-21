import { Button } from "@snap-scale/ui/components/button";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Full-screen live camera for devices where a file input can't open the camera directly. */
export function Webcam({
  onCapture,
  onClose,
  onUnavailable,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  const stop = (s?: MediaStream) => {
    for (const t of s?.getTracks() ?? []) t.stop();
  };

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        stream = s;
        if (cancelled) return stop(s);
        if (video.current) video.current.srcObject = s;
      })
      .catch(onUnavailable);
    return () => {
      cancelled = true;
      stop(stream);
    };
  }, [onUnavailable]);

  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => blob && onCapture(new File([blob], "camera.jpg", { type: "image/jpeg" })),
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 grid grid-rows-[1fr_auto] bg-black duration-300">
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        onLoadedData={() => setReady(true)}
        className="size-full min-h-0 object-contain"
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="Close camera"
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:bg-white/10 hover:text-white"
      >
        <XIcon />
      </Button>
      <div className="grid place-items-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label="Take photo"
          disabled={!ready}
          onClick={capture}
          className="size-18 rounded-full border-4 border-white bg-white/90 transition-transform active:scale-90 disabled:opacity-40"
        />
      </div>
    </div>
  );
}
