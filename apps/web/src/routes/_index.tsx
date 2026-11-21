import { Button } from "@snap-scale/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { CameraIcon, ImageUpIcon, Loader2 } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

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
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: whole-page drop target; the buttons are the accessible way in
    <div
      className="grid min-h-svh place-items-center p-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div
        className={`animate-in fade-in zoom-in-95 grid w-full max-w-md justify-items-center gap-6 rounded-3xl border-2 border-dashed p-10 text-center duration-500 ${dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
      >
        {upload.isPending ? (
          <Loader2 className="size-10 animate-spin text-neutral-400" />
        ) : (
          <ImageUpIcon className="size-10 text-neutral-400" />
        )}
        <div className="grid gap-1">
          <p className="text-lg font-medium">
            {upload.isPending ? "Uploading…" : "Drop an image here"}
          </p>
          <p className="text-sm text-neutral-500">
            Include a card, coin or sheet of paper next to the object
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <ImageUpIcon /> Choose image
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => cameraRef.current?.click()}
          >
            <CameraIcon /> Open camera
          </Button>
        </div>
      </div>
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
