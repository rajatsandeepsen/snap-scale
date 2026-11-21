import { orderClockwise } from "@snap-scale/api/measure/geometry";
import { Button } from "@snap-scale/ui/components/button";
import { Card, CardContent } from "@snap-scale/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2, RulerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { MeasurementOverlay } from "@/components/measurement-overlay";
import { SidesTable } from "@/components/sides-table";
import { UnitPicker } from "@/components/unit-picker";
import { annotateCorners } from "@/utils/annotate";
import { findMarkers, loadImageData } from "@/utils/find-markers";
import { imageUrl, markedUrl } from "@/utils/image-url";
import { client, orpc } from "@/utils/orpc";
import { formatLength, useUnit } from "@/utils/units";

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
  const measure = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      setStage("marking");
      const { version } = await client.images.measure({ id });
      setStage("detecting");
      const marked = await loadImageData(markedUrl(id, version));
      const found = findMarkers(marked);
      if (!found.reference || !found.main) {
        throw new Error("Couldn't find all 8 marker dots in the marked image. Try Measure again.");
      }
      const reference = orderClockwise(found.reference);
      const main = orderClockwise(found.main);
      setStage("rating");
      return client.images.saveMarkers({
        id,
        version,
        width: found.width,
        height: found.height,
        reference,
        main,
        annotated: await annotateCorners(marked, reference, main),
      });
    },
    onSuccess: (row) => {
      queryClient.setQueryData(queryOptions.queryKey, row);
      queryClient.invalidateQueries({ queryKey: orpc.images.list.key() });
    },
  });
  const [stage, setStage] = useState<"marking" | "detecting" | "rating">("marking");

  const autoStarted = useRef(false);
  useEffect(() => {
    if (image.data && !image.data.analysis && !autoStarted.current) {
      autoStarted.current = true;
      measure.mutate({ id: params.id });
    }
  }, [image.data, measure, params.id]);

  const analysis = image.data?.analysis;
  const unit = useUnit();

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
              src={
                analysis?.markedVersion && !measure.isPending
                  ? markedUrl(image.data.id, analysis.markedVersion)
                  : imageUrl(image.data.id)
              }
              alt={image.data.filename}
              className="block w-full"
            />
            {analysis && !measure.isPending && <MeasurementOverlay analysis={analysis} />}
            {measure.isPending && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-sm text-white">
                <Loader2 className="size-6 animate-spin" />
                {stage === "marking"
                  ? "gpt-5 is finding the objects and gpt-image-2 is marking their corners. This takes 1–2 minutes."
                  : stage === "detecting"
                    ? "Finding the marker dots…"
                    : "gpt-5 is rating how clear each numbered side is…"}
              </div>
            )}
          </div>

          {measure.isError && (
            <p className="text-destructive text-sm">Measurement failed: {measure.error.message}</p>
          )}

          {analysis && !measure.isPending && (
            <Card>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-lg font-semibold">
                    {analysis.main.name}: {formatLength(analysis.main.lengthMm, unit)} ×{" "}
                    {formatLength(analysis.main.widthMm, unit)}
                  </div>
                  <UnitPicker />
                </div>
                <div className="text-muted-foreground">
                  Reference: {analysis.reference.name} (
                  {formatLength(analysis.reference.widthMm, unit)} ×{" "}
                  {formatLength(analysis.reference.heightMm, unit)},{" "}
                  {analysis.reference.source === "catalog" ? "from catalog" : "from web search"})
                </div>
                {analysis.main.edges && analysis.reference.edges && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SidesTable
                      title={`${analysis.main.name} (measured)`}
                      prefix="M"
                      edges={analysis.main.edges}
                      unit={unit}
                      markUsed
                    />
                    <SidesTable
                      title={`${analysis.reference.name} (known size)`}
                      prefix="R"
                      edges={analysis.reference.edges}
                      unit={unit}
                    />
                  </div>
                )}
                {analysis.main.edges && (
                  <p className="text-muted-foreground text-xs">
                    Bold sides set the result: of each pair of opposite sides, the one gpt-5 rated
                    clearer is used. Hover a side for its reason.
                  </p>
                )}
                {analysis.reference.rebuiltCorner && (
                  <p className="text-muted-foreground">
                    Reference corner R{analysis.reference.rebuiltCorner} looked hidden, so it was
                    rebuilt from the other three.
                  </p>
                )}
                {analysis.reference.edges?.some((e) => e.priority <= 2) &&
                  !analysis.reference.rebuiltCorner && (
                    <p className="text-amber-600 dark:text-amber-400">
                      Some reference sides look unreliable, so this result may be off. Try a
                      flatter, top-down photo.
                    </p>
                  )}
                {analysis.notes && <p className="text-muted-foreground">{analysis.notes}</p>}
                <div className="text-muted-foreground text-xs">
                  {analysis.model} · {(analysis.durationMs / 1000).toFixed(0)} s · 2D estimate on
                  the reference's surface
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
