import { Button } from "@snap-scale/ui/components/button";
import { Card, CardContent } from "@snap-scale/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUpIcon, Loader2, Trash2Icon } from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { imageUrl } from "@/utils/image-url";
import { formatLength, useUnit } from "@/utils/units";
import { orpc } from "@/utils/orpc";

import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "snap-scale" },
    {
      name: "description",
      content: "Measure objects in a photo using a known reference object",
    },
  ];
}

export default function Home() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const images = useQuery(orpc.images.list.queryOptions());
  const unit = useUnit();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.images.list.key() });

  const upload = useMutation(
    orpc.images.upload.mutationOptions({
      onSuccess: (row) => {
        invalidate();
        navigate(`/images/${row.id}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    orpc.images.delete.mutationOptions({ onSuccess: invalidate }),
  );

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload.mutate({ file });
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="container mx-auto grid max-w-3xl gap-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">snap-scale</h1>
        <p className="text-muted-foreground text-sm">
          Upload a photo with a standard object (credit card, A4 sheet, coin)
          next to the thing you want to measure.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={upload.isPending}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-sm transition-colors ${dragging ? "border-primary bg-muted" : "border-border hover:bg-muted/50"}`}
      >
        {upload.isPending ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <ImageUpIcon className="size-6" />
        )}
        <span>
          {upload.isPending
            ? "Uploading..."
            : "Drop an image or click to choose"}
        </span>
        <span className="text-muted-foreground text-xs">
          JPEG, PNG or WebP, up to 10 MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <section className="grid gap-3">
        <h2 className="font-medium">Uploads</h2>
        {images.isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : images.data?.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.data.map((image) => (
              <Card key={image.id} className="overflow-hidden py-0">
                <Link to={`/images/${image.id}`}>
                  <img
                    src={imageUrl(image.id)}
                    alt={image.filename}
                    className="aspect-square w-full object-cover"
                  />
                </Link>
                <CardContent className="flex items-center justify-between gap-2 px-3 pb-3">
                  <span className="truncate text-xs" title={image.filename}>
                    {image.analysis
                      ? `${image.analysis.main.name}: ${formatLength(image.analysis.main.lengthMm, unit)} × ${formatLength(image.analysis.main.widthMm, unit)}`
                      : image.filename}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete image"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: image.id })}
                  >
                    <Trash2Icon />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No images yet.</p>
        )}
      </section>
    </div>
  );
}
