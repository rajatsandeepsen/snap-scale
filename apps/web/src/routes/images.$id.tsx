import { Button } from "@snap-scale/ui/components/button";
import { Card, CardContent } from "@snap-scale/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2, RulerIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { MeasurementOverlay } from "@/components/measurement-overlay";
import { formatMm, imageUrl } from "@/utils/image-url";
import { orpc } from "@/utils/orpc";

import type { Route } from "./+types/images.$id";

export function meta() {
  return [{ title: "Measurement · snap-scale" }];
}

export default function ImageDetail({ params }: Route.ComponentProps) {
  const queryClient = useQueryClient();
  const queryOptions = orpc.images.get.queryOptions({
    input: { id: params.id },
  });
  const image = useQuery(queryOptions);
  const measure = useMutation(
    orpc.images.measure.mutationOptions({
      onSuccess: (row) => {
        queryClient.setQueryData(queryOptions.queryKey, row);
        queryClient.invalidateQueries({ queryKey: orpc.images.list.key() });
      },
    }),
  );

  const autoStarted = useRef(false);
  useEffect(() => {
    if (image.data && !image.data.analysis && !autoStarted.current) {
      autoStarted.current = true;
      measure.mutate({ id: params.id });
    }
  }, [image.data, measure, params.id]);

  const analysis = image.data?.analysis;

  return (
    <div className="container mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <Link
        to="/"
        className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeftIcon className="size-4" /> All uploads
      </Link>

      {image.isError ? (
        <p className="text-destructive text-sm">{image.error.message}</p>
      ) : image.isLoading || !image.data ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg border">
            <img
              src={imageUrl(image.data.id)}
              alt={image.data.filename}
              className="block w-full"
            />
            {analysis && !measure.isPending && (
              <MeasurementOverlay analysis={analysis} />
            )}
            {measure.isPending && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-sm text-white">
                <Loader2 className="size-6 animate-spin" />
                Measuring with gpt-5. This can take a minute.
              </div>
            )}
          </div>

          {measure.isError && (
            <p className="text-destructive text-sm">
              Measurement failed: {measure.error.message}
            </p>
          )}

          {analysis && !measure.isPending && (
            <Card>
              <CardContent className="grid gap-2 text-sm">
                <div className="text-lg font-semibold">
                  {analysis.main.name}: {formatMm(analysis.main.lengthMm)} ×{" "}
                  {formatMm(analysis.main.widthMm)}
                </div>
                <div className="text-muted-foreground">
                  Reference: {analysis.reference.name} (
                  {analysis.reference.widthMm} × {analysis.reference.heightMm}{" "}
                  mm,{" "}
                  {analysis.reference.source === "catalog"
                    ? "from catalog"
                    : "from web search"}
                  )
                </div>
                {analysis.notes && (
                  <p className="text-muted-foreground">{analysis.notes}</p>
                )}
                <div className="text-muted-foreground text-xs">
                  {analysis.model} · {(analysis.durationMs / 1000).toFixed(0)} s
                  · 2D estimate on the reference's surface
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            variant="outline"
            className="justify-self-start"
            disabled={measure.isPending}
            onClick={() => measure.mutate({ id: params.id })}
          >
            <RulerIcon /> {analysis ? "Measure again" : "Measure"}
          </Button>
        </>
      )}
    </div>
  );
}
