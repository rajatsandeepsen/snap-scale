import type { AppRouterClient } from "@snap-scale/api/routers/index";
import { orderClockwise } from "@snap-scale/api/measure/geometry";
import { Button } from "@snap-scale/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, CheckIcon, Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { NextActions } from "@/components/next-actions";
import { ResultImage } from "@/components/result-image";
import { StepCard, StepStage } from "@/components/step-stage";
import { UnitPicker } from "@/components/unit-picker";
import { annotateCorners } from "@/utils/annotate";
import { findMarkers, loadImageData } from "@/utils/find-markers";
import { markedUrl } from "@/utils/image-url";
import { client, orpc } from "@/utils/orpc";
import { formatLength, useUnit } from "@/utils/units";

import type { Route } from "./+types/images.$id";

type Identification = Awaited<ReturnType<AppRouterClient["images"]["identify"]>>;
type Step =
  | { kind: "loading" }
  | { kind: "identifying" }
  | { kind: "main"; ident: Identification }
  | { kind: "reference"; ident: Identification }
  | { kind: "marking" }
  | { kind: "calculating" }
  | { kind: "result" }
  | { kind: "actions" }
  | { kind: "error"; message: string };

const CHOICE_SECONDS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function meta() {
  return [{ title: "Measuring · snap-scale" }];
}

export default function ImageDetail({ params }: Route.ComponentProps) {
  const id = params.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryOptions = orpc.images.get.queryOptions({ input: { id } });
  const image = useQuery(queryOptions);
  const unit = useUnit();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const choose = useRef<(name: string) => void>(() => {});
  const runId = useRef(0);

  const run = useCallback(async () => {
    const me = ++runId.current;
    const live = () => runId.current === me;
    const go = (s: Step) => live() && setStep(s);
    try {
      go({ kind: "identifying" });
      const ident = await client.images.identify({ id });
      const name = await new Promise<string>((resolve) => {
        choose.current = resolve;
        go({ kind: "main", ident });
      });
      if (!live()) return;
      const chosen = { ...ident, main: { ...ident.main, name } };
      go({ kind: "reference", ident: chosen });
      const marking = client.images.mark({ id, identification: chosen });
      await Promise.race([sleep(3000), marking]);
      go({ kind: "marking" });
      const { version } = await marking;
      go({ kind: "calculating" });
      const marked = await loadImageData(markedUrl(id, version));
      const found = findMarkers(marked);
      if (!found.reference || !found.main) {
        throw new Error("The marker dots didn't come out clearly.");
      }
      const reference = orderClockwise(found.reference);
      const main = orderClockwise(found.main);
      const row = await client.images.saveMarkers({
        id,
        version,
        width: found.width,
        height: found.height,
        reference,
        main,
        annotated: await annotateCorners(marked, reference, main),
      });
      if (!live()) return;
      queryClient.setQueryData(queryOptions.queryKey, row);
      go({ kind: "result" });
    } catch (error) {
      go({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [id, queryClient, queryOptions.queryKey]);

  useEffect(() => {
    if (step.kind !== "loading" || !image.data) return;
    if (image.data.analysis) setStep({ kind: "result" });
    else run();
  }, [image.data, step.kind, run]);
  useEffect(() => () => void runId.current++, []);

  const analysis = image.data?.analysis;
  let card: ReactNode;
  switch (step.kind) {
    case "loading":
      card = image.isError ? (
        <StepCard title="Image not found">
          <Button onClick={() => navigate("/")}>New photo</Button>
        </StepCard>
      ) : (
        <Spinner />
      );
      break;
    case "identifying":
      card = (
        <StepCard step={1} title="Looking at your photo">
          <Working>Finding the main object…</Working>
        </StepCard>
      );
      break;
    case "main":
      card = <MainChoice ident={step.ident} onDone={(name) => choose.current(name)} />;
      break;
    case "reference":
      card = (
        <StepCard step={2} title="Reference object detected">
          <div className="grid gap-1">
            <p className="text-2xl font-semibold">{step.ident.reference.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-neutral-500">
              <CheckIcon className="size-4 text-green-600" />
              {step.ident.reference.source === "web"
                ? "Searched the internet for its dimensions"
                : "Found in the standard sizes catalog"}
              : {formatLength(step.ident.reference.widthMm, unit)} ×{" "}
              {formatLength(step.ident.reference.heightMm, unit)}
            </p>
          </div>
        </StepCard>
      );
      break;
    case "marking":
      card = (
        <StepCard step={3} title="Adding points to the image">
          <Working timer>Marking the corners of both objects</Working>
        </StepCard>
      );
      break;
    case "calculating":
      card = (
        <StepCard step={4} title="Calculating pixels">
          <Working timer>Measuring every side against the reference</Working>
        </StepCard>
      );
      break;
    case "result":
      card = analysis && (
        <StepCard
          step={5}
          wide
          title={
            <span className="grid gap-1 text-center">
              <span className="text-base font-normal text-neutral-500">
                Dimension of {analysis.main.name} is
              </span>
              <span className="text-3xl font-bold tabular-nums">
                {formatLength(analysis.main.lengthMm, unit)} ×{" "}
                {formatLength(analysis.main.widthMm, unit)}
              </span>
            </span>
          }
        >
          <UnitPicker size="sm" />
          <ResultImage id={id} analysis={analysis} unit={unit} />
          <Button
            size="lg"
            className="justify-self-center"
            onClick={() => setStep({ kind: "actions" })}
          >
            Next <ArrowRightIcon />
          </Button>
        </StepCard>
      );
      break;
    case "actions":
      card = analysis && (
        <StepCard title={`What next with ${analysis.main.name}?`}>
          <UnitPicker size="sm" />
          <NextActions
            name={analysis.main.name}
            lengthMm={analysis.main.lengthMm}
            widthMm={analysis.main.widthMm}
            unit={unit}
            onBack={() => setStep({ kind: "result" })}
            onRemeasure={run}
          />
        </StepCard>
      );
      break;
    case "error":
      card = (
        <StepCard title="Couldn't measure this photo">
          <p className="text-sm text-neutral-500">{step.message}</p>
          <div className="flex gap-2">
            <Button onClick={run}>Try again</Button>
            <Button variant="outline" onClick={() => navigate("/")}>
              New photo
            </Button>
          </div>
        </StepCard>
      );
      break;
  }

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <StepStage id={step.kind}>{card}</StepStage>
    </div>
  );
}

function Spinner() {
  return <Loader2 className="mx-auto size-6 animate-spin text-neutral-400" />;
}

function Working({ children, timer = false }: { children: ReactNode; timer?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timer]);
  return (
    <p className="flex items-center gap-2 text-sm text-neutral-500">
      <Loader2 className="size-4 animate-spin" />
      {children}
      {timer && <span className="ml-auto tabular-nums">{seconds} s</span>}
    </p>
  );
}

function MainChoice({ ident, onDone }: { ident: Identification; onDone: (name: string) => void }) {
  const options = [...new Set([ident.main.name, ...ident.main.alternatives])];
  const [selected, setSelected] = useState(ident.main.name);
  const [paused, setPaused] = useState(false);
  const [draining, setDraining] = useState(false);
  const done = useRef(false);
  const finish = useCallback(
    (name: string) => {
      if (done.current) return;
      done.current = true;
      onDone(name);
    },
    [onDone],
  );

  useEffect(() => {
    requestAnimationFrame(() => setDraining(true));
  }, []);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => finish(selected), CHOICE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [paused, selected, finish]);

  return (
    <StepCard step={1} title="Main object identified">
      <p className="text-2xl font-semibold">{selected}</p>
      {options.length > 1 && (
        <select
          aria-label="Main object"
          value={selected}
          onFocus={() => setPaused(true)}
          onChange={(e) => {
            setPaused(true);
            setSelected(e.target.value);
          }}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {paused ? (
        <Button onClick={() => finish(selected)}>
          Measure {selected} <ArrowRightIcon />
        </Button>
      ) : (
        <div className="h-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-neutral-900 transition-[width] ease-linear"
            style={{ width: draining ? "0%" : "100%", transitionDuration: `${CHOICE_SECONDS}s` }}
          />
        </div>
      )}
      <Working>Looking for reference objects…</Working>
    </StepCard>
  );
}
