import { Button } from "@snap-scale/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { CameraIcon, ImageUpIcon, Loader2 } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Webcam } from "@/components/webcam";
import { orpc } from "@/utils/orpc";

export function meta() {
  return [
    { title: "snap-scale" },
    { name: "description", content: "Measure objects in a photo using a known reference object" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [webcam, setWebcam] = useState(false);

  const upload = useMutation(
    orpc.images.upload.mutationOptions({
      onSuccess: (row) => navigate(`/images/${row.id}`),
      onError: (error) => toast.error(error.message),
    }),
  );
  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload.mutate({ file });
  };
  // Phones open the camera straight from a capture input; desktops get a live webcam view.
  const openCamera = () => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch && "getUserMedia" in (navigator.mediaDevices ?? {})) setWebcam(true);
    else cameraRef.current?.click();
  };
  const webcamUnavailable = useCallback(() => {
    setWebcam(false);
    toast.error("Camera unavailable, choose an image instead");
    fileRef.current?.click();
  }, []);
  const closeWebcam = useCallback(() => setWebcam(false), []);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: whole-page drop target; the buttons are the accessible way in
    <div
      className="grid min-h-svh place-items-center p-4 sm:p-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div
        className={`animate-in fade-in zoom-in-95 grid w-full max-w-md justify-items-center gap-6 rounded-3xl border-2 border-dashed p-8 text-center sm:p-10 duration-500 ${dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
      >
        {upload.isPending ? (
          <Loader2 className="size-10 animate-spin text-neutral-400" />
        ) : (
          <ImageUpIcon className="size-10 text-neutral-400" />
        )}
        <div className="grid gap-1">
          <p className="text-lg font-medium">
            {upload.isPending ? (
              "Uploading…"
            ) : (
              <>
                <span className="sm:hidden">Snap a photo</span>
                <span className="hidden sm:inline">Drop an image here</span>
              </>
            )}
          </p>
          <p className="text-sm text-neutral-500">
            Include a card, coin or sheet of paper next to the object
          </p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:justify-center">
          <Button
            size="lg"
            className="max-sm:bg-background max-sm:text-foreground max-sm:border-border"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <ImageUpIcon /> Choose image
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="max-sm:bg-primary max-sm:text-primary-foreground order-first max-sm:border-transparent sm:order-none"
            disabled={upload.isPending}
            onClick={openCamera}
          >
            <CameraIcon /> Open camera
          </Button>
        </div>
      </div>
      {webcam && (
        <Webcam
          onCapture={(file) => {
            setWebcam(false);
            upload.mutate({ file });
          }}
          onClose={closeWebcam}
          onUnavailable={webcamUnavailable}
        />
      )}
      {[fileRef, cameraRef].map((ref, i) => (
        <input
          key={i}
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture={ref === cameraRef ? "environment" : undefined}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      ))}
    </div>
  );
}
